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
        }
        stored = self._repository.add_report(record)
        evaluated = evaluate_report(stored, port, now)
        record = public_report(evaluated)
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
        return {
            "success": True,
            "points_earned": points,
            "model_updated": model_updated,
            "report": record,
            "message": message,
        }
