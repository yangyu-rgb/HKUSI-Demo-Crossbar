from fastapi.testclient import TestClient


def test_health_realtime_and_locations(client: TestClient) -> None:
    health = client.get("/api/health")
    realtime = client.get("/api/realtime")
    locations = client.get("/api/locations")

    assert health.status_code == 200
    assert realtime.status_code == 200
    assert locations.status_code == 200
    assert len(realtime.json()["ports"]) == 4
    assert len(locations.json()["origins"]) == 3
    assert len(locations.json()["destinations"]) == 3


def test_prediction_contract(client: TestClient) -> None:
    response = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced", "max_budget": 100},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["recommended_port_id"] == "shenzhen-bay"
    assert len(payload["ports"]) == 4
    assert {"latest_departure", "estimated_arrival", "buffer_minutes", "on_time"} <= set(
        payload["ports"][0]
    )
    crowd_factor = next(
        factor
        for factor in payload["ports"][0]["factors"]
        if factor["code"] == "crowdsource"
    )
    assert crowd_factor["average_quality_score"] >= 50


def test_invalid_location_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/predict",
        json={
            "origin_id": "invalid",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced"},
        },
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "LOCATION_NOT_FOUND"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_crowdsource_subscription_and_batch(client: TestClient) -> None:
    feed = client.get("/api/crowdsource/feed")
    report = client.post(
        "/api/crowdsource/report",
        json={
            "user_id": "test-user",
            "port": "福田",
            "actual_wait_time": 12,
            "crowd_level": "low",
            "comment": "测试反馈",
        },
    )
    subscription = client.post(
        "/api/subscription",
        json={
            "user_id": "test-user",
            "routine": {
                "origin_id": "hku",
                "destination_id": "nanshan-tech",
                "days": ["monday"],
                "arrival_deadline": "09:30",
                "priority": "balanced",
            },
            "alerts": {},
        },
    )
    batch = client.post(
        "/api/batch",
        json={
            "company": "测试企业",
            "date": "2026-07-10",
            "employees": [
                {
                    "id": "E-1",
                    "name": "测试员工",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "09:30",
                }
            ],
        },
    )

    assert feed.status_code == 200
    assert report.status_code == 200
    assert subscription.status_code == 200
    assert batch.status_code == 200
    assert report.json()["points_earned"] == 10
    assert batch.json()["summary"]["employee_count"] == 1
    assert batch.json()["plan_id"].startswith("plan-")


def test_demo_context_and_reset(client: TestClient) -> None:
    context = client.get("/api/demo/context")
    reset = client.post("/api/demo/reset")

    assert context.status_code == 200
    payload = context.json()
    assert payload["poll_interval_seconds"] == 60
    assert payload["timezone"] == "Asia/Hong_Kong"
    assert payload["current_time"].endswith("+08:00")
    assert reset.status_code == 200
    assert reset.json()["seeded"]["reports"] == 4


def test_subscription_crud(client: TestClient) -> None:
    created = client.post(
        "/api/subscriptions",
        json={
            "user_id": "crud-user",
            "routine": {
                "origin_id": "hku",
                "destination_id": "nanshan-tech",
                "days": ["monday"],
                "arrival_deadline": "09:30",
                "priority": "balanced",
            },
            "alerts": {},
        },
    )
    assert created.status_code == 201
    subscription_id = created.json()["subscription_id"]

    listed = client.get("/api/subscriptions", params={"user_id": "crud-user"})
    assert listed.json()["total"] == 1

    updated = client.patch(
        f"/api/subscriptions/{subscription_id}",
        json={
            "routine": {
                "origin_id": "central",
                "destination_id": "futian-cbd",
                "days": ["wednesday"],
                "arrival_deadline": "10:00",
                "priority": "fastest",
            },
            "alerts": {
                "advance_reminder": True,
                "anomaly_alert": False,
                "better_route_alert": True,
            },
        },
    )
    assert updated.status_code == 200
    assert updated.json()["routine"]["origin_id"] == "central"

    deleted = client.delete(f"/api/subscriptions/{subscription_id}")
    assert deleted.status_code == 204
    assert client.get(
        "/api/subscriptions",
        params={"user_id": "crud-user"},
    ).json()["total"] == 0


def test_batch_plan_history(client: TestClient) -> None:
    response = client.post(
        "/api/batch",
        json={
            "company": "历史测试企业",
            "date": "2026-07-10",
            "employees": [
                {
                    "id": "E-1",
                    "name": "测试员工",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "09:30",
                }
            ],
        },
    )
    history = client.get(
        "/api/batch/plans",
        params={"company": "历史测试企业"},
    )

    assert response.status_code == 200
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["plans"][0]["plan_id"] == response.json()["plan_id"]
