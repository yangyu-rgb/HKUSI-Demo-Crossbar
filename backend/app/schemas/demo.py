from datetime import datetime

from pydantic import BaseModel


class DemoContextResponse(BaseModel):
    current_time: datetime
    timezone: str
    min_target_time: datetime
    suggested_target_time: datetime
    max_target_time: datetime
    poll_interval_seconds: int


class DemoResetResponse(BaseModel):
    success: bool
    seeded: dict[str, int]
    message: str


class ShadowObservationPortSummary(BaseModel):
    port_id: str
    port_name: str
    observation_count: int
    average_difference_minutes: float | None = None
    average_absolute_difference_minutes: float | None = None


class ShadowObservationSummaryResponse(BaseModel):
    total_observations: int
    available_observations: int
    unavailable_observations: int
    latest_observed_at: datetime | None = None
    ports: list[ShadowObservationPortSummary]
