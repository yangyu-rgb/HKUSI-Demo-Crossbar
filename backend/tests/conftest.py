from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.clock import HONG_KONG_TZ
from app.repositories import DemoRepository
from app.services import PredictionService


DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FROZEN_NOW = datetime(2026, 7, 10, 7, 45, tzinfo=HONG_KONG_TZ)


class FrozenClock:
    def __init__(self, current_time: datetime = FROZEN_NOW):
        self.current_time = current_time

    def now(self) -> datetime:
        return self.current_time


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock()


@pytest.fixture
def repository(tmp_path: Path, clock: FrozenClock) -> DemoRepository:
    return DemoRepository(DATA_DIR, tmp_path / "test.db", clock)


@pytest.fixture
def prediction_service(
    repository: DemoRepository,
    clock: FrozenClock,
) -> PredictionService:
    return PredictionService(repository, clock)


@pytest.fixture
def client(tmp_path: Path, clock: FrozenClock) -> TestClient:
    with TestClient(create_app(DATA_DIR, tmp_path / "api.db", clock)) as test_client:
        yield test_client
