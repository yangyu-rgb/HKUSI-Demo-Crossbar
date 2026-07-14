from fastapi.testclient import TestClient


COACH_HEADERS = {"X-Demo-Persona-ID": "coach-dispatcher"}


def coach_workspace(client: TestClient) -> dict:
    response = client.get("/api/enterprise-operations/workspace", headers=COACH_HEADERS)
    assert response.status_code == 200
    return response.json()


def test_coach_input_preview_adopt_and_review(client: TestClient) -> None:
    workspace = coach_workspace(client)
    assert workspace["workspace_kind"] == "coach_operator"
    assert len(workspace["sample_jobs"]) == 10
    assert len(workspace["scenario_presets"]) == 4
    assert workspace["ai_decision_trace"]["coverage_status"] == "full"
    assert workspace["ai_decision_trace"]["model_supported_port_count"] == 4
    assert workspace["ai_decision_trace"]["model_version"] == "public-traffic-transparent-hgb-v2.2"

    holiday = next(item for item in workspace["scenario_presets"] if item["preset_id"] == "holiday-peak")
    preview = client.post(
        "/api/enterprise-operations/previews",
        headers=COACH_HEADERS,
        json={"jobs": workspace["sample_jobs"], "scenario": holiday},
    )
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["baseline"]["high_risk_count"] > payload["recommended"]["high_risk_count"]
    assert payload["baseline"]["vehicle_conflicts"] == 1
    assert payload["recommended"]["vehicle_conflicts"] == 0
    assert payload["baseline"]["cost_exposure_hkd"] > payload["recommended"]["cost_exposure_hkd"]
    assert payload["recommended"]["changed_jobs"] > 0
    assert payload["ai_decision_trace"]["prediction_engine"].startswith("HGB base forecast")
    assert all("predicted_wait_minutes" in item for item in payload["jobs"])

    adopted = client.post(
        "/api/enterprise-operations/plans",
        headers=COACH_HEADERS,
        json={
            "scenario_id": holiday["preset_id"],
            "scenario": holiday,
            "jobs": workspace["sample_jobs"],
            "preview_id": payload["preview_id"],
            "selected_action_ids": [item["id"] for item in payload["actions"]],
        },
    )
    assert adopted.status_code == 201
    assert adopted.json()["notifications_created"] == adopted.json()["recommended"]["affected_people"]
    assert adopted.json()["notification_delivery"] == "sqlite-draft-only"

    reviewed = client.patch(
        f"/api/enterprise-operations/plans/{adopted.json()['plan_id']}/outcome",
        headers=COACH_HEADERS,
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


def test_csv_templates_validation_and_scenario_comparison(client: TestClient) -> None:
    template = client.get(
        "/api/enterprise-operations/templates/coach_operator.csv?sample=true",
        headers=COACH_HEADERS,
    )
    assert template.status_code == 200
    assert "passenger_count" in template.text
    validated = client.post(
        "/api/enterprise-operations/imports/validate",
        headers=COACH_HEADERS,
        json={"workspace_kind": "coach_operator", "csv_text": template.text},
    )
    assert validated.status_code == 200
    assert validated.json()["valid"] is True
    assert validated.json()["summary"]["rows"] == 10

    invalid = client.post(
        "/api/enterprise-operations/imports/validate",
        headers=COACH_HEADERS,
        json={"workspace_kind": "coach_operator", "csv_text": "id,label\n1,test\n"},
    )
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False
    assert "缺少列" in invalid.json()["errors"][0]["message"]

    comparison = client.post(
        "/api/enterprise-operations/comparisons",
        headers=COACH_HEADERS,
        json={
            "jobs": validated.json()["jobs"],
            "scenario_ids": ["normal-weekday", "holiday-peak", "concert-release", "typhoon-severe-weather"],
        },
    )
    assert comparison.status_code == 200
    scenarios = comparison.json()["scenarios"]
    assert len(scenarios) == 4
    assert {item["scenario"]["preset_id"] for item in scenarios} == {
        "normal-weekday", "holiday-peak", "concert-release", "typhoon-severe-weather"
    }
    normal = next(item for item in scenarios if item["scenario"]["preset_id"] == "normal-weekday")
    holiday = next(item for item in scenarios if item["scenario"]["preset_id"] == "holiday-peak")
    assert holiday["baseline"]["high_risk_count"] > normal["baseline"]["high_risk_count"]
    assert all(item["recommended"]["vehicle_conflicts"] == 0 for item in scenarios)


def test_custom_closed_port_is_never_recommended(client: TestClient) -> None:
    workspace = coach_workspace(client)
    scenario = next(item for item in workspace["scenario_presets"] if item["preset_id"] == "typhoon-severe-weather")
    scenario["port_constraints"]["shenzhen-bay"] = "closed"
    preview = client.post(
        "/api/enterprise-operations/previews",
        headers=COACH_HEADERS,
        json={"jobs": workspace["sample_jobs"], "scenario": scenario},
    )
    assert preview.status_code == 200
    assert all(item["recommended_port_id"] != "shenzhen-bay" for item in preview.json()["jobs"])
    assert "Typhoon is represented transparently" in preview.json()["ai_decision_trace"]["disclosure"]


def test_role_views_and_official_redaction(client: TestClient) -> None:
    official = client.get(
        "/api/enterprise-operations/workspace",
        headers={"X-Demo-Persona-ID": "port-official"},
    )
    assert official.status_code == 200
    assert official.json()["workspace_kind"] == "port_authority"
    assert official.json()["jobs"] == []
    assert official.json()["sample_jobs"] == []
    assert official.json()["assets"] == []

    forbidden_switch = client.get(
        "/api/enterprise-operations/workspace?view_as=freight_operator",
        headers=COACH_HEADERS,
    )
    assert forbidden_switch.status_code == 403

    operator_switch = client.get("/api/enterprise-operations/workspace?view_as=freight_operator")
    assert operator_switch.status_code == 200
    assert operator_switch.json()["workspace_kind"] == "freight_operator"
    assert operator_switch.json()["active_scenario"]["id"] == "normal-weekday"
    assert operator_switch.json()["ai_decision_trace"]["coverage_status"] == "partial"
    assert operator_switch.json()["ai_decision_trace"]["model_supported_port_count"] == 1
    assert "load_units" in operator_switch.json()["csv_columns"]

    coach_after_freight = client.get("/api/enterprise-operations/workspace")
    assert coach_after_freight.json()["ai_decision_trace"]["coverage_status"] == "full"

    forbidden_notice = client.post(
        "/api/enterprise-operations/coordination-notices",
        headers={"X-Demo-Persona-ID": "enterprise-admin"},
        json={
            "title": "无权发布", "message": "测试", "affected_ports": ["luohu"],
            "valid_until": "2026-07-15T10:00:00+08:00", "severity": "medium",
        },
    )
    assert forbidden_notice.status_code == 403

    notice = client.post(
        "/api/enterprise-operations/coordination-notices",
        headers={"X-Demo-Persona-ID": "port-official"},
        json={
            "title": "口岸协调建议", "message": "建议分流高风险班次。", "affected_ports": ["luohu", "futian"],
            "valid_until": "2026-07-15T10:00:00+08:00", "severity": "high",
        },
    )
    assert notice.status_code == 201
    assert notice.json()["demo_only"] is True


def test_operations_reset_removes_adopted_plans(client: TestClient) -> None:
    workspace = client.get("/api/enterprise-operations/workspace").json()
    scenario = workspace["scenario_presets"][0]
    request = {"jobs": workspace["sample_jobs"], "scenario": scenario}
    preview = client.post("/api/enterprise-operations/previews", json=request).json()
    client.post(
        "/api/enterprise-operations/plans",
        json={**request, "scenario_id": scenario["preset_id"], "preview_id": preview["preview_id"], "selected_action_ids": []},
    )
    assert client.get("/api/enterprise-operations/plans").json()["total"] == 1
    assert client.post("/api/demo/reset").status_code == 200
    assert client.get("/api/enterprise-operations/plans").json()["total"] == 0


def test_adopting_selected_actions_only_recalculates_result(client: TestClient) -> None:
    workspace = coach_workspace(client)
    scenario = next(item for item in workspace["scenario_presets"] if item["preset_id"] == "holiday-peak")
    request = {"jobs": workspace["sample_jobs"], "scenario": scenario}
    preview = client.post("/api/enterprise-operations/previews", headers=COACH_HEADERS, json=request).json()
    selected = preview["actions"][0]
    adopted = client.post(
        "/api/enterprise-operations/plans",
        headers=COACH_HEADERS,
        json={
            **request,
            "scenario_id": scenario["preset_id"],
            "preview_id": preview["preview_id"],
            "selected_action_ids": [selected["id"]],
        },
    )
    assert adopted.status_code == 201
    result = adopted.json()
    assert result["recommended"]["changed_jobs"] == 1
    assert result["notifications_created"] == result["recommended"]["affected_people"]
    assert result["notifications_created"] > 0
