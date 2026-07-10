from fastapi import Depends, Request

from ..clock import Clock
from ..ml.shadow import ShadowWaitModel
from ..repositories import DemoRepository
from ..services import (
    BatchService,
    CrowdsourceService,
    DemoService,
    PredictionService,
    RealtimeService,
    SubscriptionService,
)


def get_repository(request: Request) -> DemoRepository:
    return request.app.state.repository


def get_clock(request: Request) -> Clock:
    return request.app.state.clock


def get_shadow_model(request: Request) -> ShadowWaitModel:
    return request.app.state.shadow_model


def get_prediction_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
) -> PredictionService:
    return PredictionService(repository, clock, shadow_model=shadow_model)


def get_realtime_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> RealtimeService:
    return RealtimeService(repository, clock)


def get_crowdsource_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> CrowdsourceService:
    return CrowdsourceService(repository, clock)


def get_demo_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> DemoService:
    return DemoService(repository, clock)


def get_subscription_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
) -> SubscriptionService:
    return SubscriptionService(
        repository,
        clock,
        PredictionService(repository, clock, shadow_model=shadow_model),
    )


def get_batch_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
) -> BatchService:
    return BatchService(repository, clock, shadow_model=shadow_model)
