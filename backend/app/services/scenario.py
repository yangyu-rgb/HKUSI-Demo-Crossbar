from datetime import date, timedelta

from ..clock import Clock, as_hong_kong
from ..exceptions import DomainValidationError
from ..repositories import DemoRepository
from ..schemas.prediction import PredictionRequest


PORT_NAMES = {"罗湖", "福田", "皇岗", "深圳湾"}
PRESETS = [
    {"id": "commuter_peak", "name": "跨境通勤高峰", "impact": "medium", "start_time": "07:30", "end_time": "10:00"},
    {"id": "exhibition", "name": "大型展会", "impact": "high", "start_time": "09:00", "end_time": "18:00"},
    {"id": "concert", "name": "演唱会散场", "impact": "high", "start_time": "21:00", "end_time": "23:30"},
    {"id": "severe_weather", "name": "恶劣天气交通压力", "impact": "high", "start_time": "06:00", "end_time": "23:00"},
]


class ScenarioService:
    def __init__(self, repository: DemoRepository, clock: Clock):
        self._repository = repository
        self._clock = clock

    def _allowed_range(self) -> tuple[date, date]:
        start = as_hong_kong(self._clock.now()).date()
        return start, start + timedelta(days=13)

    def _validate_date(self, value: date) -> None:
        start, end = self._allowed_range()
        if not start <= value <= end:
            raise DomainValidationError("场景日期必须位于未来14天范围内", details={"min_date": start.isoformat(), "max_date": end.isoformat()})

    @staticmethod
    def _payload(data) -> dict:
        payload = data.model_dump(mode="json")
        for event in payload["events"]:
            unknown = set(event["affected_ports"]) - PORT_NAMES
            if unknown:
                raise DomainValidationError("事件包含未知口岸", details={"ports": sorted(unknown)})
        return payload

    def list(self, start: date | None, days: int) -> dict:
        allowed_start, allowed_end = self._allowed_range()
        selected = start or allowed_start
        self._validate_date(selected)
        days = min(days, (allowed_end - selected).days + 1)
        return {"start": selected, "days": days, "scenarios": self._repository.list_scenarios(selected.isoformat(), days), "weather_options": ["clear", "rain", "heavy_rain", "thunderstorm"], "event_presets": PRESETS}

    def save(self, scenario_date: date, data) -> dict:
        self._validate_date(scenario_date)
        return self._repository.save_scenario(scenario_date.isoformat(), self._payload(data))

    def delete(self, scenario_date: date) -> dict:
        self._validate_date(scenario_date)
        return self._repository.delete_scenario(scenario_date.isoformat())

    def reset(self) -> dict:
        start, _ = self._allowed_range()
        for offset in range(14):
            self._repository.delete_scenario((start + timedelta(days=offset)).isoformat())
        return {"success": True, "scenarios": self._repository.list_scenarios(start.isoformat(), 14)}

    def compare(self, data, prediction_service) -> dict:
        request = PredictionRequest(
            origin_id=data.origin_id,
            destination_id=data.destination_id,
            target_time=data.target_time,
            preferences=data.preferences,
        )
        baseline = prediction_service.predict(
            request,
            record_shadow=False,
            use_default_scenario=True,
        )
        candidate = prediction_service.predict(
            request,
            record_shadow=False,
            scenario_override=self._payload(data.scenario),
        )
        baseline_ports = {item["port_id"]: item for item in baseline["ports"]}
        candidate_ports = {item["port_id"]: item for item in candidate["ports"]}
        ports = []
        for port_id in sorted(baseline_ports):
            before = baseline_ports[port_id]
            after = candidate_ports[port_id]
            ports.append(
                {
                    "port_id": port_id,
                    "port_name": after["name"],
                    "baseline_wait_minutes": before["predicted_wait_time"],
                    "candidate_wait_minutes": after["predicted_wait_time"],
                    "wait_delta_minutes": (
                        after["predicted_wait_time"]
                        - before["predicted_wait_time"]
                    ),
                    "baseline_late_risk_percent": before["late_risk_percent"],
                    "candidate_late_risk_percent": after["late_risk_percent"],
                    "late_risk_delta_percent": (
                        after["late_risk_percent"] - before["late_risk_percent"]
                    ),
                    "total_time_delta_minutes": (
                        after["total_time"] - before["total_time"]
                    ),
                }
            )
        return {
            "baseline": baseline,
            "candidate": candidate,
            "recommended_changed": (
                baseline["recommended_port_id"]
                != candidate["recommended_port_id"]
            ),
            "baseline_recommended_port_id": baseline["recommended_port_id"],
            "candidate_recommended_port_id": candidate["recommended_port_id"],
            "ports": ports,
        }
