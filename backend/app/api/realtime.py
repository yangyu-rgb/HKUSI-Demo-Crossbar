from fastapi import APIRouter, Depends

from ..schemas.realtime import RealtimeResponse
from ..services import RealtimeService
from .dependencies import get_realtime_service


router = APIRouter(prefix="/api", tags=["实时状态"])


@router.get(
    "/realtime",
    response_model=RealtimeResponse,
    summary="获取四口岸 Demo 状态",
    description="返回按香港当前时间计算的模拟口岸等待数据和众包数量。",
    response_description="请求成功",
)
def realtime(
    service: RealtimeService = Depends(get_realtime_service),
) -> dict:
    return service.get_status()
