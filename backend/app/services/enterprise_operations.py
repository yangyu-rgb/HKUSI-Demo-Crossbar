from datetime import datetime, timedelta
from hashlib import sha256
from io import StringIO
import csv
import json

from pydantic import ValidationError

from ..calibration import CALIBRATION_POLICY
from ..clock import Clock
from ..config import AI_V2_MODEL_VERSION
from ..exceptions import DomainValidationError, ErrorCode, PermissionDeniedError, ResourceNotFoundError
from ..ml.scenario_features import PORTS as MODEL_PORTS
from ..ml.scenario_model import ScenarioWaitModel
from ..repositories import DemoRepository
from ..schemas.enterprise_operations import EnterpriseOperationsJobInput, WorkspaceKind


RISK_WEIGHTS = {"low": 0.0, "medium": 0.2, "high": 1.0}
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}
ALLOWED_VIEWS = {item.value for item in WorkspaceKind}
PORT_NAMES = {
    "luohu": "罗湖",
    "futian": "福田",
    "huanggang": "皇岗",
    "shenzhen-bay": "深圳湾",
    "liantang": "莲塘",
    "man-kam-to": "文锦渡",
}
COACH_PORTS = ("luohu", "futian", "huanggang", "shenzhen-bay")
FREIGHT_PORTS = ("shenzhen-bay", "liantang", "man-kam-to")
FREIGHT_NON_BORDER_MINUTES = {
    "shenzhen-bay": 74,
    "liantang": 61,
    "man-kam-to": 67,
}
FALLBACK_WAIT_MINUTES = {
    "luohu": 26,
    "futian": 22,
    "huanggang": 29,
    "shenzhen-bay": 27,
    "liantang": 25,
    "man-kam-to": 24,
}
CSV_COMMON_COLUMNS = [
    "id", "label", "asset_id", "origin_id", "destination_id",
    "departure_time", "arrival_deadline", "baseline_port_id",
    "asset_capacity", "asset_available_at", "turnaround_minutes",
    "exposure_hkd", "priority",
]
CSV_ROLE_COLUMNS = {
    "coach_operator": [*CSV_COMMON_COLUMNS, "passenger_count"],
    "enterprise_client": [*CSV_COMMON_COLUMNS, "passenger_count"],
    "freight_operator": [*CSV_COMMON_COLUMNS, "load_units"],
}
SCENARIO_PRESETS = [
    {
        "preset_id": "normal-weekday",
        "name": "Normal Weekday / 普通工作日",
        "weather": "clear",
        "is_holiday": False,
        "events": [],
        "port_constraints": {},
    },
    {
        "preset_id": "holiday-peak",
        "name": "Holiday Peak / 节假日高峰",
        "weather": "clear",
        "is_holiday": True,
        "events": [{
            "name": "Holiday cross-border peak",
            "impact": "high",
            "direction": None,
            "affected_ports": list(COACH_PORTS) + ["liantang", "man-kam-to"],
            "start_time": "00:00",
            "end_time": "23:59",
        }],
        "port_constraints": {},
    },
    {
        "preset_id": "concert-release",
        "name": "Major Concert Release / 大型演唱会散场",
        "weather": "clear",
        "is_holiday": False,
        "events": [{
            "name": "Major event release",
            "impact": "high",
            "direction": None,
            "affected_ports": ["futian", "huanggang"],
            "start_time": "00:00",
            "end_time": "23:59",
        }],
        "port_constraints": {},
    },
    {
        "preset_id": "typhoon-severe-weather",
        "name": "Typhoon / Severe Weather / 台风恶劣天气",
        "weather": "thunderstorm",
        "is_holiday": False,
        "events": [{
            "name": "Severe weather transport pressure",
            "impact": "high",
            "direction": None,
            "affected_ports": list(COACH_PORTS) + ["liantang", "man-kam-to"],
            "start_time": "00:00",
            "end_time": "23:59",
        }],
        "port_constraints": {"shenzhen-bay": "restricted"},
    },
]
LEGACY_SCENARIO_MAP = {
    "may-day-coach-surge": "holiday-peak",
    "freight-port-redistribution": "holiday-peak",
}


class EnterpriseOperationsService:
    """Local, deterministic enterprise decision workflow for the classroom Demo."""

    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        scenario_model: ScenarioWaitModel | None = None,
    ):
        self._repository = repository
        self._clock = clock
        self._scenario_model = scenario_model

    def resolve_workspace_kind(self, persona: dict, view_as: str | None = None) -> str:
        if view_as:
            if persona["role"] != "operator":
                raise PermissionDeniedError("只有 Demo 操作员可以切换演示视角")
            if view_as not in ALLOWED_VIEWS:
                raise DomainValidationError("未知企业运营工作空间", details={"view_as": view_as})
            return view_as
        workspace = persona.get("workspace_kind", "enterprise_client")
        if workspace == "personal":
            raise PermissionDeniedError("个人通勤身份不能访问企业运营控制塔")
        return workspace

    def _catalog(self) -> dict:
        catalog = self._repository.get_enterprise_operations()
        if not catalog.get("scenarios"):
            raise DomainValidationError("企业运营样例暂时不可用")
        return catalog

    @staticmethod
    def _operations_workspace(workspace_kind: str) -> str:
        return "freight_operator" if workspace_kind == "freight_operator" else "coach_operator"

    def _legacy_scenario(self, workspace_kind: str) -> dict:
        desired = self._operations_workspace(workspace_kind)
        return next(
            (item for item in self._catalog()["scenarios"] if item["workspace_kind"] == desired),
            self._catalog()["scenarios"][0],
        )

    def _preset(self, preset_id: str) -> dict:
        normalized = LEGACY_SCENARIO_MAP.get(preset_id, preset_id)
        presets = self._catalog().get("scenario_presets", SCENARIO_PRESETS)
        preset = next((item for item in presets if item["preset_id"] == normalized), None)
        if preset is None:
            raise ResourceNotFoundError(
                ErrorCode.NOT_FOUND,
                "企业运营场景不存在",
                details={"scenario_id": preset_id},
            )
        return json.loads(json.dumps(preset, ensure_ascii=False))

    def _scenario_summary(self, scenario: dict, workspace_kind: str) -> dict:
        evidence = self._legacy_scenario(workspace_kind)
        return {
            **scenario,
            "id": scenario["preset_id"],
            "subtitle": "What-if stress test using the imported operating plan / 基于当前任务的压力测试",
            "scenario_at": self._clock.now().isoformat(),
            "horizon_hours": 3,
            "source_label": evidence["source_label"],
            "source_url": evidence["source_url"],
            "problem_evidence": evidence["problem_evidence"],
            "problem_source_url": evidence["problem_source_url"],
            "evidence_boundary": evidence["evidence_boundary"],
        }

    @staticmethod
    def _combine_date_time(base: datetime, value: str) -> datetime:
        hour, minute = (int(item) for item in value.split(":"))
        return base.replace(hour=hour, minute=minute, second=0, microsecond=0)

    def _sample_jobs(self, workspace_kind: str) -> list[dict]:
        source = self._legacy_scenario(workspace_kind)
        base = datetime.fromisoformat(source["scenario_at"])
        assets = {item["id"]: item for item in source["assets"]}
        coach_origins = ["central", "kowloon-tong", "hku", "sha-tin", "hong-kong-airport"]
        coach_destinations = ["futian-cbd", "nanshan-tech", "shenzhen-north", "qianhai", "baoan-airport"]
        freight_origins = ["hong-kong-airport", "central", "sha-tin"]
        freight_destinations = ["qianhai", "baoan-airport", "nanshan-tech"]
        coach_asset_ids = ["A01", "A03", "A02", "A04", "A05", "A06", "A07", "A08", "A09", "A02"]
        freight_asset_ids = ["T01", "T02", "T03", "T02"]
        jobs = []
        for index, item in enumerate(source["jobs"]):
            freight = source["workspace_kind"] == "freight_operator"
            asset = assets[item["asset_id"]]
            departure = self._combine_date_time(base, item["departure_time"])
            deadline = self._combine_date_time(base, item["arrival_deadline"])
            if deadline <= departure:
                deadline += timedelta(days=1)
            deadline += timedelta(minutes=-30 if freight else 30)
            available = self._combine_date_time(base, asset["available_at"])
            jobs.append({
                "id": item["id"],
                "label": item["label"],
                "job_kind": "freight" if freight else "coach",
                "asset_id": (freight_asset_ids if freight else coach_asset_ids)[index],
                "origin_id": (freight_origins if freight else coach_origins)[index % (3 if freight else 5)],
                "destination_id": (freight_destinations if freight else coach_destinations)[index % (3 if freight else 5)],
                "departure_time": departure.isoformat(),
                "arrival_deadline": deadline.isoformat(),
                "baseline_port_id": item["baseline_port_id"],
                "passenger_count": item.get("passenger_count", 0),
                "load_units": item.get("load_units", 0),
                "asset_capacity": asset["capacity"],
                "asset_available_at": available.isoformat(),
                "turnaround_minutes": 30 if freight else 20,
                "exposure_hkd": item.get("recovery_budget_hkd", 6000 if freight else 4000),
                "priority": "urgent" if item["baseline_risk"] == "high" else "standard",
            })
        return jobs

    def _job_direction(self, job: dict) -> str:
        direction = self._repository.infer_direction(job["origin_id"], job["destination_id"])
        if direction is None:
            raise DomainValidationError(
                "任务起点与终点必须位于深港两侧",
                details={"job_id": job["id"], "origin_id": job["origin_id"], "destination_id": job["destination_id"]},
            )
        return direction

    def _validate_jobs(self, jobs: list[dict], workspace_kind: str) -> list[dict]:
        if not jobs:
            raise DomainValidationError("请先导入或录入至少一条运营任务")
        expected_kind = "freight" if self._operations_workspace(workspace_kind) == "freight_operator" else "coach"
        ids: set[str] = set()
        normalized = []
        for raw in jobs:
            try:
                job = EnterpriseOperationsJobInput.model_validate(raw).model_dump(mode="json")
            except ValidationError as error:
                raise DomainValidationError("运营任务字段无效", details={"errors": error.errors(include_url=False)}) from error
            if job["id"] in ids:
                raise DomainValidationError("任务编号必须唯一", details={"job_id": job["id"]})
            ids.add(job["id"])
            if job["job_kind"] != expected_kind:
                raise DomainValidationError("任务类型与当前工作空间不一致", details={"job_id": job["id"]})
            direction = self._job_direction(job)
            ports = FREIGHT_PORTS if expected_kind == "freight" else COACH_PORTS
            if job["baseline_port_id"] not in ports:
                raise DomainValidationError("原计划口岸不适用于当前任务类型", details={"job_id": job["id"]})
            load = job["load_units"] if expected_kind == "freight" else job["passenger_count"]
            if load > job["asset_capacity"]:
                raise DomainValidationError("任务数量超过车辆容量", details={"job_id": job["id"]})
            if datetime.fromisoformat(job["arrival_deadline"]) <= datetime.fromisoformat(job["departure_time"]):
                raise DomainValidationError("承诺到达时间必须晚于出发时间", details={"job_id": job["id"]})
            normalized.append({**job, "direction": direction})
        return normalized

    @staticmethod
    def _time_in_window(moment: datetime, start: str, end: str) -> bool:
        value = moment.strftime("%H:%M")
        return start <= value <= end if start <= end else value >= start or value <= end

    def _event_impact(self, scenario: dict, direction: str, port_id: str, moment: datetime) -> str:
        impacts = []
        for event in scenario.get("events", []):
            if event.get("direction") and event["direction"] != direction:
                continue
            if event.get("affected_ports") and port_id not in event["affected_ports"]:
                continue
            if self._time_in_window(moment, event["start_time"], event["end_time"]):
                impacts.append(event["impact"])
        return max(impacts, key=lambda value: {"none": 0, "low": 1, "medium": 2, "high": 3}[value]) if impacts else "none"

    def _traffic_pressure(self, scenario: dict, port_id: str) -> float:
        base = 0.90
        if scenario["is_holiday"]:
            base += 0.20
        if scenario["preset_id"] == "concert-release" and port_id in {"futian", "huanggang"}:
            base += 0.20
        constraint = scenario.get("port_constraints", {}).get(port_id, "open")
        if constraint == "restricted":
            base += 0.25
        return round(min(1.8, base), 2)

    def _forecast(self, port_id: str, direction: str, moment: datetime, scenario: dict) -> dict:
        port_name = PORT_NAMES[port_id]
        pressure = self._traffic_pressure(scenario, port_id)
        event_impact = self._event_impact(scenario, direction, port_id, moment)
        status = self._scenario_model.status if self._scenario_model is not None else None
        prediction = (
            self._scenario_model.predict(
                port=port_name,
                direction=direction,
                timestamp=moment,
                weather=scenario["weather"],
                is_holiday=scenario["is_holiday"],
                event_impact=event_impact,
                traffic_pressure=pressure,
                traffic_available=True,
            )
            if status and status.available and self._scenario_model is not None and port_name in MODEL_PORTS
            else None
        )
        if prediction is None:
            base_wait = float(FALLBACK_WAIT_MINUTES[port_id]) * pressure
            residual = 5.0
            source = "transparent scenario fallback"
        else:
            base_wait, residual = prediction
            source = "checked-in HGB model"
        multiplier = min(
            CALIBRATION_POLICY.scenario_cap,
            CALIBRATION_POLICY.scenario_weather_multipliers[scenario["weather"]]
            * (CALIBRATION_POLICY.scenario_holiday_multiplier if scenario["is_holiday"] else 1.0)
            * CALIBRATION_POLICY.scenario_event_multipliers[event_impact],
        )
        calibrated = max(1, round(base_wait * multiplier))
        interval_delta = max(1, round(residual * multiplier))
        risk = "high" if calibrated >= 45 else "medium" if calibrated >= 25 else "low"
        return {
            "port_id": port_id,
            "name": port_name,
            "model_base_wait_minutes": round(base_wait),
            "calibrated_wait_minutes": calibrated,
            "confidence_interval": [max(1, calibrated - interval_delta), calibrated + interval_delta],
            "traffic_pressure": pressure,
            "stress_signal": risk,
            "forecast_source": source,
        }

    def _route_minutes(self, job: dict, port_id: str) -> int:
        if job["job_kind"] == "freight":
            return FREIGHT_NON_BORDER_MINUTES[port_id]
        access = self._repository.get_access_leg(job["direction"], job["origin_id"], port_id)
        onward = self._repository.get_onward_leg(job["direction"], port_id, job["destination_id"])
        return int(access["duration"]) + int(onward["duration"])

    @staticmethod
    def _risk(arrival: datetime, upper_arrival: datetime, deadline: datetime) -> str:
        if arrival > deadline:
            return "high"
        if upper_arrival > deadline:
            return "medium"
        return "low"

    def _evaluate_option(self, job: dict, port_id: str, departure: datetime, scenario: dict) -> dict | None:
        if scenario.get("port_constraints", {}).get(port_id) == "closed":
            return None
        if departure < datetime.fromisoformat(job["asset_available_at"]):
            return None
        forecast = self._forecast(port_id, job["direction"], departure, scenario)
        route_minutes = self._route_minutes(job, port_id)
        arrival = departure + timedelta(minutes=route_minutes + forecast["calibrated_wait_minutes"])
        upper_arrival = departure + timedelta(minutes=route_minutes + forecast["confidence_interval"][1])
        deadline = datetime.fromisoformat(job["arrival_deadline"])
        risk = self._risk(arrival, upper_arrival, deadline)
        exposure = round(job["exposure_hkd"] * RISK_WEIGHTS[risk])
        return {
            "port_id": port_id,
            "departure": departure,
            "arrival": arrival,
            "risk": risk,
            "exposure": exposure,
            "forecast": forecast,
        }

    def _job_result(self, job: dict, scenario: dict) -> dict:
        departure = datetime.fromisoformat(job["departure_time"])
        baseline = self._evaluate_option(job, job["baseline_port_id"], departure, scenario)
        if baseline is None:
            baseline = {
                "port_id": job["baseline_port_id"],
                "departure": departure,
                "arrival": departure + timedelta(hours=6),
                "risk": "high",
                "exposure": job["exposure_hkd"],
                "forecast": self._forecast(job["baseline_port_id"], job["direction"], departure, scenario),
            }
        candidates = []
        shifts = (0, -10, -20) if job["job_kind"] == "coach" else (0, -15, -30)
        ports = COACH_PORTS if job["job_kind"] == "coach" else FREIGHT_PORTS
        for port_id in ports:
            for shift in shifts:
                candidate = self._evaluate_option(job, port_id, departure + timedelta(minutes=shift), scenario)
                if candidate is None:
                    continue
                candidate["score"] = (
                    RISK_ORDER[candidate["risk"]],
                    candidate["exposure"],
                    int(port_id != job["baseline_port_id"]) + int(shift != 0),
                    abs(shift),
                    candidate["arrival"],
                )
                candidates.append(candidate)
        recommended = min(candidates, key=lambda item: item["score"]) if candidates else baseline
        changed = recommended["port_id"] != baseline["port_id"] or recommended["departure"] != baseline["departure"]
        arrival_delta = round((recommended["arrival"] - baseline["arrival"]).total_seconds() / 60)
        return {
            "id": job["id"],
            "label": job["label"],
            "direction": job["direction"],
            "asset_id": job["asset_id"],
            "recommended_asset_id": job["asset_id"],
            "passenger_count": job["passenger_count"],
            "load_units": job["load_units"],
            "baseline_port_id": baseline["port_id"],
            "baseline_port": PORT_NAMES[baseline["port_id"]],
            "baseline_departure_time": baseline["departure"].isoformat(),
            "baseline_arrival": baseline["arrival"].isoformat(),
            "baseline_risk": baseline["risk"],
            "recommended_port_id": recommended["port_id"],
            "recommended_port": PORT_NAMES[recommended["port_id"]],
            "recommended_departure_time": recommended["departure"].isoformat(),
            "recommended_arrival": recommended["arrival"].isoformat(),
            "recommended_risk": recommended["risk"],
            "changed": changed,
            "arrival_delta_minutes": arrival_delta,
            "exposure_before_hkd": baseline["exposure"],
            "exposure_after_hkd": recommended["exposure"],
            "predicted_wait_minutes": recommended["forecast"]["calibrated_wait_minutes"],
            "prediction_interval": recommended["forecast"]["confidence_interval"],
            "model_source": recommended["forecast"]["forecast_source"],
        }

    @staticmethod
    def _vehicle_conflicts(results: list[dict], jobs: list[dict], recommended: bool) -> int:
        input_by_id = {item["id"]: item for item in jobs}
        by_asset: dict[str, list[dict]] = {}
        for item in results:
            asset_id = item["recommended_asset_id"] if recommended else item["asset_id"]
            by_asset.setdefault(asset_id, []).append(item)
        conflicts = 0
        for items in by_asset.values():
            ordered = sorted(items, key=lambda value: value["recommended_departure_time" if recommended else "baseline_departure_time"])
            for current, following in zip(ordered, ordered[1:]):
                arrival = datetime.fromisoformat(current["recommended_arrival" if recommended else "baseline_arrival"])
                ready = arrival + timedelta(minutes=input_by_id[current["id"]]["turnaround_minutes"])
                next_departure = datetime.fromisoformat(following["recommended_departure_time" if recommended else "baseline_departure_time"])
                conflicts += int(ready > next_departure)
        return conflicts

    def _resolve_vehicle_cycles(self, results: list[dict], jobs: list[dict]) -> None:
        input_by_id = {item["id"]: item for item in jobs}
        by_asset: dict[str, list[dict]] = {}
        for item in results:
            by_asset.setdefault(item["asset_id"], []).append(item)
        for asset_id, items in by_asset.items():
            ordered = sorted(items, key=lambda value: value["recommended_departure_time"])
            for current, following in zip(ordered, ordered[1:]):
                ready = datetime.fromisoformat(current["recommended_arrival"]) + timedelta(
                    minutes=input_by_id[current["id"]]["turnaround_minutes"]
                )
                if ready > datetime.fromisoformat(following["recommended_departure_time"]):
                    following["recommended_asset_id"] = f"{asset_id}-R"
                    following["changed"] = True

    def _summary(self, results: list[dict], jobs: list[dict], recommended: bool) -> dict:
        prefix = "recommended" if recommended else "baseline"
        changed = [item for item in results if item["changed"]] if recommended else []
        risks = [item[f"{prefix}_risk"] for item in results]
        return {
            "total_jobs": len(results),
            "high_risk_count": risks.count("high"),
            "medium_risk_count": risks.count("medium"),
            "vehicle_conflicts": self._vehicle_conflicts(results, jobs, recommended),
            "cost_exposure_hkd": sum(item["exposure_after_hkd" if recommended else "exposure_before_hkd"] for item in results),
            "average_arrival_delta_minutes": (
                round(sum(abs(item["arrival_delta_minutes"]) for item in changed) / len(changed)) if changed else 0
            ),
            "affected_people": sum(item["passenger_count"] for item in changed),
            "affected_load_units": sum(item.get("load_units") or 0 for item in changed),
            "changed_jobs": len(changed),
        }

    def _ai_trace(self, jobs: list[dict], scenario: dict, workspace_kind: str) -> dict:
        first = min(datetime.fromisoformat(item["departure_time"]) for item in jobs)
        direction = jobs[0]["direction"]
        ports = COACH_PORTS if self._operations_workspace(workspace_kind) == "coach_operator" else FREIGHT_PORTS
        forecasts = [self._forecast(port_id, direction, first, scenario) for port_id in ports]
        supported = sum(item["forecast_source"] == "checked-in HGB model" for item in forecasts)
        status = self._scenario_model.status if self._scenario_model is not None else None
        return {
            "model_available": supported > 0,
            "coverage_status": "full" if supported == len(forecasts) else "partial" if supported else "fallback",
            "model_supported_port_count": supported,
            "total_port_count": len(forecasts),
            "model_version": status.model_version if status and status.model_version else AI_V2_MODEL_VERSION,
            "prediction_engine": "HGB base forecast + transparent scenario calibration + constraint optimizer",
            "target_time": first.isoformat(),
            "forecast_horizon_hours": 3,
            "confidence_level": 0.9,
            "inputs": [
                f"{len(jobs)} imported or manually entered operating tasks",
                "port, direction, task time and official traffic pressure",
                "weather, holiday, event window and port constraints",
                "vehicle capacity, availability, turnaround and arrival deadline",
            ],
            "optimization_objectives": [
                "satisfy port, capacity and vehicle hard constraints",
                "minimize high-risk tasks and vehicle-cycle conflicts",
                "reduce scenario exposure with the fewest plan changes",
            ],
            "ports": forecasts,
            "disclosure": (
                "Supported ports use the checked-in HGB model. Unsupported freight ports use a labelled transparent fallback. "
                "Typhoon is represented transparently as thunderstorm weather, high event impact and capacity restriction. "
                "All waits and outcomes remain classroom estimates."
            ),
        }

    def get_workspace(self, persona: dict, view_as: str | None = None) -> dict:
        workspace_kind = self.resolve_workspace_kind(persona, view_as)
        operations_kind = self._operations_workspace(workspace_kind)
        sample_jobs = self._validate_jobs(self._sample_jobs(operations_kind), operations_kind)
        normal = self._preset("normal-weekday")
        trace = self._ai_trace(sample_jobs, normal, operations_kind)
        official = workspace_kind == "port_authority"
        recent = self._repository.list_enterprise_operation_plans(persona["organization_id"], 5)
        return {
            "generated_at": self._clock.now(),
            "workspace_kind": workspace_kind,
            "organization_name": persona["organization_name"],
            "available_views": (
                ["coach_operator", "freight_operator", "enterprise_client", "port_authority"]
                if persona["role"] == "operator" else [workspace_kind]
            ),
            "scenarios": [self._scenario_summary(item, operations_kind) for item in self._catalog().get("scenario_presets", SCENARIO_PRESETS)],
            "active_scenario": self._scenario_summary(normal, operations_kind),
            "ports": [
                {
                    **item,
                    "id": item["port_id"],
                    "wait_minutes": item["calibrated_wait_minutes"],
                    "risk": item["stress_signal"],
                }
                for item in trace["ports"]
            ],
            "assets": [] if official else self._legacy_scenario(operations_kind)["assets"],
            "jobs": [] if official else sample_jobs,
            "recent_plans": [
                {"plan_id": item["plan_id"], "scenario": item["scenario"], "status": item["status"],
                 "adopted_at": item["adopted_at"], "notifications_created": item["notifications_created"]}
                for item in recent
            ],
            "coordination_notices": self._repository.list_coordination_notices(5),
            "ai_decision_trace": trace,
            "demo_notice": self._catalog()["demo_notice"],
            "scenario_presets": self._catalog().get("scenario_presets", SCENARIO_PRESETS),
            "sample_jobs": [] if official else sample_jobs,
            "locations": self._repository.get_locations(),
            "csv_columns": [] if official else CSV_ROLE_COLUMNS[operations_kind],
        }

    def validate_csv(self, workspace_kind: str, csv_text: str) -> dict:
        operations_kind = self._operations_workspace(workspace_kind)
        if operations_kind not in CSV_ROLE_COLUMNS:
            raise DomainValidationError("当前视角不支持导入企业任务")
        reader = csv.DictReader(StringIO(csv_text.lstrip("\ufeff")))
        required = set(CSV_ROLE_COLUMNS[operations_kind])
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            return {"valid": False, "jobs": [], "errors": [{"row": 1, "field": None, "message": f"缺少列：{', '.join(missing)}"}], "warnings": [], "summary": {"rows": 0}}
        jobs = []
        errors = []
        warnings = []
        seen = set()
        for row_number, row in enumerate(reader, 2):
            try:
                freight = operations_kind == "freight_operator"
                payload = {
                    **{key: row.get(key, "") for key in CSV_COMMON_COLUMNS},
                    "job_kind": "freight" if freight else "coach",
                    "passenger_count": int(row.get("passenger_count") or 0),
                    "load_units": int(row.get("load_units") or 0),
                    "asset_capacity": int(row["asset_capacity"]),
                    "turnaround_minutes": int(row["turnaround_minutes"]),
                    "exposure_hkd": int(row["exposure_hkd"]),
                }
                job = EnterpriseOperationsJobInput.model_validate(payload).model_dump(mode="json")
                if job["id"] in seen:
                    raise ValueError("任务编号重复")
                seen.add(job["id"])
                self._validate_jobs([job], operations_kind)
                jobs.append(job)
                if job["asset_available_at"] > job["departure_time"]:
                    warnings.append({"row": row_number, "field": "asset_available_at", "message": "车辆在计划出发时尚未可用，模型会标记硬约束风险"})
            except (ValidationError, ValueError, DomainValidationError) as error:
                errors.append({"row": row_number, "field": None, "message": str(error)})
        if len(jobs) > 100:
            errors.append({"row": 1, "field": None, "message": "单次最多导入 100 条任务"})
            jobs = jobs[:100]
        kind_field = "load_units" if operations_kind == "freight_operator" else "passenger_count"
        return {
            "valid": bool(jobs) and not errors,
            "jobs": jobs,
            "errors": errors,
            "warnings": warnings,
            "summary": {
                "rows": len(jobs),
                "assets": len({item["asset_id"] for item in jobs}),
                "total_units": sum(item[kind_field] for item in jobs),
            },
        }

    def template_csv(self, workspace_kind: str, sample: bool = False) -> str:
        operations_kind = self._operations_workspace(workspace_kind)
        if operations_kind not in CSV_ROLE_COLUMNS:
            raise DomainValidationError("当前视角不支持 CSV 模板")
        output = StringIO()
        fields = CSV_ROLE_COLUMNS[operations_kind]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        if sample:
            for job in self._sample_jobs(operations_kind):
                writer.writerow({field: job.get(field, "") for field in fields})
        return output.getvalue()

    def _resolve_request(self, request: dict, workspace_kind: str) -> tuple[list[dict], dict]:
        jobs = request.get("jobs") or self._sample_jobs(workspace_kind)
        jobs = self._validate_jobs(jobs, workspace_kind)
        scenario = request.get("scenario") or self._preset(request.get("scenario_id") or "normal-weekday")
        return jobs, scenario

    def preview(self, persona: dict, request: dict, view_as: str | None = None) -> dict:
        workspace_kind = self.resolve_workspace_kind(persona, view_as)
        operations_kind = self._operations_workspace(workspace_kind)
        jobs, scenario = self._resolve_request(request, operations_kind)
        results = [self._job_result(job, scenario) for job in jobs]
        self._resolve_vehicle_cycles(results, jobs)
        baseline = self._summary(results, jobs, False)
        recommended = self._summary(results, jobs, True)
        actions = []
        for result in results:
            if not result["changed"]:
                continue
            actions.append({
                "id": f"reroute-{result['id']}",
                "action_type": "reroute_and_retime",
                "target_id": result["id"],
                "title": f"Optimize {result['label']} / 调整{result['label']}",
                "detail": (
                    f"{result['baseline_port']} → {result['recommended_port']} · "
                    f"{datetime.fromisoformat(result['baseline_departure_time']).strftime('%H:%M')} → "
                    f"{datetime.fromisoformat(result['recommended_departure_time']).strftime('%H:%M')} · "
                    f"vehicle {result['asset_id']} → {result['recommended_asset_id']}"
                ),
                "impact": (
                    "Vehicle cycle conflict removed with reserve allocation"
                    if result["recommended_asset_id"] != result["asset_id"]
                    else f"{result['baseline_risk']} → {result['recommended_risk']} · arrival {abs(result['arrival_delta_minutes'])} min earlier"
                ),
            })
        trace = self._ai_trace(jobs, scenario, operations_kind)
        fingerprint = json.dumps({"jobs": jobs, "scenario": scenario, "workspace": operations_kind, "version": self._catalog()["version"]}, ensure_ascii=False, sort_keys=True)
        preview_id = "preview-" + sha256(fingerprint.encode("utf-8")).hexdigest()[:12]
        official = workspace_kind == "port_authority"
        return {
            "preview_id": preview_id,
            "workspace_kind": workspace_kind,
            "scenario": self._scenario_summary(scenario, operations_kind),
            "baseline": baseline,
            "recommended": recommended,
            "jobs": [] if official else results,
            "actions": ([{
                "id": "coordinate-capacity-window",
                "action_type": "coordination",
                "target_id": "network",
                "title": "Publish aggregate coordination window / 发布聚合协调窗口",
                "detail": "Share port pressure and diversion capacity without exposing company task or vehicle records.",
                "impact": f"Aggregate high-risk tasks {baseline['high_risk_count']} → {recommended['high_risk_count']} (scenario)",
            }] if official else actions),
            "ai_decision_trace": trace,
            "explanation": [
                "The model evaluates every eligible port for every imported task.",
                "Weather, holiday and event effects are transparent versioned multipliers.",
                "The optimizer applies capacity, availability, turnaround and port constraints before minimizing risk and changes.",
            ],
            "demo_notice": self._catalog()["demo_notice"],
        }

    def compare(self, persona: dict, request: dict, view_as: str | None = None) -> dict:
        workspace_kind = self.resolve_workspace_kind(persona, view_as)
        operations_kind = self._operations_workspace(workspace_kind)
        jobs = self._validate_jobs(request["jobs"], operations_kind)
        items = []
        for scenario_id in request["scenario_ids"]:
            scenario = self._preset(scenario_id)
            preview = self.preview(persona, {"jobs": jobs, "scenario": scenario}, view_as)
            items.append({
                "scenario": preview["scenario"],
                "summary": preview["recommended"],
                "baseline": preview["baseline"],
                "recommended": preview["recommended"],
                "port_forecasts": preview["ai_decision_trace"]["ports"],
                "action_count": len(preview["actions"]),
                "top_recommendation": preview["actions"][0]["title"] if preview["actions"] else "Keep current plan / 保持原计划",
            })
        unit_field = "load_units" if operations_kind == "freight_operator" else "passenger_count"
        return {
            "input_summary": {
                "jobs": len(jobs),
                "assets": len({item["asset_id"] for item in jobs}),
                "units": sum(item[unit_field] for item in jobs),
            },
            "baseline_scenario_id": "normal-weekday",
            "scenarios": items,
            "demo_notice": self._catalog()["demo_notice"],
        }

    def adopt_plan(self, persona: dict, request: dict, view_as: str | None = None) -> dict:
        preview = self.preview(persona, request, view_as)
        if request["preview_id"] != preview["preview_id"]:
            raise DomainValidationError("预览已失效，请重新生成企业运营方案", details={"expected_preview_id": preview["preview_id"]})
        available = {item["id"] for item in preview["actions"]}
        selected = request.get("selected_action_ids") or sorted(available)
        if not set(selected) <= available:
            raise DomainValidationError("采用方案包含未知措施")
        selected_set = set(selected)
        adopted_jobs = []
        for job in preview["jobs"]:
            if job["changed"] and f"reroute-{job['id']}" not in selected_set:
                job = {
                    **job,
                    "recommended_port_id": job["baseline_port_id"],
                    "recommended_port": job["baseline_port"],
                    "recommended_asset_id": job["asset_id"],
                    "recommended_departure_time": job["baseline_departure_time"],
                    "recommended_arrival": job["baseline_arrival"],
                    "recommended_risk": job["baseline_risk"],
                    "changed": False,
                    "arrival_delta_minutes": 0,
                    "exposure_after_hkd": job["exposure_before_hkd"],
                }
            adopted_jobs.append(job)
        input_jobs, scenario = self._resolve_request(request, self._operations_workspace(preview["workspace_kind"]))
        recommended = self._summary(adopted_jobs, input_jobs, True)
        notifications = recommended["affected_people"] if preview["workspace_kind"] != "freight_operator" else recommended["changed_jobs"] * 2
        result = {
            **preview,
            "jobs": adopted_jobs,
            "recommended": recommended,
            "notifications_created": notifications,
            "notification_delivery": "sqlite-draft-only",
            "selected_action_ids": selected,
        }
        stored_request = {**request, "jobs": input_jobs, "scenario": scenario}
        return self._repository.save_enterprise_operation_plan(
            organization_id=persona["organization_id"],
            workspace_kind=preview["workspace_kind"],
            scenario_id=scenario["preset_id"],
            request=stored_request,
            result=result,
        )

    def list_plans(self, persona: dict, limit: int) -> dict:
        plans = self._repository.list_enterprise_operation_plans(persona["organization_id"], limit)
        return {"plans": plans, "total": len(plans)}

    def record_outcome(self, persona: dict, plan_id: str, payload: dict) -> dict:
        plan = self._repository.get_enterprise_operation_plan(plan_id, persona["organization_id"])
        if plan is None:
            raise ResourceNotFoundError(ErrorCode.PLAN_NOT_FOUND, "企业运营方案不存在")
        outcome = {
            **payload,
            "recorded_at": self._clock.now().isoformat(),
            "demo_only": True,
            "high_risk_change": payload["actual_high_risk_count"] - plan["baseline"]["high_risk_count"],
        }
        stored = self._repository.save_enterprise_operation_outcome(plan_id, persona["organization_id"], outcome)
        if stored is None:
            raise ResourceNotFoundError(ErrorCode.PLAN_NOT_FOUND, "企业运营方案不存在")
        return stored

    def export_plan_csv(self, persona: dict, plan_id: str) -> str | None:
        plan = self._repository.get_enterprise_operation_plan(plan_id, persona["organization_id"])
        if plan is None:
            return None
        output = StringIO()
        fields = [
            "id", "label", "asset_id", "baseline_port", "recommended_port",
            "baseline_departure_time", "recommended_departure_time", "baseline_risk",
            "recommended_risk", "arrival_delta_minutes", "predicted_wait_minutes", "model_source",
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for item in plan["jobs"]:
            writer.writerow({field: item.get(field, "") for field in fields})
        return output.getvalue()

    def create_notice(self, persona: dict, payload: dict) -> dict:
        if persona["role"] not in {"operator", "port_official"}:
            raise PermissionDeniedError("只有口岸协调身份可以发布协调建议")
        return self._repository.save_coordination_notice(persona["organization_id"], payload)

    def list_notices(self) -> dict:
        notices = self._repository.list_coordination_notices(20)
        return {"notices": notices, "total": len(notices)}
