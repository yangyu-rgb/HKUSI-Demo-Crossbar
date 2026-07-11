from datetime import date, timedelta

from ..clock import Clock, as_hong_kong
from ..exceptions import DomainValidationError
from ..repositories import DemoRepository


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
