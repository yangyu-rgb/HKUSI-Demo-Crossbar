from datetime import timedelta

from ..clock import Clock, HONG_KONG_TIMEZONE, as_hong_kong, ceil_minutes
from ..config import (
    MAX_TARGET_HORIZON_HOURS,
    MIN_TARGET_LEAD_MINUTES,
    REALTIME_POLL_INTERVAL_SECONDS,
)
from ..repositories import DemoRepository


class DemoService:
    def __init__(self, repository: DemoRepository, clock: Clock):
        self._repository = repository
        self._clock = clock

    def get_context(self) -> dict:
        current_time = as_hong_kong(self._clock.now()).replace(microsecond=0)
        return {
            "current_time": current_time,
            "timezone": HONG_KONG_TIMEZONE,
            "min_target_time": ceil_minutes(
                current_time + timedelta(minutes=MIN_TARGET_LEAD_MINUTES),
                1,
            ),
            "suggested_target_time": ceil_minutes(
                current_time + timedelta(hours=2),
                15,
            ),
            "max_target_time": current_time + timedelta(hours=MAX_TARGET_HORIZON_HOURS),
            "poll_interval_seconds": REALTIME_POLL_INTERVAL_SECONDS,
        }

    def reset(self) -> dict:
        return {
            "success": True,
            "seeded": self._repository.reset_dynamic_data(),
            "message": "Demo 数据已按当前香港时间恢复为初始状态。",
        }
