from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from .common import TravelDirection


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
