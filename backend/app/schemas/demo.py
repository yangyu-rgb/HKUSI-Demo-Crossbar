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
