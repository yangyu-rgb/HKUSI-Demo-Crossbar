from datetime import datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo


HONG_KONG_TIMEZONE = "Asia/Hong_Kong"
HONG_KONG_TZ = ZoneInfo(HONG_KONG_TIMEZONE)


class Clock(Protocol):
    def now(self) -> datetime: ...


class HongKongClock:
    def now(self) -> datetime:
        return datetime.now(HONG_KONG_TZ)


def as_hong_kong(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=HONG_KONG_TZ)
    return value.astimezone(HONG_KONG_TZ)


def ceil_minutes(value: datetime, interval: int) -> datetime:
    minute_delta = (-value.minute) % interval
    if value.second or value.microsecond:
        minute_delta = minute_delta or interval
    rounded = value.replace(second=0, microsecond=0)
    if minute_delta:
        rounded += timedelta(minutes=minute_delta)
    return rounded
