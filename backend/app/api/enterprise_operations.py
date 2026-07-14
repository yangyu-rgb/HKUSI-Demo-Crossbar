from fastapi import APIRouter, Depends, Query, Response

from ..exceptions import ErrorCode, ResourceNotFoundError
from ..schemas.enterprise_operations import (
    AdoptedDecisionPlanResponse,
    CoordinationNoticeListResponse,
    CoordinationNoticeResponse,
    CoordinationNoticeWrite,
    DecisionPreviewResponse,
    EnterpriseOperationsOutcomeWrite,
    EnterpriseOperationsPlanListResponse,
    EnterpriseOperationsPlanRequest,
    EnterpriseOperationsPreviewRequest,
    EnterpriseOperationsWorkspaceResponse,
)
from ..services.enterprise_operations import EnterpriseOperationsService
from .dependencies import (
    get_demo_persona,
    get_enterprise_operations_service,
    require_roles,
)


router = APIRouter(
    prefix="/api/enterprise-operations",
    tags=["企业运营控制塔"],
    dependencies=[
        Depends(require_roles("operator", "business_admin", "transport_dispatcher", "port_official"))
    ],
)


@router.get("/workspace", response_model=EnterpriseOperationsWorkspaceResponse)
def get_workspace(
    view_as: str | None = Query(default=None),
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.get_workspace(persona, view_as)


@router.post("/previews", response_model=DecisionPreviewResponse)
def preview_decision(
    request: EnterpriseOperationsPreviewRequest,
    view_as: str | None = Query(default=None),
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.preview(persona, request.scenario_id, view_as)


@router.post("/plans", response_model=AdoptedDecisionPlanResponse, status_code=201)
def adopt_decision(
    request: EnterpriseOperationsPlanRequest,
    view_as: str | None = Query(default=None),
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.adopt_plan(persona, request.model_dump(mode="json"), view_as)


@router.get("/plans", response_model=EnterpriseOperationsPlanListResponse)
def list_plans(
    limit: int = Query(default=10, ge=1, le=50),
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.list_plans(persona, limit)


@router.patch("/plans/{plan_id}/outcome", response_model=AdoptedDecisionPlanResponse)
def record_outcome(
    plan_id: str,
    request: EnterpriseOperationsOutcomeWrite,
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.record_outcome(persona, plan_id, request.model_dump(mode="json"))


@router.get("/plans/{plan_id}/export.csv", response_class=Response)
def export_plan(
    plan_id: str,
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> Response:
    content = service.export_plan_csv(persona, plan_id)
    if content is None:
        raise ResourceNotFoundError(ErrorCode.PLAN_NOT_FOUND, "企业运营方案不存在")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{plan_id}.csv"'},
    )


@router.get("/coordination-notices", response_model=CoordinationNoticeListResponse)
def list_notices(
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
) -> dict:
    return service.list_notices()


@router.post(
    "/coordination-notices",
    response_model=CoordinationNoticeResponse,
    status_code=201,
)
def create_notice(
    request: CoordinationNoticeWrite,
    service: EnterpriseOperationsService = Depends(get_enterprise_operations_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    return service.create_notice(persona, request.model_dump(mode="json"))
