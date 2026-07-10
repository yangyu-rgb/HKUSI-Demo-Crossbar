from ..repositories import DemoRepository
from ..clock import Clock
from .wait_forecast import WaitForecastService


class RealtimeService:
    def __init__(self, repository: DemoRepository, clock: Clock):
        self._forecast = WaitForecastService(repository, clock)

    def get_status(self) -> dict:
        snapshot, _reports = self._forecast.build_snapshot()
        return snapshot
