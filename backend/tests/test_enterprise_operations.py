from fastapi.testclient import TestClient


def test_coach_workspace_preview_adopt_and_review(client: TestClient) -> None:
    headers = {"X-Demo-Persona-ID": "coach-dispatcher"}
    workspace = client.get("/api/enterprise-operations/workspace", headers=headers)
    assert workspace.status_code == 200
    assert workspace.json()["workspace_kind"] == "coach_operator"
    assert len(workspace.json()["jobs"]) == 10
    assert workspace.json()["ai_decision_trace"]["model_available"] is True
    assert workspace.json()["ai_decision_trace"]["coverage_status"] == "full"
    assert workspace.json()["ai_decision_trace"]["model_supported_port_count"] == 4
    assert workspace.json()["ai_decision_trace"]["model_version"] == "public-traffic-transparent-hgb-v2.2"
    luohu = next(item for item in workspace.json()["ports"] if item["id"] == "luohu")
    assert luohu["wait_minutes"] == 44
    assert luohu["confidence_interval"] == [41, 47]

    preview = client.post(
        "/api/enterprise-operations/previews",
        headers=headers,
        json={"scenario_id": "may-day-coach-surge"},
    )
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["baseline"]["high_risk_count"] == 3
    assert payload["recommended"]["high_risk_count"] == 0
    assert payload["baseline"]["vehicle_conflicts"] == 1
    assert payload["recommended"]["vehicle_conflicts"] == 0
    assert payload["baseline"]["cost_exposure_hkd"] == 12000
    assert payload["recommended"]["cost_exposure_hkd"] == 2400
    assert payload["recommended"]["average_arrival_delta_minutes"] == 8
    assert payload["recommended"]["affected_people"] == 147
    assert payload["ai_decision_trace"]["prediction_engine"].startswith("HGB base forecast")

    adopted = client.post(
        "/api/enterprise-operations/plans",
        headers=headers,
        json={
            "scenario_id": "may-day-coach-surge",
            "preview_id": payload["preview_id"],
            "selected_action_ids": [item["id"] for item in payload["actions"]],
        },
    )
    assert adopted.status_code == 201
    assert adopted.json()["notifications_created"] == 147
    assert adopted.json()["notification_delivery"] == "sqlite-draft-only"

    reviewed = client.patch(
        f"/api/enterprise-operations/plans/{adopted.json()['plan_id']}/outcome",
        headers=headers,
        json={
            "actual_high_risk_count": 0,
            "actual_average_arrival_delta_minutes": 8,
            "actual_support_contacts": 12,
            "note": "课堂复盘",
        },
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "reviewed"
    assert reviewed.json()["outcome"]["demo_only"] is True


def test_role_views_and_official_redaction(client: TestClient) -> None:
    official = client.get(
        "/api/enterprise-operations/workspace",
        headers={"X-Demo-Persona-ID": "port-official"},
    )
    assert official.status_code == 200
    assert official.json()["workspace_kind"] == "port_authority"
    assert official.json()["jobs"] == []
    assert official.json()["assets"] == []

    forbidden_switch = client.get(
        "/api/enterprise-operations/workspace?view_as=freight_operator",
        headers={"X-Demo-Persona-ID": "coach-dispatcher"},
    )
    assert forbidden_switch.status_code == 403

    operator_switch = client.get(
        "/api/enterprise-operations/workspace?view_as=freight_operator"
    )
    assert operator_switch.status_code == 200
    assert operator_switch.json()["workspace_kind"] == "freight_operator"
    assert operator_switch.json()["active_scenario"]["id"] == "freight-port-redistribution"
    assert operator_switch.json()["ai_decision_trace"]["coverage_status"] == "partial"
    assert operator_switch.json()["ai_decision_trace"]["model_supported_port_count"] == 1

    coach_after_freight = client.get("/api/enterprise-operations/workspace")
    assert coach_after_freight.json()["ai_decision_trace"]["coverage_status"] == "full"

    forbidden_notice = client.post(
        "/api/enterprise-operations/coordination-notices",
        headers={"X-Demo-Persona-ID": "enterprise-admin"},
        json={
            "title": "无权发布",
            "message": "测试",
            "affected_ports": ["luohu"],
            "valid_until": "2026-07-10T10:00:00+08:00",
            "severity": "medium",
        },
    )
    assert forbidden_notice.status_code == 403

    notice = client.post(
        "/api/enterprise-operations/coordination-notices",
        headers={"X-Demo-Persona-ID": "port-official"},
        json={
            "title": "口岸协调建议",
            "message": "建议分流高风险班次。",
            "affected_ports": ["luohu", "futian"],
            "valid_until": "2026-07-10T10:00:00+08:00",
            "severity": "high",
        },
    )
    assert notice.status_code == 201
    assert notice.json()["demo_only"] is True


def test_operations_reset_removes_adopted_plans(client: TestClient) -> None:
    preview = client.post(
        "/api/enterprise-operations/previews",
        json={"scenario_id": "may-day-coach-surge"},
    ).json()
    client.post(
        "/api/enterprise-operations/plans",
        json={
            "scenario_id": "may-day-coach-surge",
            "preview_id": preview["preview_id"],
            "selected_action_ids": [],
        },
    )
    assert client.get("/api/enterprise-operations/plans").json()["total"] == 1
    assert client.post("/api/demo/reset").status_code == 200
    assert client.get("/api/enterprise-operations/plans").json()["total"] == 0


def test_adopting_selected_actions_only_recalculates_result(client: TestClient) -> None:
    headers = {"X-Demo-Persona-ID": "coach-dispatcher"}
    preview = client.post(
        "/api/enterprise-operations/previews",
        headers=headers,
        json={"scenario_id": "may-day-coach-surge"},
    ).json()
    adopted = client.post(
        "/api/enterprise-operations/plans",
        headers=headers,
        json={
            "scenario_id": "may-day-coach-surge",
            "preview_id": preview["preview_id"],
            "selected_action_ids": ["reroute-101"],
        },
    )
    assert adopted.status_code == 201
    result = adopted.json()
    assert result["recommended"]["high_risk_count"] == 2
    assert result["recommended"]["vehicle_conflicts"] == 1
    assert result["recommended"]["affected_people"] == 49
    assert result["notifications_created"] == 49
