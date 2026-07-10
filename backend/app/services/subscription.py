from datetime import datetime, time, timedelta

from ..exceptions import (
    DomainValidationError,
    ErrorCode,
    ResourceNotFoundError,
)
from ..clock import Clock, as_hong_kong
from ..config import (
    SUBSCRIPTION_ADVANCE_REMINDER_MINUTES,
    SUBSCRIPTION_PREVIEW_HORIZON_MINUTES,
)
from ..repositories import DemoRepository
from ..schemas.prediction import PredictionRequest
from ..schemas.subscription import SubscriptionRequest, SubscriptionUpdate
from .prediction import PredictionService


WEEKDAY_CODES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


class SubscriptionService:
    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        prediction_service: PredictionService,
    ):
        self._repository = repository
        self._clock = clock
        self._prediction_service = prediction_service

    @staticmethod
    def _target_time_for_next_commute(routine: dict, now: datetime) -> datetime:
        selected_days = set(routine["days"])
        deadline = time.fromisoformat(routine["arrival_deadline"])
        for offset in range(8):
            service_date = (now + timedelta(days=offset)).date()
            if WEEKDAY_CODES[service_date.weekday()] not in selected_days:
                continue
            target_time = datetime.combine(
                service_date,
                deadline,
                tzinfo=now.tzinfo,
            )
            if target_time > now:
                return target_time
        raise DomainValidationError(
            "未找到下一次有效通勤日期",
            code=ErrorCode.VALIDATION_ERROR,
        )

    def _evaluate_subscription(self, subscription: dict) -> dict:
        now = as_hong_kong(self._clock.now()).replace(microsecond=0)
        target_time = self._target_time_for_next_commute(subscription["routine"], now)
        evaluation_time = max(
            now,
            target_time - timedelta(minutes=SUBSCRIPTION_PREVIEW_HORIZON_MINUTES),
        )
        prediction = self._prediction_service.predict(
            request=PredictionRequest(
                origin_id=subscription["routine"]["origin_id"],
                destination_id=subscription["routine"]["destination_id"],
                target_time=target_time,
                preferences={"priority": subscription["routine"]["priority"]},
            ),
            current_time=evaluation_time,
            record_shadow=False,
        )
        recommended = prediction["ports"][0]
        advance_enabled = subscription["alerts"]["advance_reminder"]
        advance_at = (
            max(
                evaluation_time,
                recommended["latest_departure"]
                - timedelta(minutes=SUBSCRIPTION_ADVANCE_REMINDER_MINUTES),
            )
            if advance_enabled
            else None
        )
        anomaly_enabled = subscription["alerts"]["anomaly_alert"]
        anomalies = recommended["anomalies"]
        alternative_enabled = subscription["alerts"]["better_route_alert"]
        alternatives = [
            item
            for item in prediction["ports"]
            if item["port_id"] != recommended["port_id"]
            and item["on_time"]
            and item["within_budget"]
        ]
        alternative = min(
            alternatives,
            key=lambda item: (
                item["late_risk_percent"],
                item["total_time"],
                item["total_cost"],
            ),
            default=None,
        )
        has_better_alternative = bool(
            alternative
            and alternative["late_risk_percent"]
            <= recommended["late_risk_percent"] - 10
        )
        alerts = [
            {
                "kind": "advance_reminder",
                "title": "出发前提醒",
                "message": (
                    f"建议经{recommended['name']}口岸，最晚"
                    f"{recommended['latest_departure'].strftime('%H:%M')}出发。"
                    if advance_enabled
                    else "此订阅未启用出发前提醒。"
                ),
                "enabled": advance_enabled,
                "triggered": advance_enabled,
                "scheduled_at": advance_at,
            },
            {
                "kind": "anomaly_alert",
                "title": "异常拥堵提醒",
                "message": (
                    "；".join(anomalies)
                    if anomalies
                    else "当前预览未发现推荐口岸的异常拥堵。"
                ),
                "enabled": anomaly_enabled,
                "triggered": anomaly_enabled and bool(anomalies),
                "scheduled_at": evaluation_time if anomaly_enabled and anomalies else None,
            },
            {
                "kind": "better_route_alert",
                "title": "更优路线提醒",
                "message": (
                    f"{alternative['name']}的迟到风险较{recommended['name']}低"
                    f"至少10个百分点，可作为替代路线。"
                    if has_better_alternative
                    else "当前预览没有显著降低迟到风险的替代路线。"
                ),
                "enabled": alternative_enabled,
                "triggered": alternative_enabled and has_better_alternative,
                "scheduled_at": (
                    evaluation_time
                    if alternative_enabled and has_better_alternative
                    else None
                ),
            },
        ]
        return {
            "subscription_id": subscription["subscription_id"],
            "evaluated_at": now,
            "evaluation_time": evaluation_time,
            "commute_date": target_time.date(),
            "target_time": target_time,
            "recommended_port": recommended["name"],
            "recommended_port_id": recommended["port_id"],
            "latest_departure": recommended["latest_departure"],
            "next_alert": advance_at,
            "alternative_port": alternative["name"] if alternative else None,
            "alerts": alerts,
            "warnings": prediction["warnings"],
        }

    def _validate_locations(self, origin_id: str, destination_id: str) -> None:
        if self._repository.find_location(origin_id, "origins") is None:
            raise DomainValidationError(
                "不支持该出发地点",
                code=ErrorCode.LOCATION_NOT_FOUND,
                details={"origin_id": origin_id},
            )
        if self._repository.find_location(destination_id, "destinations") is None:
            raise DomainValidationError(
                "不支持该目的地点",
                code=ErrorCode.LOCATION_NOT_FOUND,
                details={"destination_id": destination_id},
            )

    def list(self, user_id: str) -> dict:
        subscriptions = self._repository.list_subscriptions(user_id)
        for item in subscriptions:
            item["next_alert"] = self._evaluate_subscription(item)["next_alert"]
        return {"subscriptions": subscriptions, "total": len(subscriptions)}

    def create(self, request: SubscriptionRequest) -> dict:
        routine = request.routine.model_dump(mode="json")
        alerts = request.alerts.model_dump(mode="json")
        self._validate_locations(routine["origin_id"], routine["destination_id"])
        subscription = self._repository.add_subscription(
            {
                "user_id": request.user_id,
                "routine": routine,
                "alerts": alerts,
            }
        )
        evaluation = self._evaluate_subscription(subscription)
        subscription["next_alert"] = evaluation["next_alert"]
        subscription["message"] = (
            "订阅已设置，将在"
            f"{subscription['next_alert'].strftime('%m-%d %H:%M')}"
            "生成出发前提醒。"
            if subscription["next_alert"]
            else "订阅已设置，出发前提醒目前处于关闭状态。"
        )
        return subscription

    def update(self, subscription_id: str, request: SubscriptionUpdate) -> dict:
        existing = self._repository.get_subscription(subscription_id)
        if existing is None:
            raise ResourceNotFoundError(
                ErrorCode.SUBSCRIPTION_NOT_FOUND,
                "订阅不存在",
                details={"subscription_id": subscription_id},
            )
        routine = request.routine.model_dump(mode="json")
        alerts = request.alerts.model_dump(mode="json")
        self._validate_locations(routine["origin_id"], routine["destination_id"])
        updated = self._repository.update_subscription(
            subscription_id,
            {"routine": routine, "alerts": alerts},
        )
        assert updated is not None
        updated["next_alert"] = self._evaluate_subscription(updated)["next_alert"]
        updated["message"] = "订阅已更新。"
        return updated

    def evaluate(self, subscription_id: str) -> dict:
        subscription = self._repository.get_subscription(subscription_id)
        if subscription is None:
            raise ResourceNotFoundError(
                ErrorCode.SUBSCRIPTION_NOT_FOUND,
                "订阅不存在",
                details={"subscription_id": subscription_id},
            )
        return self._evaluate_subscription(subscription)

    def delete(self, subscription_id: str) -> None:
        if not self._repository.delete_subscription(subscription_id):
            raise ResourceNotFoundError(
                ErrorCode.SUBSCRIPTION_NOT_FOUND,
                "订阅不存在",
                details={"subscription_id": subscription_id},
            )
