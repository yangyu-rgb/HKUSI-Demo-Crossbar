from fastapi import APIRouter, Depends, Query, Response

from ..schemas.batch import (
    BatchCsvValidateRequest,
    BatchCsvValidateResponse,
    BatchHistoryResponse,
    BatchRequest,
    BatchResponse,
)
from ..exceptions import ErrorCode, PermissionDeniedError, ResourceNotFoundError
from ..services import BatchService
from .dependencies import get_batch_service, get_demo_persona, require_roles


def require_business_persona(persona: dict) -> None:
    if persona["role"] not in {"operator", "business_admin"}:
        raise PermissionDeniedError()


router = APIRouter(
    prefix="/api",
    tags=["企业方案"],
    dependencies=[Depends(require_roles("operator", "business_admin"))],
)


@router.post(
    "/batch",
    response_model=BatchResponse,
    summary="生成并保存企业批量方案",
    response_description="生成成功",
)
def create_batch_plan(
    request: BatchRequest,
    service: BatchService = Depends(get_batch_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    require_business_persona(persona)
    return service.create_plan(request, persona["organization_id"])


@router.get(
    "/batch/plans",
    response_model=BatchHistoryResponse,
    summary="获取近期企业批量方案",
    response_description="请求成功",
)
def list_batch_plans(
    company: str = Query(min_length=1),
    limit: int = Query(default=10, ge=1, le=50),
    service: BatchService = Depends(get_batch_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    require_business_persona(persona)
    return service.list_plans(company, limit, persona["organization_id"])


@router.post(
    "/batch/csv/validate",
    response_model=BatchCsvValidateResponse,
    summary="校验企业员工 CSV",
)
def validate_batch_csv(
    request: BatchCsvValidateRequest,
    service: BatchService = Depends(get_batch_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    require_business_persona(persona)
    return service.validate_csv(request.csv_text)


@router.get(
    "/batch/plans/{plan_id}/export.csv",
    summary="导出企业方案 CSV",
    response_class=Response,
)
def export_batch_plan(
    plan_id: str,
    service: BatchService = Depends(get_batch_service),
    persona: dict = Depends(get_demo_persona),
) -> Response:
    require_business_persona(persona)
    content = service.export_plan_csv(plan_id, persona["organization_id"])
    if content is None:
        raise ResourceNotFoundError(
            ErrorCode.PLAN_NOT_FOUND,
            "企业方案不存在",
            details={"plan_id": plan_id},
        )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{plan_id}.csv"'},
    )
