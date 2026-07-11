from fastapi import Depends, Request

from ..clock import Clock
from ..ml.shadow import ShadowWaitModel
from ..ml.scenario_model import ScenarioWaitModel
from ..repositories import DemoRepository
from ..services import (
    BatchService,
    CrowdsourceService,
    DemoService,
    PredictionService,
    RealtimeService,
    SubscriptionService,
)
from ..services.scenario import ScenarioService


def get_repository(request: Request) -> DemoRepository:
    return request.app.state.repository


def get_clock(request: Request) -> Clock:
    return request.app.state.clock


def get_demo_persona(request: Request) -> dict:
    return request.state.demo_persona


def get_shadow_model(request: Request) -> ShadowWaitModel:
    return request.app.state.shadow_model


def get_scenario_model(request: Request) -> ScenarioWaitModel:
    return request.app.state.scenario_model


def get_scenario_service(repository: DemoRepository = Depends(get_repository), clock: Clock = Depends(get_clock)) -> ScenarioService:
    return ScenarioService(repository, clock)


def get_prediction_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
    scenario_model: ScenarioWaitModel = Depends(get_scenario_model),
) -> PredictionService:
    return PredictionService(repository, clock, shadow_model=shadow_model, scenario_model=scenario_model)


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
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
    scenario_model: ScenarioWaitModel = Depends(get_scenario_model),
) -> DemoService:
    return DemoService(repository, clock, shadow_model, scenario_model)


def get_subscription_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
    scenario_model: ScenarioWaitModel = Depends(get_scenario_model),
) -> SubscriptionService:
    return SubscriptionService(
        repository,
        clock,
        PredictionService(repository, clock, shadow_model=shadow_model, scenario_model=scenario_model),
    )


def get_batch_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
    shadow_model: ShadowWaitModel = Depends(get_shadow_model),
    scenario_model: ScenarioWaitModel = Depends(get_scenario_model),
) -> BatchService:
    return BatchService(repository, clock, shadow_model=shadow_model, scenario_model=scenario_model)
