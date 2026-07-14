from datetime import datetime, timedelta
from hashlib import sha256
from io import StringIO
import csv
import json

from ..clock import Clock
from ..config import AI_V2_MODEL_VERSION, SCENARIO_EVENT_MULTIPLIERS
from ..exceptions import DomainValidationError, ErrorCode, PermissionDeniedError, ResourceNotFoundError
from ..ml.scenario_model import ScenarioWaitModel
from ..ml.scenario_features import PORTS as MODEL_PORTS
from ..repositories import DemoRepository
from ..schemas.enterprise_operations import WorkspaceKind


RISK_WEIGHTS = {"low": 0.0, "medium": 0.2, "high": 1.0}
ALLOWED_VIEWS = {item.value for item in WorkspaceKind}


class EnterpriseOperationsService:
    """Deterministic classroom operations decision flow.

    The service converts repository-owned reconstructed scenarios into an
    auditable baseline/recommendation comparison. It does not control vehicles,
    send notifications, or claim observed savings.
    """

    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        scenario_model: ScenarioWaitModel | None = None,
    ):
        self._repository = repository
        self._clock = clock
        self._scenario_model = scenario_model

    def resolve_workspace_kind(self, persona: dict, view_as: str | None = None) -> str:
        if view_as:
            if persona["role"] != "operator":
                raise PermissionDeniedError("只有 Demo 操作员可以切换演示视角")
            if view_as not in ALLOWED_VIEWS:
                raise DomainValidationError("未知企业运营工作空间", details={"view_as": view_as})
            return view_as
        workspace = persona.get("workspace_kind", "enterprise_client")
        if workspace == "personal":
            raise PermissionDeniedError("个人通勤身份不能访问企业运营控制塔")
        return workspace

    def _catalog(self) -> dict:
        catalog = self._repository.get_enterprise_operations()
        if not catalog.get("scenarios"):
            raise DomainValidationError("企业运营情景暂时不可用")
        return catalog

    def _scenarios_for_workspace(self, workspace_kind: str) -> list[dict]:
        scenarios = self._catalog()["scenarios"]
        if workspace_kind == "freight_operator":
            selected = [item for item in scenarios if item["workspace_kind"] == "freight_operator"]
        else:
            selected = [item for item in scenarios if item["workspace_kind"] == "coach_operator"]
        return selected or scenarios[:1]

    def _scenario(self, scenario_id: str, workspace_kind: str) -> dict:
        scenario = next(
            (item for item in self._scenarios_for_workspace(workspace_kind) if item["id"] == scenario_id),
            None,
        )
        if scenario is None:
            raise ResourceNotFoundError(
                ErrorCode.NOT_FOUND,
                "企业运营情景不存在或不适用于当前视角",
                details={"scenario_id": scenario_id, "workspace_kind": workspace_kind},
            )
        return scenario

    @staticmethod
    def _scenario_summary(scenario: dict) -> dict:
        return {
            key: scenario[key]
            for key in (
                "id", "name", "subtitle", "scenario_at", "horizon_hours",
                "source_label", "source_url", "problem_evidence",
                "problem_source_url", "evidence_boundary",
            )
        }

    def _ai_decision_trace(self, scenario: dict) -> dict:
        target_time = datetime.fromisoformat(scenario["scenario_at"]) + timedelta(hours=1)
        status = self._scenario_model.status if self._scenario_model is not None else None
        artifact_available = bool(status and status.available)
        model_supported_port_count = 0
        forecasts = []
        for port in scenario["ports"]:
            pressure = round(float(port.get("capacity_percent", 100)) / 100, 2)
            stress_signal = str(port.get("risk", "medium"))
            event_factor = SCENARIO_EVENT_MULTIPLIERS[
                "high" if stress_signal == "high" else "low" if stress_signal == "medium" else "none"
            ]
            prediction = (
                self._scenario_model.predict(
                    port=port["name"],
                    direction="hong_kong_to_shenzhen",
                    timestamp=target_time,
                    weather="clear",
                    is_holiday=False,
                    event_impact="none",
                    traffic_pressure=pressure,
                    traffic_available=True,
                )
                if artifact_available and self._scenario_model is not None and port["name"] in MODEL_PORTS
                else None
            )
            if prediction is None:
                base_wait = float(port["wait_minutes"])
                residual_q90 = 5.0
                forecast_source = "transparent scenario fallback"
            else:
                base_wait, residual_q90 = prediction
                model_supported_port_count += 1
                forecast_source = "checked-in HGB model"
            calibrated = max(1, round(base_wait * event_factor))
            interval_delta = max(1, round(residual_q90 * event_factor))
            forecasts.append(
                {
                    "port_id": port["id"],
                    "name": port["name"],
                    "model_base_wait_minutes": round(base_wait),
                    "calibrated_wait_minutes": calibrated,
                    "confidence_interval": [
                        max(1, calibrated - interval_delta),
                        calibrated + interval_delta,
                    ],
                    "traffic_pressure": pressure,
                    "stress_signal": stress_signal,
                    "forecast_source": forecast_source,
                }
            )
        coverage_status = (
            "full"
            if model_supported_port_count == len(scenario["ports"])
            else "partial"
            if model_supported_port_count
            else "fallback"
        )
        return {
            "model_available": model_supported_port_count > 0,
            "coverage_status": coverage_status,
            "model_supported_port_count": model_supported_port_count,
            "total_port_count": len(scenario["ports"]),
            "model_version": status.model_version if artifact_available and status and status.model_version else AI_V2_MODEL_VERSION,
            "prediction_engine": "HGB base forecast + transparent stress calibration + constraint optimizer",
            "target_time": target_time.isoformat(),
            "forecast_horizon_hours": scenario["horizon_hours"],
            "confidence_level": 0.9,
            "inputs": [
                "port and direction",
                "hour and weekday",
                "official cross-border traffic pressure",
                "reconstructed capacity stress",
            ],
            "optimization_objectives": [
                "minimize high-risk service tasks",
                "remove vehicle-cycle conflicts",
                "reduce scenario cost exposure with minimal schedule changes",
            ],
            "ports": forecasts,
            "disclosure": (
                "Supported ports use the checked-in HGB model; unsupported freight ports use an explicitly labelled transparent scenario fallback. "
                "Stress calibration and a deterministic constraint layer convert forecasts into dispatch actions. Wait labels and business outcomes remain classroom estimates, not observed performance."
            ),
        }

    def _ports_with_ai_forecast(self, scenario: dict, trace: dict) -> list[dict]:
        forecasts = {item["port_id"]: item for item in trace["ports"]}
        return [
            {
                **port,
                "wait_minutes": forecasts[port["id"]]["calibrated_wait_minutes"],
                "confidence_interval": forecasts[port["id"]]["confidence_interval"],
                "model_base_wait_minutes": forecasts[port["id"]]["model_base_wait_minutes"],
                "forecast_source": forecasts[port["id"]]["forecast_source"],
            }
            for port in scenario["ports"]
        ]

    def get_workspace(self, persona: dict, view_as: str | None = None) -> dict:
        workspace_kind = self.resolve_workspace_kind(persona, view_as)
        scenarios = self._scenarios_for_workspace(workspace_kind)
        active = scenarios[0]
        ai_trace = self._ai_decision_trace(active)
        official = workspace_kind == "port_authority"
        recent = self._repository.list_enterprise_operation_plans(
            persona["organization_id"], 5
        )
        return {
            "generated_at": self._clock.now(),
            "workspace_kind": workspace_kind,
            "organization_name": persona["organization_name"],
            "available_views": (
                ["coach_operator", "freight_operator", "enterprise_client", "port_authority"]
                if persona["role"] == "operator"
                else [workspace_kind]
            ),
            "scenarios": [self._scenario_summary(item) for item in scenarios],
            "active_scenario": self._scenario_summary(active),
            "ports": self._ports_with_ai_forecast(active, ai_trace),
            "assets": [] if official else active["assets"],
            "jobs": [] if official else active["jobs"],
            "recent_plans": [
                {
                    "plan_id": item["plan_id"],
                    "scenario": item["scenario"],
                    "status": item["status"],
                    "adopted_at": item["adopted_at"],
                    "notifications_created": item["notifications_created"],
                }
                for item in recent
            ],
            "coordination_notices": self._repository.list_coordination_notices(5),
            "ai_decision_trace": ai_trace,
            "demo_notice": self._catalog()["demo_notice"],
        }

    @staticmethod
    def _risk_exposure(job: dict, risk: str) -> int:
        return round(job.get("recovery_budget_hkd", 0) * RISK_WEIGHTS[risk])

    def preview(self, persona: dict, scenario_id: str, view_as: str | None = None) -> dict:
        workspace_kind = self.resolve_workspace_kind(persona, view_as)
        scenario = self._scenario(scenario_id, workspace_kind)
        ai_trace = self._ai_decision_trace(scenario)
        jobs = []
        actions = []
        for job in scenario["jobs"]:
            changed = bool(job.get("recommended_port_id"))
            recommended_risk = job.get("recommended_risk", job["baseline_risk"])
            arrival_delta = -8 if changed and scenario["workspace_kind"] == "coach_operator" else (-20 if changed else 0)
            result = {
                "id": job["id"],
                "label": job["label"],
                "direction": job["direction"],
                "asset_id": job["asset_id"],
                "passenger_count": job.get("passenger_count", 0),
                "load_units": job.get("load_units"),
                "baseline_port_id": job["baseline_port_id"],
                "baseline_port": job["baseline_port"],
                "baseline_departure_time": job["departure_time"],
                "baseline_arrival": job["baseline_arrival"],
                "baseline_risk": job["baseline_risk"],
                "recommended_port_id": job.get("recommended_port_id", job["baseline_port_id"]),
                "recommended_port": job.get("recommended_port", job["baseline_port"]),
                "recommended_departure_time": job.get("recommended_departure_time", job["departure_time"]),
                "recommended_arrival": job.get("recommended_arrival", job["baseline_arrival"]),
                "recommended_risk": recommended_risk,
                "changed": changed,
                "arrival_delta_minutes": arrival_delta,
                "exposure_before_hkd": self._risk_exposure(job, job["baseline_risk"]),
                "exposure_after_hkd": self._risk_exposure(job, recommended_risk),
            }
            jobs.append(result)
            if changed:
                action_id = f"reroute-{job['id']}"
                actions.append(
                    {
                        "id": action_id,
                        "action_type": "reroute_and_retime",
                        "target_id": job["id"],
                        "title": f"调整{job['label']}",
                        "detail": (
                            f"{job['baseline_port']} → {result['recommended_port']}；"
                            f"{job['departure_time']} → {result['recommended_departure_time']}"
                        ),
                        "impact": f"预计到达改善 {abs(arrival_delta)} 分钟，风险降为中风险",
                    }
                )

        if scenario["workspace_kind"] == "coach_operator":
            actions.append(
                {
                    "id": "recycle-A02-110",
                    "action_type": "vehicle_reallocation",
                    "target_id": "A02",
                    "title": "释放车辆 A02 周转冲突",
                    "detail": "完成 #103 改道后，A02 可继续执行班次 #110。",
                    "impact": "车辆周转冲突 1 → 0",
                }
            )

        baseline = {
            "total_jobs": len(jobs),
            "high_risk_count": sum(item["baseline_risk"] == "high" for item in jobs),
            "medium_risk_count": sum(item["baseline_risk"] == "medium" for item in jobs),
            "vehicle_conflicts": sum(asset["status"] == "cycle_conflict" for asset in scenario["assets"]),
            "cost_exposure_hkd": sum(item["exposure_before_hkd"] for item in jobs),
            "average_arrival_delta_minutes": 0,
            "affected_people": sum(item["passenger_count"] for item in jobs if item["baseline_risk"] == "high"),
        }
        changed_jobs = [item for item in jobs if item["changed"]]
        recommended = {
            "total_jobs": len(jobs),
            "high_risk_count": sum(item["recommended_risk"] == "high" for item in jobs),
            "medium_risk_count": sum(item["recommended_risk"] == "medium" for item in jobs),
            "vehicle_conflicts": 0 if changed_jobs else baseline["vehicle_conflicts"],
            "cost_exposure_hkd": sum(item["exposure_after_hkd"] for item in jobs),
            "average_arrival_delta_minutes": (
                round(sum(abs(item["arrival_delta_minutes"]) for item in changed_jobs) / len(changed_jobs))
                if changed_jobs else 0
            ),
            "affected_people": sum(item["passenger_count"] for item in changed_jobs),
        }
        fingerprint = json.dumps(
            {"version": self._catalog()["version"], "scenario": scenario_id, "workspace": workspace_kind},
            ensure_ascii=False,
            sort_keys=True,
        )
        preview_id = "preview-" + sha256(fingerprint.encode("utf-8")).hexdigest()[:12]
        official = workspace_kind == "port_authority"
        return {
            "preview_id": preview_id,
            "workspace_kind": workspace_kind,
            "scenario": self._scenario_summary(scenario),
            "baseline": baseline,
            "recommended": recommended,
            "jobs": [] if official else jobs,
            "actions": (
                [{
                    "id": "coordinate-capacity-window",
                    "action_type": "coordination",
                    "target_id": "network",
                    "title": "发布07:30–09:30协调建议",
                    "detail": "向运营方提示罗湖压力，并建议分流至福田及深圳湾。",
                    "impact": "聚合高风险任务 3 → 0（课堂情景）",
                }]
                if official else actions
            ),
            "ai_decision_trace": ai_trace,
            "explanation": [
                "等待、道路、班次和车辆约束由本地确定性情景共同计算。",
                "高/中/低风险权重分别为 1.0 / 0.2 / 0，用于计算情景成本暴露。",
                "推荐先最小化 SLA 风险和车辆冲突，再减少成本暴露与计划改动。",
            ],
            "demo_notice": self._catalog()["demo_notice"],
        }

    def adopt_plan(
        self,
        persona: dict,
        request: dict,
        view_as: str | None = None,
    ) -> dict:
        preview = self.preview(persona, request["scenario_id"], view_as)
        if request["preview_id"] != preview["preview_id"]:
            raise DomainValidationError(
                "预览已失效，请重新生成企业运营方案",
                details={"expected_preview_id": preview["preview_id"]},
            )
        available = {item["id"] for item in preview["actions"]}
        selected = request.get("selected_action_ids") or sorted(available)
        if not set(selected) <= available:
            raise DomainValidationError("采用方案包含未知措施")
        selected_set = set(selected)
        adopted_jobs = []
        for job in preview["jobs"]:
            if job["changed"] and f"reroute-{job['id']}" not in selected_set:
                job = {
                    **job,
                    "recommended_port_id": job["baseline_port_id"],
                    "recommended_port": job["baseline_port"],
                    "recommended_departure_time": job["baseline_departure_time"],
                    "recommended_arrival": job["baseline_arrival"],
                    "recommended_risk": job["baseline_risk"],
                    "changed": False,
                    "arrival_delta_minutes": 0,
                    "exposure_after_hkd": job["exposure_before_hkd"],
                }
            adopted_jobs.append(job)
        changed_jobs = [item for item in adopted_jobs if item["changed"]]
        recommended = {
            "total_jobs": len(adopted_jobs),
            "high_risk_count": sum(item["recommended_risk"] == "high" for item in adopted_jobs),
            "medium_risk_count": sum(item["recommended_risk"] == "medium" for item in adopted_jobs),
            "vehicle_conflicts": (
                0 if "recycle-A02-110" in selected_set else preview["baseline"]["vehicle_conflicts"]
            ),
            "cost_exposure_hkd": sum(item["exposure_after_hkd"] for item in adopted_jobs),
            "average_arrival_delta_minutes": (
                round(sum(abs(item["arrival_delta_minutes"]) for item in changed_jobs) / len(changed_jobs))
                if changed_jobs else 0
            ),
            "affected_people": sum(item["passenger_count"] for item in changed_jobs),
        }
        notifications = recommended["affected_people"]
        result = {
            **preview,
            "jobs": adopted_jobs,
            "recommended": recommended,
            "notifications_created": notifications,
            "notification_delivery": "sqlite-draft-only",
            "selected_action_ids": selected,
        }
        return self._repository.save_enterprise_operation_plan(
            organization_id=persona["organization_id"],
            workspace_kind=preview["workspace_kind"],
            scenario_id=request["scenario_id"],
            request=request,
            result=result,
        )

    def list_plans(self, persona: dict, limit: int) -> dict:
        plans = self._repository.list_enterprise_operation_plans(persona["organization_id"], limit)
        return {"plans": plans, "total": len(plans)}

    def record_outcome(self, persona: dict, plan_id: str, payload: dict) -> dict:
        plan = self._repository.get_enterprise_operation_plan(plan_id, persona["organization_id"])
        if plan is None:
            raise ResourceNotFoundError(ErrorCode.PLAN_NOT_FOUND, "企业运营方案不存在")
        outcome = {
            **payload,
            "recorded_at": self._clock.now().isoformat(),
            "demo_only": True,
            "high_risk_change": payload["actual_high_risk_count"] - plan["baseline"]["high_risk_count"],
        }
        stored = self._repository.save_enterprise_operation_outcome(
            plan_id, persona["organization_id"], outcome
        )
        if stored is None:
            raise ResourceNotFoundError(ErrorCode.PLAN_NOT_FOUND, "企业运营方案不存在")
        return stored

    def export_plan_csv(self, persona: dict, plan_id: str) -> str | None:
        plan = self._repository.get_enterprise_operation_plan(plan_id, persona["organization_id"])
        if plan is None:
            return None
        output = StringIO()
        fields = [
            "id", "label", "asset_id", "baseline_port", "recommended_port",
            "baseline_departure_time", "recommended_departure_time",
            "baseline_risk", "recommended_risk", "arrival_delta_minutes",
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for item in plan["jobs"]:
            writer.writerow({field: item.get(field, "") for field in fields})
        return output.getvalue()

    def create_notice(self, persona: dict, payload: dict) -> dict:
        if persona["role"] not in {"operator", "port_official"}:
            raise PermissionDeniedError("只有口岸协调身份可以发布协调建议")
        return self._repository.save_coordination_notice(
            persona["organization_id"], payload
        )

    def list_notices(self) -> dict:
        notices = self._repository.list_coordination_notices(20)
        return {"notices": notices, "total": len(notices)}
