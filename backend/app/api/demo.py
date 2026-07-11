from fastapi import APIRouter, Depends

from ..schemas.demo import (
    DemoContextResponse,
    DemoPersonasResponse,
    V1ModelResponse,
    V2ModelResponse,
    V1ReadinessResponse,
    AuditEventListResponse,
    DemoResetResponse,
    ShadowObservationSummaryResponse,
    V2ReadinessResponse,
)
from ..exceptions import PermissionDeniedError
from ..services import DemoService
from .dependencies import get_demo_persona, get_demo_service


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
    "/personas",
    response_model=DemoPersonasResponse,
    summary="获取本地 Demo 身份",
)
def get_demo_personas(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_personas()


@router.get(
    "/v1-model",
    response_model=V1ModelResponse,
    summary="获取 AI v1 合成数据评估与产物状态",
)
def get_v1_model(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_v1_model()


@router.get("/v2-model", response_model=V2ModelResponse, summary="获取 AI v2 合成场景模型状态")
def get_v2_model(service: DemoService = Depends(get_demo_service)) -> dict:
    return service.get_v2_model()


@router.get(
    "/v1-readiness",
    response_model=V1ReadinessResponse,
    summary="获取 V1 完整 Demo 就绪度",
)
def get_v1_readiness(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_v1_readiness()


@router.get(
    "/audit",
    response_model=AuditEventListResponse,
    summary="获取本地 Demo 写操作审计",
)
def get_audit_events(
    limit: int = 50,
    service: DemoService = Depends(get_demo_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["role"] != "operator":
        raise PermissionDeniedError("仅运营人员可查看 Demo 审计记录")
    return service.get_audit_events(min(max(limit, 1), 200))


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


@router.get(
    "/v2-readiness",
    response_model=V2ReadinessResponse,
    summary="获取 V2 模型训练与晋级就绪度",
    response_description="请求成功",
)
def get_v2_readiness(
    service: DemoService = Depends(get_demo_service),
) -> dict:
    return service.get_v2_readiness()


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
