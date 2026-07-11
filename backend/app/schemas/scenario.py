from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from .common import TravelDirection
from .prediction import PredictionPreferences, PredictionResponse


class ScenarioWeather(str, Enum):
    CLEAR = "clear"
    RAIN = "rain"
    HEAVY_RAIN = "heavy_rain"
    THUNDERSTORM = "thunderstorm"


class ScenarioImpact(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ScenarioEvent(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    preset: str = Field(default="custom", max_length=30)
    direction: TravelDirection | None = None
    affected_ports: list[str] = Field(min_length=1, max_length=4)
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    impact: ScenarioImpact

    @model_validator(mode="after")
    def unique_ports(self):
        if len(set(self.affected_ports)) != len(self.affected_ports):
            raise ValueError("事件影响口岸不能重复")
        return self


class ScenarioWrite(BaseModel):
    weather: ScenarioWeather
    is_holiday: bool = False
    events: list[ScenarioEvent] = Field(default_factory=list, max_length=8)


class ScenarioDay(ScenarioWrite):
    date: date
    version: str
    is_override: bool


class ScenarioListResponse(BaseModel):
    start: date
    days: int
    scenarios: list[ScenarioDay]
    weather_options: list[str]
    event_presets: list[dict]


class ScenarioResetResponse(BaseModel):
    success: bool
    scenarios: list[ScenarioDay]


class ScenarioComparisonRequest(BaseModel):
    origin_id: str = Field(min_length=1)
    destination_id: str = Field(min_length=1)
    target_time: datetime
    preferences: PredictionPreferences = Field(default_factory=PredictionPreferences)
    scenario: ScenarioWrite


class ScenarioComparisonPort(BaseModel):
    port_id: str
    port_name: str
    baseline_wait_minutes: int
    candidate_wait_minutes: int
    wait_delta_minutes: int
    baseline_late_risk_percent: int
    candidate_late_risk_percent: int
    late_risk_delta_percent: int
    total_time_delta_minutes: int


class ScenarioComparisonResponse(BaseModel):
    baseline: PredictionResponse
    candidate: PredictionResponse
    recommended_changed: bool
    baseline_recommended_port_id: str
    candidate_recommended_port_id: str
    ports: list[ScenarioComparisonPort]
