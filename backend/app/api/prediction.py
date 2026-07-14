from fastapi import APIRouter, Depends

from ..schemas.prediction import (
    LocationsResponse,
    PredictionRequest,
    PredictionResponse,
)
from ..services import PredictionService
from .dependencies import get_prediction_service, require_roles


router = APIRouter(
    prefix="/api",
    tags=["路线预测"],
    dependencies=[Depends(require_roles("operator", "commuter", "business_admin", "transport_dispatcher", "port_official"))],
)


@router.get(
    "/locations",
    response_model=LocationsResponse,
    summary="获取支持的出发地和目的地",
    response_description="请求成功",
)
def locations(
    service: PredictionService = Depends(get_prediction_service),
) -> dict:
    return service.get_locations()


@router.post(
    "/predict",
    response_model=PredictionResponse,
    summary="比较四个口岸的路线方案",
    description="使用官方客流驱动的 AI V2.1、15分钟拥堵等级校准和确定性交通矩阵；模型或网络不可用时自动降级。",
    response_description="预测成功",
)
def predict(
    request: PredictionRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> dict:
    return service.predict(request)
