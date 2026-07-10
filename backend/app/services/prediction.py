from datetime import timedelta
from statistics import NormalDist

from ..clock import Clock, as_hong_kong, ceil_minutes
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
)
from ..exceptions import DomainValidationError, ErrorCode
from ..repositories import DemoRepository
from ..schemas.common import Priority
from ..schemas.prediction import PredictionPreferences, PredictionRequest
from .wait_forecast import WaitForecastService


class PredictionService:
    """Compare route choices using a time-weighted statistical wait model."""

    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        safety_buffer_minutes: int = DEFAULT_SAFETY_BUFFER_MINUTES,
    ):
        self._repository = repository
        self._clock = clock
        self._forecast = WaitForecastService(repository, clock)
        self._safety_buffer_minutes = safety_buffer_minutes

    def get_locations(self) -> dict:
        return self._repository.get_locations()

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
        target_time,
        current_time,
        max_budget: int | None,
        reports: list[dict],
    ) -> dict:
        access = self._repository.get_access_leg(origin_id, port["id"])
        onward = self._repository.get_onward_leg(port["id"], destination_id)
        estimate = self._forecast.estimate(
            port["name"],
            target_time,
            current_time,
            reports,
        )
        predicted_value = estimate["value"]
        sigma = estimate["standard_deviation"]
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
        }

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

    def predict(self, request: PredictionRequest) -> dict:
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

        current_time = as_hong_kong(self._clock.now()).replace(microsecond=0)
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
        predictions = [
            self._prediction_for_port(
                port,
                request.origin_id,
                request.destination_id,
                target_time,
                current_time,
                request.preferences.max_budget,
                reports,
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
        return {
            "query": {
                "origin_id": origin["id"],
                "origin_name": origin["name"],
                "destination_id": destination["id"],
                "destination_name": destination["name"],
                "target_time": target_time,
                "priority": request.preferences.priority,
                "max_budget": request.preferences.max_budget,
            },
            "ports": ordered,
            "recommended": recommended["name"],
            "recommended_port_id": recommended["port_id"],
            "reason": reason,
            "warnings": warnings,
            "generated_at": current_time,
            "model_version": MODEL_VERSION,
            "confidence_level": CONFIDENCE_LEVEL,
            "demo_notice": "结果由香港实时时钟、本地模拟历史、交通矩阵与众包样本计算，不代表真实口岸状态。",
        }
