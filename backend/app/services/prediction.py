from datetime import datetime, timedelta
from hashlib import sha256
import json
import logging
from statistics import NormalDist

from ..clock import Clock, as_hong_kong, ceil_minutes
from ..calibration import CALIBRATION_POLICY
from ..config import (
    BALANCED_COST_WEIGHT,
    BALANCED_RISK_WEIGHT,
    CONFIDENCE_LEVEL,
    DEFAULT_SAFETY_BUFFER_MINUTES,
    MAX_TARGET_HORIZON_HOURS,
    MIN_TARGET_LEAD_MINUTES,
    MODEL_VERSION,
    RISK_HIGH_THRESHOLD_PERCENT,
    RISK_MEDIUM_THRESHOLD_PERCENT,
    SCENARIO_EVENT_MULTIPLIERS,
    SCENARIO_HOLIDAY_MULTIPLIER,
    SCENARIO_MAX_MULTIPLIER,
    SCENARIO_WEATHER_MULTIPLIERS,
    SHENZHEN_REFERENCE_PATH,
)
from ..exceptions import DomainValidationError, ErrorCode
from ..repositories import DemoRepository
from ..ml.shadow import ShadowWaitModel
from ..ml.scenario_model import ScenarioWaitModel
from ..ml.shenzhen_reference import cross_source_validation
from ..schemas.common import Priority
from ..schemas.prediction import PredictionPreferences, PredictionRequest
from .wait_forecast import WaitForecastService


logger = logging.getLogger(__name__)


class PredictionService:
    """Compare route choices using a time-weighted statistical wait model."""

    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        safety_buffer_minutes: int = DEFAULT_SAFETY_BUFFER_MINUTES,
        shadow_model: ShadowWaitModel | None = None,
        scenario_model: ScenarioWaitModel | None = None,
    ):
        self._repository = repository
        self._clock = clock
        self._forecast = WaitForecastService(repository, clock)
        self._safety_buffer_minutes = safety_buffer_minutes
        self._shadow_model = shadow_model
        self._scenario_model = scenario_model

    @staticmethod
    def _active_event_impact(scenario: dict, port_name: str, direction: str, target_time: datetime) -> tuple[str, list[str]]:
        levels = {"low": 1, "medium": 2, "high": 3}
        active = []
        target_minutes = target_time.hour * 60 + target_time.minute
        for event in scenario.get("events", []):
            if port_name not in event["affected_ports"] or event.get("direction") not in {None, direction}:
                continue
            start_hour, start_minute = map(int, event["start_time"].split(":"))
            end_hour, end_minute = map(int, event["end_time"].split(":"))
            start = start_hour * 60 + start_minute
            end = end_hour * 60 + end_minute
            in_window = start <= target_minutes < end if start <= end else target_minutes >= start or target_minutes < end
            if in_window:
                active.append(event)
        if not active:
            return "none", []
        strongest = max(active, key=lambda item: levels[item["impact"]])["impact"]
        return strongest, [item["name"] for item in active]

    def get_locations(self) -> dict:
        return self._repository.get_locations()

    @staticmethod
    def _scenario_multiplier(scenario: dict, event_impact: str) -> tuple[float, dict]:
        weather = SCENARIO_WEATHER_MULTIPLIERS[scenario["weather"]]
        holiday = SCENARIO_HOLIDAY_MULTIPLIER if scenario["is_holiday"] else 1.0
        event = SCENARIO_EVENT_MULTIPLIERS[event_impact]
        raw = weather * holiday * event
        return min(SCENARIO_MAX_MULTIPLIER, raw), {
            "weather": weather,
            "holiday": holiday,
            "event": event,
            "raw": raw,
            "cap": SCENARIO_MAX_MULTIPLIER,
        }

    @staticmethod
    def _risk_probability(
        predicted_wait: float,
        sigma: float,
        available_border_minutes: float,
    ) -> tuple[str, int]:
        distribution = NormalDist(mu=predicted_wait, sigma=sigma)
        late_probability = 1 - distribution.cdf(available_border_minutes)
        late_risk = min(99, max(1, round(late_probability * 100)))
        if late_risk >= RISK_HIGH_THRESHOLD_PERCENT:
            return "high", late_risk
        if late_risk >= RISK_MEDIUM_THRESHOLD_PERCENT:
            return "medium", late_risk
        return "low", late_risk

    def _prediction_for_port(
        self,
        port: dict,
        origin_id: str,
        destination_id: str,
        direction: str,
        target_time,
        current_time,
        max_budget: int | None,
        reports: list[dict],
        shadow_observations: list[dict],
        record_shadow: bool,
        prediction_inputs: dict,
    ) -> dict:
        access = self._repository.get_access_leg(direction, origin_id, port["id"])
        onward = self._repository.get_onward_leg(
            direction,
            port["id"],
            destination_id,
        )
        estimate = self._forecast.estimate(
            port["name"],
            target_time,
            current_time,
            reports,
        )
        statistical_value = estimate["value"]
        predicted_value = statistical_value
        sigma = estimate["standard_deviation"]
        prediction_engine = "statistical_fallback"
        scenario_delta = 0
        scenario = prediction_inputs["scenario"]
        event_impact, active_event_names = self._active_event_impact(scenario, port["name"], direction, target_time)
        scenario_multiplier, scenario_components = self._scenario_multiplier(scenario, event_impact)
        try:
            official = self._repository.external_data.calibration_context(
                port["id"], direction, current_time, target_time
            )
        except Exception:
            logger.warning("官方校准特征读取失败", exc_info=True)
            official = {
                "status": "missing",
                "traffic": {"available": False, "pressure": 1.0, "raw_pressure": 1.0, "reason": "query_failed"},
                "queue": {"available": False, "effective_weight": 0.0, "multiplier": 1.0, "reason": "query_failed"},
                "feature_version": "missing",
            }
        traffic = official["traffic"]
        queue = official["queue"]
        traffic_pressure = float(traffic.get("pressure", 1.0))
        raw_traffic_pressure = float(traffic.get("raw_pressure", traffic_pressure))
        traffic["distribution"] = (
            self._scenario_model.traffic_distribution_status(raw_traffic_pressure)
            if self._scenario_model is not None
            else {"status": "unknown", "raw_pressure": raw_traffic_pressure}
        )
        traffic["model_embedded"] = False
        traffic["runtime_adjustment_minutes"] = 0.0
        queue["adjustment_minutes"] = 0.0
        raw_model_value = predicted_value
        scenario_adjusted_value = predicted_value
        queue_adjusted_value = predicted_value
        crowdsource_adjustment = 0.0
        if self._scenario_model is not None:
            v2_result = self._scenario_model.predict(
                port=port["name"], direction=direction, timestamp=target_time,
                weather=scenario["weather"], is_holiday=scenario["is_holiday"], event_impact=event_impact,
                traffic_pressure=traffic_pressure, traffic_available=traffic.get("available", False),
            )
            if v2_result is not None:
                raw_v2_value, residual_q90 = v2_result
                raw_model_value = raw_v2_value
                traffic["model_embedded"] = True
                scenario_adjusted_value = raw_v2_value * scenario_multiplier
                queue_adjusted_value = scenario_adjusted_value * (
                    1 + float(queue.get("effective_weight", 0.0))
                    * (float(queue.get("multiplier", 1.0)) - 1)
                )
                crowd_mean = estimate["crowdsource_mean"]
                crowd_weight = estimate["crowdsource_weight"]
                predicted_value = queue_adjusted_value
                if crowd_mean is not None:
                    predicted_value = (
                        queue_adjusted_value * (1 - crowd_weight)
                        + crowd_mean * crowd_weight
                    )
                queue["adjustment_minutes"] = round(queue_adjusted_value - scenario_adjusted_value, 4)
                crowdsource_adjustment = predicted_value - queue_adjusted_value
                calibration_delta = abs(predicted_value - raw_v2_value)
                base_sigma = max(1.0, residual_q90 / 1.645)
                sigma = (base_sigma ** 2 + (calibration_delta * 0.25) ** 2) ** 0.5
                prediction_engine = "v2_2_transparent_hybrid"
                default_value = raw_v2_value * (1 + float(queue.get("effective_weight", 0.0)) * (float(queue.get("multiplier", 1.0)) - 1))
                if crowd_mean is not None:
                    default_value = default_value * (1 - crowd_weight) + crowd_mean * crowd_weight
                scenario_delta = round(predicted_value - default_value)
                estimate["factors"] = [
                    {
                        "code": "ai_v2_2_base",
                        "label": "AI V2.2 基础等待",
                        "value_minutes": round(raw_v2_value, 1),
                        "calibrated_value_minutes": round(predicted_value, 1),
                        "detail": f"口岸、方向、时间与香港官方客流压力 {traffic_pressure:.2f}",
                    },
                    {"code": "scenario_weather", "label": "天气透明校准", "value_multiplier": scenario_components["weather"], "value_minutes": round(raw_v2_value * (scenario_components["weather"] - 1), 1), "detail": scenario["weather"]},
                    {"code": "scenario_holiday", "label": "节假日透明校准", "value_multiplier": scenario_components["holiday"], "value_minutes": round(raw_v2_value * scenario_components["weather"] * (scenario_components["holiday"] - 1), 1), "detail": "节假日" if scenario["is_holiday"] else "普通日期"},
                    {"code": "scenario_event", "label": "突发事件透明校准", "value_multiplier": scenario_components["event"], "value_minutes": round(scenario_adjusted_value - raw_v2_value * scenario_components["weather"] * scenario_components["holiday"], 1), "detail": f"{event_impact} · {'、'.join(active_event_names) if active_event_names else '无活动事件'}"},
                    {"code": "official_traffic", "label": "官方历史客流压力", "detail": (f"预计 {traffic.get('expected_count')} 人 / 常态 {traffic.get('baseline_count')} 人" if traffic.get("available") else "官方客流不可用，使用中性压力")},
                    {"code": "official_queue", "label": "官方15分钟拥堵校准", "effective_weight": queue.get("effective_weight", 0.0), "detail": (f"居民 {queue.get('resident_level') or '—'} · 访客 {queue.get('visitor_level') or '—'}" if queue.get("available") else "等级缺失或过期，未参与计算")},
                    {"code": "scenario_delta", "label": "相对默认场景变化", "value_minutes": scenario_delta, "detail": "与同一口岸、方向和时间的晴天无事件场景比较"},
                    {"code": "uncertainty", "label": "V2 验证残差区间", "standard_deviation_minutes": round(sigma, 2)},
                ] + [factor for factor in estimate["factors"] if factor["code"] not in {"uncertainty"}]
                if active_event_names:
                    estimate["factors"].append({"code": "scenario_event", "label": "自定义未来事件", "detail": "、".join(active_event_names)})
        if prediction_engine == "statistical_fallback":
            traffic_multiplier = max(0.85, min(1.30, 1 + 0.35 * (traffic_pressure - 1)))
            raw_model_value = float(estimate["uncalibrated_value"])
            traffic_adjusted = raw_model_value * traffic_multiplier
            traffic["runtime_adjustment_minutes"] = round(traffic_adjusted - raw_model_value, 4)
            scenario_adjusted_value = traffic_adjusted * scenario_multiplier
            queue_adjusted_value = scenario_adjusted_value * (1 + float(queue.get("effective_weight", 0.0)) * (float(queue.get("multiplier", 1.0)) - 1))
            queue["adjustment_minutes"] = round(queue_adjusted_value - scenario_adjusted_value, 4)
            crowd_mean = estimate["crowdsource_mean"]
            crowd_weight = estimate["crowdsource_weight"]
            predicted_value = queue_adjusted_value
            if crowd_mean is not None:
                predicted_value = queue_adjusted_value * (1 - crowd_weight) + crowd_mean * crowd_weight
            crowdsource_adjustment = predicted_value - queue_adjusted_value
            calibration_delta = abs(predicted_value - raw_model_value)
            sigma = (sigma ** 2 + (calibration_delta * 0.25) ** 2) ** 0.5
            estimate["factors"] = [
                {"code": "scenario_formula", "label": "课堂场景透明校准", "value_multiplier": scenario_multiplier, "value_minutes": round(scenario_adjusted_value - traffic_adjusted, 1), "detail": f"天气×节假日×事件，上限 {SCENARIO_MAX_MULTIPLIER:.2f}"},
                {"code": "official_traffic", "label": "官方历史客流压力", "detail": f"压力 {traffic_pressure:.2f} · 统计降级校准"},
                {"code": "official_queue", "label": "官方15分钟拥堵校准", "effective_weight": queue.get("effective_weight", 0.0), "detail": "缺失或过期时权重为0"},
            ] + estimate["factors"]
        shenzhen_validation = cross_source_validation(
            SHENZHEN_REFERENCE_PATH,
            port_name=port["name"],
            hong_kong_pressure=traffic_pressure,
        )
        sigma *= float(shenzhen_validation["uncertainty_multiplier"])
        estimate["factors"].append({
            "code": "shenzhen_cross_check",
            "label": "深圳官方快照交叉核验",
            "effective_weight": 0.0,
            "detail": (
                f"两侧压力一致度 {shenzhen_validation['agreement_percent']}%，只调整区间、不重复相加"
                if shenzhen_validation["available"] else shenzhen_validation["reason"]
            ),
        })
        official_calibration = {
            "status": official["status"],
            "feature_version": official["feature_version"],
            "calibration_version": CALIBRATION_POLICY.version,
            "traffic": traffic,
            "queue": queue,
            "shenzhen_validation": shenzhen_validation,
            "raw_model_wait_minutes": round(raw_model_value, 2),
            "scenario_adjusted_wait_minutes": round(scenario_adjusted_value, 2),
            "queue_adjusted_wait_minutes": round(queue_adjusted_value, 2),
            "crowdsource_adjustment_minutes": round(crowdsource_adjustment, 2),
            "calibrated_wait_minutes": round(predicted_value, 2),
            "uncertainty_minutes": round(sigma, 2),
        }
        if record_shadow:
            self._append_shadow_observation(
                shadow_observations=shadow_observations,
                port=port,
                target_time=target_time,
                current_time=current_time,
                statistical_wait=statistical_value,
                prediction_inputs=prediction_inputs,
            )
        z_score = NormalDist().inv_cdf(0.5 + CONFIDENCE_LEVEL / 2)
        lower = max(1, round(predicted_value - z_score * sigma))
        upper = round(predicted_value + z_score * sigma)
        wait = max(1, round(predicted_value))
        total_time = access["duration"] + wait + onward["duration"]
        total_cost = access["cost"] + onward["cost"]
        estimated_arrival = current_time + timedelta(minutes=total_time)
        latest_departure = target_time - timedelta(
            minutes=total_time + self._safety_buffer_minutes
        )
        buffer_minutes = int((target_time - estimated_arrival).total_seconds() / 60)
        available_border_minutes = (
            (target_time - current_time).total_seconds() / 60
            - access["duration"]
            - onward["duration"]
        )
        risk_level, late_risk = self._risk_probability(
            predicted_value,
            sigma,
            available_border_minutes,
        )
        return {
            "port_id": port["id"],
            "name": port["name"],
            "name_en": port["name_en"],
            "predicted_wait_time": wait,
            "confidence_interval": [lower, upper],
            "risk_level": risk_level,
            "late_risk_percent": late_risk,
            "total_time": total_time,
            "total_cost": total_cost,
            "estimated_arrival": estimated_arrival,
            "latest_departure": latest_departure,
            "buffer_minutes": buffer_minutes,
            "on_time": estimated_arrival <= target_time,
            "within_budget": max_budget is None or total_cost <= max_budget,
            "crowdsource_enhanced": estimate["crowdsource_count"] > 0,
            "crowdsource_count": estimate["crowdsource_count"],
            "route": {
                "steps": [
                    access,
                    {
                        "mode": "border",
                        "label": f"{port['name']}口岸通关",
                        "duration": wait,
                        "cost": 0,
                    },
                    onward,
                ]
            },
            "anomalies": port.get("anomalies", []),
            "factors": estimate["factors"],
            "historical_sample_count": estimate["sample_count"],
            "uncertainty_minutes": round(sigma, 2),
            "prediction_engine": prediction_engine,
            "scenario_delta_minutes": scenario_delta,
            "official_calibration": official_calibration,
            "_statistical_wait_minutes": statistical_value,
        }

    def _append_shadow_observation(
        self,
        *,
        shadow_observations: list[dict],
        port: dict,
        target_time,
        current_time,
        statistical_wait: float,
        prediction_inputs: dict,
    ) -> None:
        if self._shadow_model is None:
            return
        shadow_wait = self._shadow_model.predict(
            port=port["name"],
            timestamp=target_time,
            weather="clear" if prediction_inputs["weather"] == "clear" else "rain",
            is_holiday=prediction_inputs["is_holiday"],
        )
        status = self._shadow_model.status
        shadow_observations.append(
            {
                "generated_at": current_time.isoformat(),
                "target_time": target_time.isoformat(),
                "port_id": port["id"],
                "port_name": port["name"],
                "statistical_wait_minutes": round(statistical_wait, 4),
                "shadow_wait_minutes": (
                    round(shadow_wait, 4) if shadow_wait is not None else None
                ),
                "difference_minutes": (
                    round(shadow_wait - statistical_wait, 4)
                    if shadow_wait is not None
                    else None
                ),
                "status": "available" if shadow_wait is not None else "unavailable",
                "model_version": status.model_version,
                "reason": status.reason,
            }
        )

    def _save_shadow_observations(self, observations: list[dict]) -> None:
        if not observations:
            return
        try:
            self._repository.save_shadow_observations(observations)
        except Exception:
            logger.warning("AI v1 影子模型观测记录失败", exc_info=True)

    def _official_features_for_run(
        self,
        port_id: str,
        direction: str,
        generated_at: datetime,
    ) -> dict:
        try:
            return self._repository.external_data.features_as_of(
                port_id,
                direction,
                generated_at,
            )
        except Exception:
            logger.warning("官方点时特征读取失败，V1 继续使用原有输入", exc_info=True)
            payload = {
                "as_of": generated_at.isoformat(),
                "status": "missing",
                "resident_queue": {"available": False, "reason": "query_failed"},
                "visitor_queue": {"available": False, "reason": "query_failed"},
                "passenger_traffic": {"available": False, "reason": "query_failed"},
            }
            canonical = json.dumps(
                payload,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            payload["feature_version"] = sha256(canonical.encode()).hexdigest()[:16]
            return payload

    def _save_forecast_run(
        self,
        *,
        predictions: list[dict],
        shadow_observations: list[dict],
        reports: list[dict],
        query: dict,
        generated_at: datetime,
        target_time: datetime,
        prediction_inputs: dict,
        model_version: str,
    ) -> str | None:
        official_by_port = {
            prediction["port_id"]: self._official_features_for_run(
                prediction["port_id"],
                query["direction"],
                generated_at,
            )
            for prediction in predictions
        }
        run_identity = json.dumps(
            {
                "query": query,
                "generated_at": generated_at.isoformat(),
                "target_time": target_time.isoformat(),
                "model_version": model_version,
                "data_version": prediction_inputs["data_version"],
                "official_feature_versions": {
                    port_id: features["feature_version"]
                    for port_id, features in sorted(official_by_port.items())
                },
                "statistical_predictions": [
                    {
                        "port_id": prediction["port_id"],
                        "predicted_wait_time": round(
                            prediction["_statistical_wait_minutes"], 4
                        ),
                        "primary_wait_time": prediction["predicted_wait_time"],
                        "historical_sample_count": prediction[
                            "historical_sample_count"
                        ],
                    }
                    for prediction in sorted(
                        predictions,
                        key=lambda item: item["port_id"],
                    )
                ],
                "active_crowdsource_reports": [
                    {
                        "id": report["id"],
                        "port": report["port"],
                        "timestamp": report["timestamp"],
                        "quality_score": report["quality_score"],
                    }
                    for report in reports
                    if report["used_for_prediction"]
                ],
            },
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        )
        run_id = f"forecast-{sha256(run_identity.encode('utf-8')).hexdigest()[:12]}"
        shadow_by_port = {
            observation["port_id"]: observation
            for observation in shadow_observations
        }
        ports = []
        for prediction in predictions:
            shadow = shadow_by_port.get(prediction["port_id"])
            ports.append(
                {
                    "port_id": prediction["port_id"],
                    "port_name": prediction["name"],
                    "statistical_wait_minutes": prediction[
                        "_statistical_wait_minutes"
                    ],
                    "primary_wait_minutes": prediction["predicted_wait_time"],
                    "prediction_engine": prediction["prediction_engine"],
                    "scenario_version": prediction_inputs["scenario"]["version"],
                    "shadow_wait_minutes": (
                        shadow["shadow_wait_minutes"] if shadow else None
                    ),
                    "shadow_status": shadow["status"] if shadow else "unavailable",
                    "shadow_reason": (
                        shadow["reason"] if shadow else "AI v1 影子模型未加载或未记录"
                    ),
                    "features": {
                        "weather": prediction_inputs["weather"],
                        "is_holiday": prediction_inputs["is_holiday"],
                        "data_version": prediction_inputs["data_version"],
                        "historical_sample_count": prediction[
                            "historical_sample_count"
                        ],
                        "crowdsource_count": prediction["crowdsource_count"],
                        "event_factors": [
                            factor
                            for factor in prediction["factors"]
                            if factor["code"] in {
                                "holiday_calendar",
                                "recurring_event",
                                "scenario_event",
                            }
                        ],
                        "official_features": official_by_port[prediction["port_id"]],
                    },
                }
            )
        try:
            self._repository.save_forecast_run(
                {
                    "id": run_id,
                    "generated_at": generated_at.isoformat(),
                    "target_time": target_time.isoformat(),
                    "query": query,
                    "model_version": model_version,
                    "data_version": prediction_inputs["data_version"],
                    "data_sources": prediction_inputs["data_sources"],
                    "direction": query["direction"],
                },
                ports,
            )
            return run_id
        except Exception:
            logger.warning("预测运行记录失败", exc_info=True)
            return None

    @staticmethod
    def _preference_key(item: dict, preferences: PredictionPreferences) -> tuple:
        if preferences.priority == Priority.FASTEST:
            return item["total_time"], item["late_risk_percent"], item["total_cost"]
        if preferences.priority == Priority.CHEAPEST:
            return item["total_cost"], item["total_time"], item["late_risk_percent"]
        score = (
            item["total_time"]
            + item["late_risk_percent"] * BALANCED_RISK_WEIGHT
            + item["total_cost"] * BALANCED_COST_WEIGHT
        )
        return score, item["total_time"], item["total_cost"]

    def _choose_recommended(
        self,
        predictions: list[dict],
        preferences: PredictionPreferences,
    ) -> tuple[dict, list[str]]:
        warnings: list[str] = []
        within_budget = [item for item in predictions if item["within_budget"]]
        if not within_budget:
            warnings.append("没有路线满足预算上限，已推荐费用最低的可用方案。")
            return min(
                predictions,
                key=lambda item: (
                    item["total_cost"],
                    not item["on_time"],
                    item["total_time"],
                ),
            ), warnings
        on_time = [item for item in within_budget if item["on_time"]]
        if on_time:
            return min(
                on_time,
                key=lambda item: self._preference_key(item, preferences),
            ), warnings
        warnings.append("按当前香港时间出发，所有预算内路线均无法准时到达。")
        return max(
            within_budget,
            key=lambda item: (
                item["buffer_minutes"],
                -item["late_risk_percent"],
                -item["total_cost"],
            ),
        ), warnings

    def predict(
        self,
        request: PredictionRequest,
        *,
        current_time: datetime | None = None,
        record_shadow: bool = True,
        scenario_override: dict | None = None,
        use_default_scenario: bool = False,
    ) -> dict:
        origin = self._repository.find_location(request.origin_id, "origins")
        if origin is None:
            raise DomainValidationError(
                "不支持该出发地点",
                code=ErrorCode.LOCATION_NOT_FOUND,
                details={"origin_id": request.origin_id},
            )
        destination = self._repository.find_location(
            request.destination_id,
            "destinations",
        )
        if destination is None:
            raise DomainValidationError(
                "不支持该目的地点",
                code=ErrorCode.LOCATION_NOT_FOUND,
                details={"destination_id": request.destination_id},
            )

        direction = self._repository.infer_direction(
            request.origin_id,
            request.destination_id,
        )
        if direction is None:
            raise DomainValidationError(
                "出发地与目的地必须位于深港两侧",
                code=ErrorCode.VALIDATION_ERROR,
                details={
                    "origin_id": request.origin_id,
                    "destination_id": request.destination_id,
                },
            )

        current_time = as_hong_kong(
            current_time or self._clock.now()
        ).replace(microsecond=0)
        target_time = as_hong_kong(request.target_time)
        minimum = ceil_minutes(
            current_time + timedelta(minutes=MIN_TARGET_LEAD_MINUTES),
            1,
        )
        maximum = current_time + timedelta(hours=MAX_TARGET_HORIZON_HOURS)
        if not minimum <= target_time <= maximum:
            raise DomainValidationError(
                "目标时间超出允许范围",
                code=ErrorCode.TARGET_TIME_OUT_OF_RANGE,
                details={
                    "min_target_time": minimum.isoformat(),
                    "max_target_time": maximum.isoformat(),
                },
            )

        snapshot, reports = self._forecast.build_snapshot(current_time)
        prediction_inputs = self._repository.get_prediction_input_context(
            target_time,
            scenario_override,
            use_default_scenario=use_default_scenario,
        )
        shadow_observations: list[dict] = []
        predictions = [
            self._prediction_for_port(
                port,
                request.origin_id,
                request.destination_id,
                direction,
                target_time,
                current_time,
                request.preferences.max_budget,
                reports,
                shadow_observations,
                record_shadow,
                prediction_inputs,
            )
            for port in snapshot["ports"]
        ]
        recommended, warnings = self._choose_recommended(
            predictions,
            request.preferences,
        )
        ordered = sorted(
            predictions,
            key=lambda item: (
                item["port_id"] != recommended["port_id"],
                item["total_time"],
            ),
        )
        if recommended["on_time"]:
            reason = (
                f"{recommended['name']}在当前偏好下综合最优；最晚建议"
                f"{recommended['latest_departure'].strftime('%H:%M')}出发，"
                f"预计全程{recommended['total_time']}分钟，"
                f"可预留{recommended['buffer_minutes']}分钟。"
            )
        else:
            reason = (
                f"当前已无法准时到达；{recommended['name']}预计迟到最少，"
                f"全程约{recommended['total_time']}分钟。"
            )
        query = {
            "origin_id": origin["id"],
            "origin_name": origin["name"],
            "destination_id": destination["id"],
            "destination_name": destination["name"],
            "target_time": target_time,
            "priority": request.preferences.priority,
            "max_budget": request.preferences.max_budget,
            "direction": direction,
        }
        prediction_engine = "v2_2_transparent_hybrid" if all(item["prediction_engine"] == "v2_2_transparent_hybrid" for item in predictions) else "statistical_fallback"
        scenario_status = self._scenario_model.status if self._scenario_model else None
        effective_model_version = scenario_status.model_version if prediction_engine == "v2_2_transparent_hybrid" and scenario_status else MODEL_VERSION
        if prediction_engine != "v2_2_transparent_hybrid":
            warnings.append("AI V2.2 透明校准模型不可用，已自动使用可解释统计模型并保留公开校准。")
        if any(item["official_calibration"]["queue"].get("effective_weight", 0) == 0 for item in predictions):
            warnings.append("部分口岸的15分钟官方拥堵等级缺失、过期或超出三小时影响范围。")
        if any(item["official_calibration"]["traffic"]["distribution"].get("status") not in {"in_distribution", "unknown"} for item in predictions):
            warnings.append("部分口岸客流压力超出训练分布，已保留来源提示并应用安全边界。")
        self._save_shadow_observations(shadow_observations)
        forecast_run_id = (
            self._save_forecast_run(
                predictions=predictions,
                shadow_observations=shadow_observations,
                reports=reports,
                query=query,
                generated_at=current_time,
                target_time=target_time,
                prediction_inputs=prediction_inputs,
                model_version=effective_model_version,
            )
            if record_shadow
            else None
        )
        return {
            "query": query,
            "ports": ordered,
            "recommended": recommended["name"],
            "recommended_port_id": recommended["port_id"],
            "reason": reason,
            "warnings": warnings,
            "generated_at": current_time,
            "model_version": effective_model_version,
            "confidence_level": CONFIDENCE_LEVEL,
            "demo_notice": "结果使用香港官方客流、深圳官方快照核验和透明场景/众包校准；等待分钟仍为课堂 Demo 估算，不是实测通关时间。",
            "data_sources": prediction_inputs["data_sources"],
            "data_version": prediction_inputs["data_version"],
            "direction": direction,
            "forecast_run_id": forecast_run_id,
            "prediction_engine": prediction_engine,
            "scenario": prediction_inputs["scenario"],
        }
