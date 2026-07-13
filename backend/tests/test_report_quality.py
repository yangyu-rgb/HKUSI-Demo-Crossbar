from datetime import datetime

from fastapi.testclient import TestClient

from app.repositories import DemoRepository
from app.schemas.prediction import PredictionRequest
from app.clock import HONG_KONG_TZ
from app.services import CrowdsourceService, PredictionService, RealtimeService
from app.services.report_quality import crowdsource_consensus, evaluate_report, quality_weighted_wait


FUTIAN = {
    "name": "福田",
    "current_wait": 14,
}
SCENARIO_TIME = datetime(2026, 7, 10, 7, 45, tzinfo=HONG_KONG_TZ)


class FrozenClock:
    def now(self) -> datetime:
        return SCENARIO_TIME


def report(
    *,
    timestamp: str = "2026-07-10T07:45:00+08:00",
    wait: int = 14,
    crowd_level: str = "low",
) -> dict:
    return {
        "id": "quality-test",
        "user_id": "quality-user",
        "port": "福田",
        "actual_wait_time": wait,
        "crowd_level": crowd_level,
        "timestamp": timestamp,
        "time_label": "",
        "comment": "质量测试",
    }


def test_quality_score_and_expiry() -> None:
    high_quality = evaluate_report(report(), FUTIAN, SCENARIO_TIME)
    expired = evaluate_report(
        report(timestamp="2026-07-10T06:15:00+08:00"),
        FUTIAN,
        SCENARIO_TIME,
    )

    assert high_quality["quality_score"] == 100
    assert high_quality["quality_level"] == "high"
    assert high_quality["used_for_prediction"] is True
    assert high_quality["expires_at"].isoformat() == "2026-07-10T09:15:00+08:00"
    assert expired["_active"] is False
    assert expired["used_for_prediction"] is False


def test_quality_weighting_reduces_low_quality_influence() -> None:
    high_quality = evaluate_report(report(wait=14), FUTIAN, SCENARIO_TIME)
    low_quality = evaluate_report(
        report(wait=90, crowd_level="low"),
        FUTIAN,
        SCENARIO_TIME,
    )

    weighted = quality_weighted_wait([high_quality, low_quality])
    simple_average = (14 + 90) / 2

    assert high_quality["quality_score"] > low_quality["quality_score"]
    assert weighted < simple_average


def test_consensus_uses_dynamic_caps_and_suppresses_disagreement() -> None:
    base = {
        "timestamp": SCENARIO_TIME.isoformat(), "port": "福田",
        "crowd_level": "medium", "used_for_prediction": True,
        "_age_minutes": 2.0,
    }
    coherent = [
        {**base, "id": f"r-{index}", "user_id": f"u-{index}", "actual_wait_time": wait, "quality_score": 90}
        for index, wait in enumerate((20, 22, 24), start=1)
    ]
    high = crowdsource_consensus(coherent)
    assert high["distinct_reporters"] == 3
    assert high["consensus_level"] == "high"
    assert high["weight_cap"] == 0.45
    assert high["value_minutes"] == 22

    divided = crowdsource_consensus([coherent[0], {**coherent[1], "actual_wait_time": 70}])
    assert divided["consensus_level"] == "low"
    assert divided["weight_cap"] == 0.30


def test_consensus_keeps_only_latest_report_per_user() -> None:
    old = {
        "id": "old", "user_id": "same", "port": "福田",
        "actual_wait_time": 10, "quality_score": 90,
        "timestamp": "2026-07-10T07:30:00+08:00", "_age_minutes": 15,
    }
    latest = {**old, "id": "latest", "actual_wait_time": 18, "timestamp": "2026-07-10T07:40:00+08:00", "_age_minutes": 5}
    result = crowdsource_consensus([old, latest])
    assert result["distinct_reporters"] == 1
    assert result["value_minutes"] == 18
    assert result["weight_cap"] == 0.15


def test_duplicate_report_returns_conflict(client: TestClient) -> None:
    payload = {
        "user_id": "duplicate-user",
        "port": "福田",
        "actual_wait_time": 14,
        "crowd_level": "low",
        "comment": "第一次反馈",
    }
    first = client.post("/api/crowdsource/report", json=payload)
    second = client.post("/api/crowdsource/report", json=payload)

    assert first.status_code == 200
    assert first.json()["points_earned"] == 10
    assert first.json()["report"]["quality_score"] == 100
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "DUPLICATE_REPORT"
    assert second.json()["error"]["details"]["retry_after_minutes"] == 10

    other_port = client.post(
        "/api/crowdsource/report",
        json={
            **payload,
            "port": "罗湖",
            "actual_wait_time": 22,
            "crowd_level": "medium",
        },
    )
    assert other_port.status_code == 200


def test_points_follow_report_quality(client: TestClient) -> None:
    futian = next(
        port for port in client.get("/api/realtime").json()["ports"]
        if port["id"] == "futian"
    )
    current_wait = futian["current_wait"]
    cases = [
        ("points-high", current_wait, futian["crowd_level"], "high", 10),
        ("points-medium", current_wait + 20, "high", "medium", 6),
        ("points-low", 90, "low", "low", 2),
    ]
    for user_id, wait, crowd_level, quality_level, points in cases:
        response = client.post(
            "/api/crowdsource/report",
            json={
                "user_id": user_id,
                "port": "福田",
                "actual_wait_time": wait,
                "crowd_level": crowd_level,
                "comment": "积分测试",
            },
        )
        assert response.status_code == 200
        assert response.json()["report"]["quality_level"] == quality_level
        assert response.json()["points_earned"] == points


def test_expired_report_is_hidden_and_does_not_affect_prediction(
    repository: DemoRepository,
) -> None:
    clock = FrozenClock()
    prediction_service = PredictionService(repository, clock)
    request = PredictionRequest.model_validate(
        {
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced", "max_budget": 100},
        }
    )
    before = prediction_service.predict(request)
    repository.add_report(
        report(
            timestamp="2026-07-10T06:00:00+08:00",
            wait=180,
            crowd_level="high",
        )
    )
    after = prediction_service.predict(request)
    feed = CrowdsourceService(repository, clock).get_feed(30)
    realtime = RealtimeService(repository, clock).get_status()

    before_futian = next(item for item in before["ports"] if item["port_id"] == "futian")
    after_futian = next(item for item in after["ports"] if item["port_id"] == "futian")
    realtime_futian = next(item for item in realtime["ports"] if item["id"] == "futian")

    assert before_futian["predicted_wait_time"] == after_futian["predicted_wait_time"]
    assert all(item["id"] != "quality-test" for item in feed["reports"])
    assert feed["total"] == 4
    assert realtime_futian["crowdsource_count"] == 1
