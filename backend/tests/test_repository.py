from datetime import datetime
from pathlib import Path

from conftest import FROZEN_NOW, FrozenClock
from app.repositories import DemoRepository


DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def test_dynamic_data_persists_across_repository_instances(tmp_path: Path) -> None:
    database = tmp_path / "persistent.db"
    first = DemoRepository(DATA_DIR, database)
    first.add_report(
        {
            "user_id": "persist-user",
            "port": "福田",
            "actual_wait_time": 9,
            "crowd_level": "low",
            "timestamp": "2026-07-09T07:45:00",
            "time_label": "刚刚",
            "comment": "持久化测试",
        }
    )

    second = DemoRepository(DATA_DIR, database)
    assert any(
        report["user_id"] == "persist-user"
        for report in second.get_reports()
    )


def test_reset_restores_seed_data(tmp_path: Path) -> None:
    repository = DemoRepository(DATA_DIR, tmp_path / "reset.db")
    repository.add_report(
        {
            "user_id": "temporary",
            "port": "罗湖",
            "actual_wait_time": 30,
            "crowd_level": "high",
            "timestamp": "2026-07-09T07:45:00",
            "time_label": "刚刚",
            "comment": "应被重置",
        }
    )

    seeded = repository.reset_dynamic_data()
    assert seeded == {"reports": 4, "subscriptions": 1, "batch_plans": 0}
    assert not any(
        report["user_id"] == "temporary"
        for report in repository.get_reports()
    )


def test_empty_dynamic_table_is_not_reseeded_on_restart(tmp_path: Path) -> None:
    database = tmp_path / "deleted.db"
    first = DemoRepository(DATA_DIR, database)
    for subscription in first.list_subscriptions("demo-user"):
        assert first.delete_subscription(subscription["subscription_id"])

    restarted = DemoRepository(DATA_DIR, database)
    assert restarted.list_subscriptions("demo-user") == []


def test_seed_reports_are_relative_to_hong_kong_clock(tmp_path: Path) -> None:
    repository = DemoRepository(
        DATA_DIR,
        tmp_path / "relative-seeds.db",
        FrozenClock(),
    )
    first = repository.get_reports()[0]
    effective_at = datetime.fromisoformat(first["timestamp"])

    assert int((FROZEN_NOW - effective_at).total_seconds() / 60) == 26
