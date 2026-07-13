from fastapi import APIRouter, Depends, Query

from ..schemas.crowdsource import (
    CrowdsourceFeedResponse,
    CrowdsourceReport,
    CrowdsourceSubmitResponse,
)
from ..services import CrowdsourceService
from .dependencies import get_crowdsource_service, get_demo_persona, require_roles


router = APIRouter(
    prefix="/api/crowdsource",
    tags=["众包反馈"],
    dependencies=[Depends(require_roles("operator", "commuter"))],
)


@router.get(
    "/feed",
    response_model=CrowdsourceFeedResponse,
    summary="获取近期持久化众包反馈",
    response_description="请求成功",
)
def crowdsource_feed(
    limit: int = Query(default=8, ge=1, le=30),
    service: CrowdsourceService = Depends(get_crowdsource_service),
) -> dict:
    return service.get_feed(limit)


@router.post(
    "/report",
    response_model=CrowdsourceSubmitResponse,
    summary="提交并持久化众包反馈",
    response_description="提交成功",
)
def submit_crowdsource_report(
    report: CrowdsourceReport,
    service: CrowdsourceService = Depends(get_crowdsource_service),
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if persona["role"] == "commuter":
        report = report.model_copy(update={"user_id": persona["id"]})
    return service.submit(report)
