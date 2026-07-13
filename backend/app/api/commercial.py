from fastapi import APIRouter, Depends

from ..schemas.commercial import (
    CommercialCheckoutRequest, CommercialCheckoutResponse,
    CommercialPlansResponse, CommercialSubscriptionResponse,
)
from ..services.commercial import CommercialService
from .dependencies import get_commercial_service, require_authenticated_persona


router = APIRouter(prefix="/api/commercial", tags=["商业化演示"])


@router.get("/plans", response_model=CommercialPlansResponse, summary="获取本地商业套餐")
def get_plans(service: CommercialService = Depends(get_commercial_service)) -> dict:
    return service.get_plans()


@router.get("/subscription", response_model=CommercialSubscriptionResponse, summary="获取当前 Demo 账户商业订阅")
def get_subscription(service: CommercialService = Depends(get_commercial_service), persona: dict = Depends(require_authenticated_persona)) -> dict:
    return service.get_subscription(persona)


@router.post("/checkout", response_model=CommercialCheckoutResponse, summary="执行无真实扣款的模拟结账")
def checkout(request: CommercialCheckoutRequest, service: CommercialService = Depends(get_commercial_service), persona: dict = Depends(require_authenticated_persona)) -> dict:
    return service.checkout(request, persona)


@router.post("/subscription/cancel", response_model=CommercialSubscriptionResponse, summary="取消本地商业订阅")
def cancel_subscription(service: CommercialService = Depends(get_commercial_service), persona: dict = Depends(require_authenticated_persona)) -> dict:
    return service.cancel(persona)
