from datetime import timedelta

from ..clock import Clock, HONG_KONG_TIMEZONE, as_hong_kong, ceil_minutes
from ..config import (
    MAX_TARGET_HORIZON_HOURS,
    MIN_TARGET_LEAD_MINUTES,
    REALTIME_POLL_INTERVAL_SECONDS,
)
from ..repositories import DemoRepository
from ..ml.snapshot import assess_v2_readiness
from ..ml.shadow import ShadowWaitModel
from ..ml.scenario_model import ScenarioWaitModel


class DemoService:
    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        shadow_model: ShadowWaitModel | None = None,
        scenario_model: ScenarioWaitModel | None = None,
    ):
        self._repository = repository
        self._clock = clock
        self._shadow_model = shadow_model
        self._scenario_model = scenario_model

    def get_context(self) -> dict:
        current_time = as_hong_kong(self._clock.now()).replace(microsecond=0)
        return {
            "current_time": current_time,
            "timezone": HONG_KONG_TIMEZONE,
            "min_target_time": ceil_minutes(
                current_time + timedelta(minutes=MIN_TARGET_LEAD_MINUTES),
                1,
            ),
            "suggested_target_time": ceil_minutes(
                current_time + timedelta(hours=2),
                15,
            ),
            "max_target_time": current_time + timedelta(hours=MAX_TARGET_HORIZON_HOURS),
            "poll_interval_seconds": REALTIME_POLL_INTERVAL_SECONDS,
        }

    def get_personas(self) -> dict:
        return self._repository.get_personas()

    def get_v1_model(self) -> dict:
        metadata = self._repository.get_v1_model_metadata()
        status = self._shadow_model.status if self._shadow_model else None
        return {
            "artifact_available": bool(status and status.available),
            "unavailable_reason": status.reason if status else "model_not_initialized",
            "model_version": metadata["model_version"],
            "synthetic_only": metadata["synthetic_only"],
            "dataset": metadata["dataset"],
            "split": metadata["split"],
            "metrics": metadata["metrics"],
            "features": metadata["features"],
            "promotion": metadata["promotion"],
            "limitations": [
                "所有指标仅用于合成数据工程参考。",
                "AI v1 只进行影子计算，不改变用户推荐。",
            ],
        }

    def get_v1_readiness(self) -> dict:
        route_errors = self._repository.get_route_validation_errors()
        provider_statuses = self._repository.get_provider_statuses()
        providers_ready = all(item["status"] == "available" for item in provider_statuses)
        personas = self._repository.get_personas()["personas"]
        status = self._shadow_model.status if self._shadow_model else None
        v2_status = self._scenario_model.status if self._scenario_model else None
        checks = [
            {
                "name": "双向地点与交通矩阵",
                "passed": not route_errors,
                "detail": "完整" if not route_errors else "；".join(route_errors),
            },
            {
                "name": "本地 Provider",
                "passed": providers_ready,
                "detail": f"{sum(item['status'] == 'available' for item in provider_statuses)}/{len(provider_statuses)} 可用",
            },
            {
                "name": "SQLite",
                "passed": self._repository.database_ready(),
                "detail": "Schema 可读取",
            },
            {
                "name": "Demo persona",
                "passed": len(personas) >= 3,
                "detail": f"{len(personas)} 个本地身份",
            },
            {
                "name": "AI v1 影子产物",
                "passed": bool(status and status.available),
                "detail": (
                    status.model_version
                    if status and status.available
                    else (status.reason if status else "未初始化")
                ),
            },
            {
                "name": "AI v2 场景产物",
                "passed": bool(v2_status and v2_status.available),
                "detail": v2_status.model_version if v2_status and v2_status.available else (v2_status.reason if v2_status else "未初始化"),
            },
            {
                "name": "本地通知适配器",
                "passed": True,
                "detail": "SQLite inbox",
            },
        ]
        return {
            "demo_ready": all(item["passed"] for item in checks),
            "checks": checks,
            "adapter_modes": {
                "database": "sqlite-local",
                "notifications": "sqlite-inbox",
                "queue": "synchronous-demo",
                "cache": "process-local",
                "identity": "demo-persona",
            },
        }

    def get_v2_model(self) -> dict:
        metadata = self._repository.get_v2_model_metadata()
        status = self._scenario_model.status if self._scenario_model else None
        return {
            "artifact_available": bool(status and status.available),
            "unavailable_reason": status.reason if status else "model_not_initialized",
            "model_version": metadata["model_version"],
            "synthetic_only": metadata["synthetic_only"],
            "evaluation_scope": metadata["evaluation_scope"],
            "dataset": metadata["dataset"],
            "split": metadata["split"],
            "metrics": metadata["metrics"],
            "features": metadata["features"],
            "limitations": metadata["limitations"],
        }

    def get_audit_events(self, limit: int) -> dict:
        events = self._repository.list_audit_events(limit)
        return {"events": events, "total": len(events)}

    def reset(self) -> dict:
        return {
            "success": True,
            "seeded": self._repository.reset_dynamic_data(),
            "message": "Demo 数据已按当前香港时间恢复为初始状态。",
        }

    def get_model_shadow_summary(self) -> dict:
        return self._repository.get_shadow_observation_summary()

    def get_v2_readiness(self) -> dict:
        return assess_v2_readiness(self._repository)
