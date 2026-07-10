from fastapi import Depends, Request

from ..clock import Clock
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


def get_prediction_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> PredictionService:
    return PredictionService(repository, clock)


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
) -> SubscriptionService:
    return SubscriptionService(repository)


def get_batch_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> BatchService:
    return BatchService(repository, clock)
