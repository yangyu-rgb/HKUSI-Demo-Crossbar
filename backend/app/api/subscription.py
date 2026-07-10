from fastapi import APIRouter, Depends, Query, Response, status

from ..schemas.subscription import (
    SubscriptionListResponse,
    SubscriptionEvaluationResponse,
    SubscriptionRecord,
    SubscriptionRequest,
    SubscriptionUpdate,
)
from ..services import SubscriptionService
from .dependencies import get_subscription_service


router = APIRouter(prefix="/api", tags=["提醒订阅"])


@router.get(
    "/subscriptions",
    response_model=SubscriptionListResponse,
    summary="获取用户订阅列表",
    response_description="请求成功",
)
def list_subscriptions(
    user_id: str = Query(min_length=1),
    service: SubscriptionService = Depends(get_subscription_service),
) -> dict:
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
) -> dict:
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
) -> dict:
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
) -> dict:
    return service.update(subscription_id, request)


@router.get(
    "/subscriptions/{subscription_id}/preview",
    response_model=SubscriptionEvaluationResponse,
    summary="预览下一次智能提醒",
    response_description="评估成功",
)
def preview_subscription(
    subscription_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
) -> dict:
    return service.evaluate(subscription_id)


@router.delete(
    "/subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除订阅",
    response_description="删除成功",
)
def delete_subscription(
    subscription_id: str,
    service: SubscriptionService = Depends(get_subscription_service),
) -> Response:
    service.delete(subscription_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
