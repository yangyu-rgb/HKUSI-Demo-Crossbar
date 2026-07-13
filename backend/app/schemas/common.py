from enum import Enum
from typing import Any

from pydantic import BaseModel


class Priority(str, Enum):
    FASTEST = "fastest"
    CHEAPEST = "cheapest"
    BALANCED = "balanced"


class Weekday(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class CrowdLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ReportQualityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TravelDirection(str, Enum):
    HONG_KONG_TO_SHENZHEN = "hong_kong_to_shenzhen"
    SHENZHEN_TO_HONG_KONG = "shenzhen_to_hong_kong"


class CrossingChannel(str, Enum):
    TRAVELLER = "traveller"
    VEHICLE = "vehicle"
    CARGO = "cargo"


class ObservationSource(str, Enum):
    DEMO_SEED = "demo_seed"
    DEMO_ENTRY = "demo_entry"
    CROWDSOURCE_OBSERVATION = "crowdsource_observation"
    PARTNER = "partner"
    OFFICIAL = "official"


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any
    request_id: str
    category: str
    retryable: bool
    user_action: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
