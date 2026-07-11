from fastapi.testclient import TestClient


def test_health_realtime_and_locations(client: TestClient) -> None:
    health = client.get("/api/health")
    realtime = client.get("/api/realtime")
    locations = client.get("/api/locations")

    assert health.status_code == 200
    assert realtime.status_code == 200
    assert locations.status_code == 200
    assert len(realtime.json()["ports"]) == 4
    assert len(locations.json()["origins"]) == 10
    assert len(locations.json()["destinations"]) == 10
    assert len(locations.json()["directions"]) == 2
    assert health.headers["X-Content-Type-Options"] == "nosniff"


def test_v1_model_personas_and_readiness(client: TestClient) -> None:
    personas = client.get("/api/demo/personas")
    model = client.get("/api/demo/v1-model")
    readiness = client.get("/api/demo/v1-readiness")
    ready_health = client.get("/api/health/ready")

    assert personas.status_code == model.status_code == readiness.status_code == 200
    assert len(personas.json()["personas"]) == 3
    assert model.json()["synthetic_only"] is True
    route_check = next(
        item for item in readiness.json()["checks"]
        if item["name"] == "双向地点与交通矩阵"
    )
    assert route_check["passed"] is True
    assert ready_health.status_code == 200


def test_v2_readiness_separates_official_features_from_minute_labels(
    client: TestClient,
) -> None:
    response = client.get("/api/demo/v2-readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["label_count"] == 0
    assert payload["external_data"]["minute_labels_from_official_features"] == 0
    assert len(payload["external_data"]["sources"]) == 5
    assert next(
        source
        for source in payload["external_data"]["sources"]
        if source["id"] == "shenzhen_iport"
    )["status"] == "blocked"


def test_reverse_direction_prediction(client: TestClient) -> None:
    response = client.post(
        "/api/predict",
        json={
            "origin_id": "qianhai",
            "destination_id": "central",
            "target_time": "2026-07-10T10:30:00",
            "preferences": {"priority": "balanced"},
        },
    )

    assert response.status_code == 200
    assert response.json()["direction"] == "shenzhen_to_hong_kong"
    assert response.json()["query"]["direction"] == "shenzhen_to_hong_kong"
    assert len(response.json()["ports"]) == 4


def test_same_city_route_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "central",
            "target_time": "2026-07-10T10:30:00",
        },
    )

    assert response.status_code == 422
    assert "深港两侧" in response.json()["error"]["message"]


def test_feedback_direction_must_match_forecast(client: TestClient) -> None:
    prediction = client.post(
        "/api/predict",
        json={
            "origin_id": "qianhai",
            "destination_id": "central",
            "target_time": "2026-07-10T10:30:00",
        },
    ).json()
    response = client.post(
        "/api/crowdsource/report",
        json={
            "user_id": "direction-user",
            "port": "福田",
            "actual_wait_time": 12,
            "crowd_level": "low",
            "forecast_run_id": prediction["forecast_run_id"],
            "forecast_port_id": "futian",
            "direction": "hong_kong_to_shenzhen",
        },
    )

    assert response.status_code == 422
    assert "方向" in response.json()["error"]["message"]


def test_batch_csv_validation_export_and_notification_inbox(client: TestClient) -> None:
    csv_response = client.post(
        "/api/batch/csv/validate",
        json={
            "csv_text": (
                "id,name,origin_id,destination_id,arrival_deadline\n"
                "E-9,反向员工,qianhai,central,10:30\n"
            )
        },
    )
    assert csv_response.status_code == 200
    assert csv_response.json()["valid"] is True

    plan = client.post(
        "/api/batch",
        json={
            "company": "CSV 测试企业",
            "date": "2026-07-10",
            "employees": csv_response.json()["employees"],
        },
    )
    exported = client.get(f"/api/batch/plans/{plan.json()['plan_id']}/export.csv")
    assert exported.status_code == 200
    assert "反向员工" in exported.text

    first_cycle = client.post("/api/demo/alerts/run-cycle?user_id=demo-user")
    second_cycle = client.post("/api/demo/alerts/run-cycle?user_id=demo-user")
    inbox = client.get("/api/notifications?user_id=demo-user")
    assert first_cycle.status_code == second_cycle.status_code == inbox.status_code == 200
    assert first_cycle.json()["created_notifications"] >= 1
    assert second_cycle.json()["created_notifications"] == 0
    notification = inbox.json()["notifications"][0]
    marked = client.patch(f"/api/notifications/{notification['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True


def test_demo_persona_permissions_cover_business_and_audit(client: TestClient) -> None:
    commuter_headers = {"X-Demo-Persona-ID": "commuter-user"}
    business_payload = {
        "company": "权限测试企业",
        "date": "2026-07-10",
        "employees": [
            {
                "id": "E-1",
                "origin_id": "hku",
                "destination_id": "nanshan-tech",
                "arrival_deadline": "10:30",
            }
        ],
    }

    forbidden_batch = client.post(
        "/api/batch", json=business_payload, headers=commuter_headers
    )
    forbidden_audit = client.get("/api/demo/audit", headers=commuter_headers)
    operator_batch = client.post("/api/batch", json=business_payload)
    operator_audit = client.get("/api/demo/audit")

    assert forbidden_batch.status_code == 403
    assert forbidden_batch.json()["error"]["code"] == "FORBIDDEN"
    assert forbidden_audit.status_code == 403
    assert operator_batch.status_code == 200
    assert operator_audit.status_code == 200
    assert any(
        event["path"] == "/api/batch" for event in operator_audit.json()["events"]
    )


def test_explicit_demo_persona_cannot_access_another_users_subscription(
    client: TestClient,
) -> None:
    commuter_headers = {"X-Demo-Persona-ID": "commuter-user"}
    operator_headers = {"X-Demo-Persona-ID": "demo-user"}
    created = client.post(
        "/api/subscriptions",
        headers=commuter_headers,
        json={
            "user_id": "ignored-client-value",
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
    subscription_id = created.json()["subscription_id"]

    own_preview = client.get(
        f"/api/subscriptions/{subscription_id}/preview",
        headers=commuter_headers,
    )
    other_preview = client.get(
        f"/api/subscriptions/{subscription_id}/preview",
        headers=operator_headers,
    )

    assert created.status_code == 201
    assert created.json()["user_id"] == "commuter-user"
    assert own_preview.status_code == 200
    assert other_preview.status_code == 404


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
    assert payload["prediction_engine"] == "v2"
    assert payload["scenario"]["weather"] == "clear"
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


def test_scenario_override_changes_v2_prediction_and_can_reset(client: TestClient) -> None:
    request_payload = {
        "origin_id": "hku",
        "destination_id": "nanshan-tech",
        "target_time": "2026-07-10T09:30:00",
        "preferences": {"priority": "balanced", "max_budget": 100},
    }
    baseline = client.post("/api/predict", json=request_payload).json()
    saved = client.put(
        "/api/demo/scenarios/2026-07-10",
        json={
            "weather": "heavy_rain",
            "is_holiday": True,
            "events": [{
                "name": "深圳湾大型活动",
                "preset": "exhibition",
                "direction": "hong_kong_to_shenzhen",
                "affected_ports": ["深圳湾"],
                "start_time": "08:00",
                "end_time": "12:00",
                "impact": "high",
            }],
        },
    )
    changed = client.post("/api/predict", json=request_payload).json()

    assert saved.status_code == 200
    assert changed["scenario"]["is_override"] is True
    baseline_bay = next(item for item in baseline["ports"] if item["port_id"] == "shenzhen-bay")
    changed_bay = next(item for item in changed["ports"] if item["port_id"] == "shenzhen-bay")
    assert changed_bay["predicted_wait_time"] > baseline_bay["predicted_wait_time"]
    assert changed_bay["scenario_delta_minutes"] > 0
    assert changed["recommended_port_id"] != "shenzhen-bay"

    restored = client.delete("/api/demo/scenarios/2026-07-10")
    assert restored.status_code == 200
    assert restored.json()["is_override"] is False


def test_only_operator_can_modify_scenarios(client: TestClient) -> None:
    response = client.put(
        "/api/demo/scenarios/2026-07-10",
        headers={"X-Demo-Persona-ID": "commuter-user"},
        json={"weather": "rain", "is_holiday": False, "events": []},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


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
                    "arrival_deadline": "10:30",
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


def test_subscription_preview_uses_next_commute_and_alert_preferences(
    client: TestClient,
) -> None:
    created = client.post(
        "/api/subscriptions",
        json={
            "user_id": "preview-user",
            "routine": {
                "origin_id": "hku",
                "destination_id": "nanshan-tech",
                "days": ["monday"],
                "arrival_deadline": "09:30",
                "priority": "balanced",
            },
            "alerts": {
                "advance_reminder": True,
                "anomaly_alert": False,
                "better_route_alert": True,
            },
        },
    )
    assert created.status_code == 201
    assert created.json()["next_alert"].startswith("2026-07-13T")

    preview = client.get(
        f"/api/subscriptions/{created.json()['subscription_id']}/preview"
    )

    assert preview.status_code == 200
    payload = preview.json()
    assert payload["commute_date"] == "2026-07-13"
    assert payload["target_time"] == "2026-07-13T09:30:00+08:00"
    assert payload["evaluation_time"] == "2026-07-13T06:30:00+08:00"
    assert payload["recommended_port_id"]
    assert len(payload["alerts"]) == 3
    assert payload["alerts"][0]["triggered"] is True
    assert payload["alerts"][1]["enabled"] is False
    assert client.app.state.repository.list_shadow_observations() == []


def test_subscription_evaluation_history_can_be_saved_and_marked_read(
    client: TestClient,
) -> None:
    subscription_id = client.get(
        "/api/subscriptions",
        params={"user_id": "demo-user"},
    ).json()["subscriptions"][0]["subscription_id"]

    preview = client.get(f"/api/subscriptions/{subscription_id}/preview")
    saved = client.post(f"/api/subscriptions/{subscription_id}/evaluations")

    assert preview.status_code == 200
    assert saved.status_code == 201
    record = saved.json()
    assert record["subscription_id"] == subscription_id
    assert record["is_read"] is False
    assert "evaluation_id" in record
    assert record["recommended_port"] == preview.json()["recommended_port"]

    history = client.get(f"/api/subscriptions/{subscription_id}/evaluations")
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["unread_total"] == 1

    marked = client.patch(
        f"/api/subscription-evaluations/{record['evaluation_id']}/read"
    )
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True
    assert marked.json()["read_at"]

    history = client.get(f"/api/subscriptions/{subscription_id}/evaluations")
    assert history.json()["unread_total"] == 0


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
                    "arrival_deadline": "10:30",
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


def test_batch_preferences_are_explicit_and_visible(client: TestClient) -> None:
    response = client.post(
        "/api/batch",
        json={
            "company": "偏好测试企业",
            "date": "2026-07-10",
            "preferences": {"priority": "cheapest", "max_budget": 100},
            "employees": [
                {
                    "id": "E-default",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "10:30",
                },
                {
                    "id": "E-override",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "10:30",
                    "preferences": {"priority": "fastest", "max_budget": 100},
                },
            ],
        },
    )

    assert response.status_code == 200
    plan = {item["employee_id"]: item for item in response.json()["plan"]}
    assert plan["E-default"]["priority"] == "cheapest"
    assert plan["E-default"]["recommended_port"] == "罗湖"
    assert plan["E-override"]["priority"] == "fastest"
    assert plan["E-override"]["recommended_port"] == "深圳湾"


def test_model_shadow_summary_reports_prediction_observations(client: TestClient) -> None:
    prediction = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced", "max_budget": 100},
        },
    )
    summary = client.get("/api/demo/model-shadow-summary")

    assert prediction.status_code == 200
    assert summary.status_code == 200
    payload = summary.json()
    assert payload["total_observations"] == 4
    assert payload["available_observations"] + payload["unavailable_observations"] == 4
    assert len(payload["ports"]) == 4


def test_high_quality_feedback_creates_labeled_forecast_observation(
    client: TestClient,
) -> None:
    prediction = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced"},
        },
    )
    assert prediction.status_code == 200
    forecast_run_id = prediction.json()["forecast_run_id"]
    assert forecast_run_id

    port = client.get("/api/realtime").json()["ports"][0]
    crowd_level = (
        "low"
        if port["current_wait"] < 18
        else "medium" if port["current_wait"] < 35 else "high"
    )
    report = client.post(
        "/api/crowdsource/report",
        json={
            "user_id": "forecast-feedback-user",
            "port": port["name"],
            "actual_wait_time": port["current_wait"],
            "crowd_level": crowd_level,
            "forecast_run_id": forecast_run_id,
            "forecast_port_id": port["id"],
            "direction": "hong_kong_to_shenzhen",
            "channel": "traveller",
            "is_real_observation": True,
            "training_consent": True,
            "comment": "关联预测的高质量实际等待反馈",
        },
    )

    assert report.status_code == 200
    assert report.json()["forecast_feedback"]["linked"] is True
    assert report.json()["forecast_feedback"]["labeled"] is True
    assert report.json()["report"]["source_type"] == "crowdsource_observation"
    assert report.json()["report"]["eligible_for_v2_label"] is True
    labels = client.app.state.repository.list_labeled_forecast_rows()
    assert len(labels) == 1
    assert labels[0]["forecast_run_id"] == forecast_run_id
    assert labels[0]["observed_wait_minutes"] == port["current_wait"]

    readiness = client.get("/api/demo/v2-readiness")
    assert readiness.status_code == 200
    assert readiness.json()["label_count"] == 1
    assert readiness.json()["excluded_feedback_count"] == 0
    assert readiness.json()["experiment_ready"] is False


def test_demo_feedback_is_linked_but_excluded_from_v2_labels(
    client: TestClient,
) -> None:
    prediction = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T09:30:00",
            "preferences": {"priority": "balanced"},
        },
    ).json()
    port = client.get("/api/realtime").json()["ports"][0]
    report = client.post(
        "/api/crowdsource/report",
        json={
            "user_id": "demo-label-user",
            "port": port["name"],
            "actual_wait_time": port["current_wait"],
            "crowd_level": port["crowd_level"],
            "forecast_run_id": prediction["forecast_run_id"],
            "forecast_port_id": port["id"],
        },
    )

    assert report.status_code == 200
    assert report.json()["forecast_feedback"]["linked"] is True
    assert report.json()["forecast_feedback"]["labeled"] is False
    assert "演示反馈" in report.json()["forecast_feedback"]["reason"]
    readiness = client.get("/api/demo/v2-readiness").json()
    assert readiness["label_count"] == 0
    assert readiness["linked_feedback_count"] == 1
    assert readiness["excluded_feedback_count"] == 1


def test_training_consent_requires_real_observation(client: TestClient) -> None:
    response = client.post(
        "/api/crowdsource/report",
        json={
            "port": "福田",
            "actual_wait_time": 14,
            "crowd_level": "low",
            "training_consent": True,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_demo_end_to_end_flow_and_reset(client: TestClient) -> None:
    assert client.post("/api/demo/reset").status_code == 200
    assert client.get("/api/realtime").status_code == 200

    prediction = client.post(
        "/api/predict",
        json={
            "origin_id": "hku",
            "destination_id": "nanshan-tech",
            "target_time": "2026-07-10T10:30:00",
            "preferences": {"priority": "balanced", "max_budget": 100},
        },
    )
    report = client.post(
        "/api/crowdsource/report",
        json={
            "user_id": "demo-e2e-user",
            "port": "罗湖",
            "actual_wait_time": 24,
            "crowd_level": "medium",
            "comment": "端到端验证反馈",
        },
    )
    subscription = client.post(
        "/api/subscriptions",
        json={
            "user_id": "demo-e2e-user",
            "routine": {
                "origin_id": "hku",
                "destination_id": "nanshan-tech",
                "days": ["friday"],
                "arrival_deadline": "10:30",
                "priority": "balanced",
            },
            "alerts": {
                "advance_reminder": True,
                "anomaly_alert": True,
                "better_route_alert": True,
            },
        },
    )
    preview = client.get(
        f"/api/subscriptions/{subscription.json()['subscription_id']}/preview"
    )
    batch = client.post(
        "/api/batch",
        json={
            "company": "端到端验证企业",
            "date": "2026-07-10",
            "preferences": {"priority": "balanced", "max_budget": 100},
            "employees": [
                {
                    "id": "E-1",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "10:30",
                },
                {
                    "id": "E-2",
                    "origin_id": "central",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "10:30",
                    "preferences": {"priority": "fastest", "max_budget": 100},
                },
            ],
        },
    )
    shadow_before_reset = client.get("/api/demo/model-shadow-summary")

    assert prediction.status_code == 200
    assert report.status_code == 200
    assert subscription.status_code == 201
    assert preview.status_code == 200
    assert preview.json()["recommended_port_id"]
    assert batch.status_code == 200
    assert shadow_before_reset.json()["total_observations"] >= 12

    reset = client.post("/api/demo/reset")
    reports_after_reset = client.get("/api/crowdsource/feed")
    plans_after_reset = client.get(
        "/api/batch/plans",
        params={"company": "端到端验证企业"},
    )
    shadow_after_reset = client.get("/api/demo/model-shadow-summary")

    assert reset.status_code == 200
    assert reset.json()["seeded"] == {"reports": 4, "subscriptions": 1, "batch_plans": 0}
    assert reports_after_reset.json()["total"] == 4
    assert plans_after_reset.json()["total"] == 0
    assert shadow_after_reset.json()["total_observations"] == 0
