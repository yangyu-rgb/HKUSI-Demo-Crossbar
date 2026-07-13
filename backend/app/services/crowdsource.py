from datetime import datetime, timezone
from math import ceil

from ..config import REPORT_DUPLICATE_WINDOW_MINUTES
from ..clock import Clock, as_hong_kong
from ..exceptions import ConflictError, DomainValidationError, ErrorCode
from ..repositories import DemoRepository
from ..schemas.crowdsource import CrowdsourceReport
from .report_quality import evaluate_report, public_report
from .wait_forecast import WaitForecastService


class CrowdsourceService:
    def __init__(self, repository: DemoRepository, clock: Clock):
        self._repository = repository
        self._clock = clock
        self._forecast = WaitForecastService(repository, clock)

    def get_feed(self, limit: int) -> dict:
        safe_limit = min(max(limit, 1), 30)
        _snapshot, reports = self._forecast.build_snapshot()
        reports = [
            report
            for report in reports
            if report["_active"]
        ]
        return {
            "reports": [
                public_report(report)
                for report in reversed(reports[-safe_limit:])
            ],
            "total": len(reports),
        }

    def submit(self, report: CrowdsourceReport) -> dict:
        now = as_hong_kong(self._clock.now()).replace(microsecond=0)
        port_state, existing_reports = self._forecast.build_snapshot(now)
        normalized = report.port.strip().lower()
        port = next(
            (
                item
                for item in port_state["ports"]
                if normalized
                in {item["id"], item["name"].lower(), item["name_en"].lower()}
            ),
            None,
        )
        if port is None:
            raise DomainValidationError(
                "不支持该口岸",
                code=ErrorCode.PORT_NOT_FOUND,
                details={"port": report.port},
            )

        forecast_port_id = report.forecast_port_id or port["id"]
        if report.forecast_run_id:
            forecast_port = self._repository.get_forecast_run_port(
                report.forecast_run_id,
                forecast_port_id,
            )
            if forecast_port is None:
                raise DomainValidationError(
                    "预测运行不存在，或反馈口岸与预测口岸不匹配",
                    details={
                        "forecast_run_id": report.forecast_run_id,
                        "forecast_port_id": forecast_port_id,
                    },
                )
            if forecast_port["direction"] != report.direction:
                raise DomainValidationError(
                    "反馈方向与关联预测不一致",
                    details={
                        "forecast_direction": forecast_port["direction"],
                        "report_direction": report.direction,
                    },
                )

        duplicate_age = None
        now_utc = now.astimezone(timezone.utc)
        for item in reversed(existing_reports):
            if item["user_id"] != report.user_id or item["port"] != port["name"]:
                continue
            created_at = datetime.fromisoformat(item["_created_at"])
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            age = max(0.0, (now_utc - created_at).total_seconds() / 60)
            if age < REPORT_DUPLICATE_WINDOW_MINUTES:
                duplicate_age = age
                break
        if duplicate_age is not None:
            retry_after = max(
                1,
                ceil(
                    REPORT_DUPLICATE_WINDOW_MINUTES
                    - duplicate_age
                ),
            )
            raise ConflictError(
                ErrorCode.DUPLICATE_REPORT,
                f"同一口岸反馈提交过于频繁，请在{retry_after}分钟后重试",
                details={"retry_after_minutes": retry_after},
            )

        record = {
            "user_id": report.user_id,
            "port": port["name"],
            "actual_wait_time": report.actual_wait_time,
            "crowd_level": report.crowd_level,
            "timestamp": now.isoformat(),
            "time_label": "刚刚",
            "comment": report.comment or "现场通关反馈",
            "direction": report.direction,
            "channel": report.channel,
            "is_real_observation": False,
            "training_consent": False,
            "source_type": "demo_entry",
            "wait_started_at": None,
            "wait_ended_at": None,
        }
        stored = self._repository.add_report(record)
        evaluated = evaluate_report(stored, port, now)
        record = public_report(evaluated)
        forecast_feedback = None
        if report.forecast_run_id:
            link = self._repository.link_feedback_to_forecast(
                report_id=record["id"],
                forecast_run_id=report.forecast_run_id,
                port_id=forecast_port_id,
                actual_wait_minutes=record["actual_wait_time"],
                quality_score=record["quality_score"],
                eligible_for_label=False,
                ineligibility_reason="课堂 Demo 只用于当前预测校准，不收集训练标签",
            )
            assert link is not None
            record["forecast_run_id"] = report.forecast_run_id
            record["forecast_port_id"] = forecast_port_id
            forecast_feedback = {
                "forecast_run_id": report.forecast_run_id,
                "forecast_port_id": forecast_port_id,
                "linked": bool(link["linked"]),
                "calibration_linked": bool(link["linked"]),
                "reason": "已关联本次课堂预测校准，不进入训练数据。",
            }
        points = {
            "high": 10,
            "medium": 6,
            "low": 2,
        }[record["quality_level"]]
        model_updated = (
            record["used_for_prediction"]
            and abs(report.actual_wait_time - port["current_wait"]) > 5
        )
        if record["used_for_prediction"]:
            message = "感谢反馈！你的数据已加入本次演示的预测校准。"
        else:
            message = "反馈已保存，但质量分较低，本次不会用于预测校准。"
        _latest_snapshot, latest_reports = self._forecast.build_snapshot(now)
        latest_estimate = self._forecast.estimate(
            port["name"], now, now, latest_reports
        )
        consensus = latest_estimate["crowdsource_consensus"]
        return {
            "success": True,
            "points_earned": points,
            "model_updated": model_updated,
            "report": record,
            "message": message,
            "forecast_feedback": forecast_feedback,
            "calibration_preview": {
                "eligible": record["used_for_prediction"],
                "distinct_reporters": consensus["distinct_reporters"],
                "average_quality_score": round(consensus["average_quality_score"], 1),
                "consensus_level": consensus["consensus_level"],
                "weight_cap": consensus["weight_cap"],
                "effective_weight": round(latest_estimate["crowdsource_weight"], 3),
                "value_minutes": consensus["value_minutes"],
                "reason": consensus["reason"],
            },
        }
