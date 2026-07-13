from fastapi import APIRouter, Depends, Query, Response, status

from ..schemas.subscription import (
    AlertCycleResponse,
    NotificationListResponse,
    NotificationRecord,
    SubscriptionListResponse,
    SubscriptionEvaluationResponse,
    SubscriptionEvaluationRecord,
    SubscriptionEvaluationListResponse,
    SubscriptionRecord,
    SubscriptionRequest,
    SubscriptionUpdate,
)
from ..services import SubscriptionService
from .dependencies import get_demo_persona, get_subscription_service, require_roles


router = APIRouter(
    prefix="/api",
    tags=["提醒订阅"],
    dependencies=[Depends(require_roles("operator", "commuter"))],
)


@router.get(
    "/subscriptions",
    response_model=SubscriptionListResponse,
    summary="获取用户订阅列表",
    response_description="请求成功",
)
def list_subscriptions(
    user_id: str = Query(min_length=1),
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["explicit"]:
        user_id = persona["id"]
    return service.list(user_id)


@router.post(
    "/subscriptions",
    response_model=SubscriptionRecord,
    status_code=status.HTTP_201_CREATED,
    summary="创建智能提醒订阅",
    response_description="创建成功",
)
def create_subscription(
    request: SubscriptionRequest,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["explicit"]:
        request = request.model_copy(update={"user_id": persona["id"]})
    return service.create(request)


@router.post(
    "/subscription",
    response_model=SubscriptionRecord,
    deprecated=True,
    summary="通过已弃用的单数路径创建订阅",
    response_description="创建成功",
)
def create_subscription_legacy(
    request: SubscriptionRequest,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["explicit"]:
        request = request.model_copy(update={"user_id": persona["id"]})
    return service.create(request)


@router.patch(
    "/subscriptions/{subscription_id}",
    response_model=SubscriptionRecord,
    summary="更新订阅",
    response_description="更新成功",
)
def update_subscription(
    subscription_id: str,
    request: SubscriptionUpdate,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.update(
        subscription_id,
        request,
        persona["id"] if persona["explicit"] else None,
    )


@router.get(
    "/subscriptions/{subscription_id}/preview",
    response_model=SubscriptionEvaluationResponse,
    summary="预览下一次智能提醒",
    response_description="评估成功",
)
def preview_subscription(
    subscription_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.evaluate(
        subscription_id,
        persona["id"] if persona["explicit"] else None,
    )


@router.post(
    "/subscriptions/{subscription_id}/evaluations",
    response_model=SubscriptionEvaluationRecord,
    status_code=status.HTTP_201_CREATED,
    summary="持久化当前提醒评估",
    response_description="评估记录已保存",
)
def record_subscription_evaluation(
    subscription_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.record_evaluation(
        subscription_id,
        persona["id"] if persona["explicit"] else None,
    )


@router.get(
    "/subscriptions/{subscription_id}/evaluations",
    response_model=SubscriptionEvaluationListResponse,
    summary="获取提醒评估历史",
    response_description="请求成功",
)
def list_subscription_evaluations(
    subscription_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.list_evaluations(
        subscription_id,
        limit,
        persona["id"] if persona["explicit"] else None,
    )


@router.patch(
    "/subscription-evaluations/{evaluation_id}/read",
    response_model=SubscriptionEvaluationRecord,
    summary="将提醒评估标记为已读",
    response_description="更新成功",
)
def mark_subscription_evaluation_read(
    evaluation_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.mark_evaluation_read(
        evaluation_id,
        persona["id"] if persona["explicit"] else None,
    )


@router.delete(
    "/subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除订阅",
    response_description="删除成功",
)
def delete_subscription(
    subscription_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> Response:
    service.delete(
        subscription_id,
        persona["id"] if persona["explicit"] else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/demo/alerts/run-cycle",
    response_model=AlertCycleResponse,
    summary="运行一次本地 Demo 告警周期",
)
def run_alert_cycle(
    user_id: str = Query(default="demo-user", min_length=1),
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["explicit"]:
        user_id = persona["id"]
    return service.run_alert_cycle(user_id)


@router.get(
    "/notifications",
    response_model=NotificationListResponse,
    summary="获取本地通知收件箱",
)
def list_notifications(
    user_id: str = Query(default="demo-user", min_length=1),
    limit: int = Query(default=30, ge=1, le=100),
    unread_only: bool = False,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["explicit"]:
        user_id = persona["id"]
    return service.list_notifications(user_id, limit, unread_only)


@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationRecord,
    summary="将本地通知标记为已读",
)
def mark_notification_read(
    notification_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.mark_notification_read(
        notification_id,
        persona["id"] if persona["explicit"] else None,
    )
