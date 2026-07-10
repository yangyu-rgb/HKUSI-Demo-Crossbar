from fastapi import APIRouter, Depends

from ..schemas.demo import (
    DemoContextResponse,
    DemoResetResponse,
    ShadowObservationSummaryResponse,
)
from ..services import DemoService
from .dependencies import get_demo_service


router = APIRouter(prefix="/api/demo", tags=["Demo 控制"])


@router.get(
    "/context",
    response_model=DemoContextResponse,
    summary="获取香港当前时间信息",
    description="返回香港当前时间、有效预测范围和轮询间隔。",
    response_description="请求成功",
)
def get_demo_context(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_context()


@router.get(
    "/model-shadow-summary",
    response_model=ShadowObservationSummaryResponse,
    summary="获取 AI v1 影子观测汇总",
    response_description="请求成功",
)
def get_model_shadow_summary(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_model_shadow_summary()


@router.post(
    "/reset",
    response_model=DemoResetResponse,
    summary="重置 Demo 动态数据",
    description="删除已保存的反馈、订阅和企业方案，然后重新加载 JSON 种子。",
    response_description="重置成功",
)
def reset_demo(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.reset()
