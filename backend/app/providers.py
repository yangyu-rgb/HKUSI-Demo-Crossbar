"""Local data-provider boundary used by the Demo and future real integrations.

The current product deliberately reads only repository-owned fixtures.  The
provider result still exposes source, fetch time and fallback state so runtime
services do not need to change when a reviewed real-data adapter is introduced.
"""

from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Callable
import json


JsonValue = dict | list
Validator = Callable[[JsonValue], bool]


class LocalJsonProvider:
    """Read one deterministic JSON fixture and fail closed to an embedded value."""

    def __init__(
        self,
        *,
        name: str,
        path: Path,
        fallback: JsonValue,
        validator: Validator,
        now: datetime,
    ):
        self._name = name
        self._path = path
        self._fallback = fallback
        self._validator = validator
        self._now = now.astimezone(timezone.utc).isoformat()
        self._data, self._status = self._load()

    def _load(self) -> tuple[JsonValue, dict]:
        try:
            with self._path.open("r", encoding="utf-8") as file:
                data = json.load(file)
            if not self._validator(data):
                raise ValueError("JSON 结构不符合最小契约")
            return data, {
                "provider": self._name,
                "source": f"local-json:{self._path.name}",
                "fetched_at": self._now,
                "status": "available",
                "fallback": False,
                "reason": None,
            }
        except (OSError, ValueError, json.JSONDecodeError) as error:
            return deepcopy(self._fallback), {
                "provider": self._name,
                "source": "embedded-demo-fallback",
                "fetched_at": self._now,
                "status": "fallback",
                "fallback": True,
                "reason": str(error),
            }

    def get(self) -> JsonValue:
        return deepcopy(self._data)

    def status(self) -> dict:
        return deepcopy(self._status)

    def version(self) -> str:
        payload = json.dumps(
            self._data,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return sha256(payload.encode("utf-8")).hexdigest()[:16]


def has_keys(*keys: str) -> Validator:
    return lambda value: isinstance(value, dict) and all(key in value for key in keys)


def valid_port_state(value: JsonValue) -> bool:
    if not isinstance(value, dict) or not isinstance(value.get("source"), str):
        return False
    ports = value.get("ports")
    if not isinstance(ports, list) or not ports:
        return False
    required = {"id", "name", "name_en", "status", "special_channels", "map_position"}
    return all(
        isinstance(port, dict)
        and required <= set(port)
        and isinstance(port["special_channels"], list)
        and isinstance(port["map_position"], dict)
        and all(isinstance(port["map_position"].get(axis), (int, float)) for axis in ("x", "y"))
        for port in ports
    ) and isinstance(value.get("alerts"), list)


def valid_weather(value: JsonValue) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("condition"), str)
        and isinstance(value.get("transport_buffer_minutes"), int)
    )


def valid_calendar(value: JsonValue) -> bool:
    return isinstance(value, dict) and isinstance(value.get("dates"), list) and all(
        isinstance(item, str) for item in value["dates"]
    )


def valid_events(value: JsonValue) -> bool:
    if not isinstance(value, dict) or not isinstance(value.get("events"), list):
        return False
    required = {"name", "weekdays", "start_time", "end_time", "affected_ports", "impact"}
    return all(
        isinstance(event, dict)
        and required <= set(event)
        and isinstance(event["weekdays"], list)
        and isinstance(event["affected_ports"], list)
        for event in value["events"]
    )


def valid_crowdsource_seed(value: JsonValue) -> bool:
    required = {"id", "user_id", "port", "actual_wait_time", "crowd_level", "age_minutes", "comment"}
    return isinstance(value, list) and all(
        isinstance(report, dict) and required <= set(report) for report in value
    )


def valid_enterprise_operations(value: JsonValue) -> bool:
    if (
        not isinstance(value, dict)
        or not isinstance(value.get("scenarios"), list)
        or not isinstance(value.get("scenario_presets"), list)
    ):
        return False
    required = {"id", "workspace_kind", "name", "scenario_at", "ports", "assets", "jobs"}
    preset_required = {"preset_id", "name", "weather", "is_holiday", "events", "port_constraints"}
    return bool(value["scenarios"]) and bool(value["scenario_presets"]) and all(
        isinstance(scenario, dict)
        and required <= set(scenario)
        and isinstance(scenario["ports"], list)
        and isinstance(scenario["assets"], list)
        and isinstance(scenario["jobs"], list)
        for scenario in value["scenarios"]
    ) and all(isinstance(item, dict) and preset_required <= set(item) for item in value["scenario_presets"])


PORT_STATE_FALLBACK = {
    "source": "CrossBorder AI embedded fallback",
    "ports": [
        {
            "id": "luohu",
            "name": "罗湖",
            "name_en": "Lo Wu",
            "map_position": {"x": 69, "y": 31},
            "status": "open",
            "special_channels": [],
        },
        {
            "id": "futian",
            "name": "福田",
            "name_en": "Futian",
            "map_position": {"x": 53, "y": 38},
            "status": "open",
            "special_channels": [],
        },
        {
            "id": "huanggang",
            "name": "皇岗",
            "name_en": "Huanggang",
            "map_position": {"x": 46, "y": 48},
            "status": "open",
            "special_channels": [],
        },
        {
            "id": "shenzhen-bay",
            "name": "深圳湾",
            "name_en": "Shenzhen Bay",
            "map_position": {"x": 23, "y": 57},
            "status": "open",
            "special_channels": [],
        },
    ],
    "alerts": [],
}
WEATHER_FALLBACK = {
    "condition": "clear",
    "temperature_c": 26,
    "transport_buffer_minutes": 10,
    "demo_note": "Embedded fallback used when the local weather fixture is unavailable.",
}
HOLIDAY_FALLBACK = {"dates": [], "demo_note": "Embedded calendar fallback."}
EVENT_FALLBACK = {"events": [], "demo_note": "Embedded event fallback."}
CROWDSOURCE_FALLBACK: list[dict] = []
ENTERPRISE_OPERATIONS_FALLBACK = {
    "version": "enterprise-operations-fallback-v1",
    "source": "embedded-demo-fallback",
    "demo_notice": "企业运营情景文件不可用。",
    "scenarios": [],
}
