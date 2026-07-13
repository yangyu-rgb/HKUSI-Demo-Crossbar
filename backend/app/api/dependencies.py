from fastapi import Depends, Header, Request

from ..clock import Clock
from ..exceptions import AuthenticationRequiredError, PermissionDeniedError
from ..ml.shadow import ShadowWaitModel
from ..ml.scenario_model import ScenarioWaitModel
from ..repositories import DemoRepository
from ..services import (
    BatchService,
    CrowdsourceService,
    CommercialService,
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


def get_demo_persona(
    request: Request,
    _persona_header: str | None = Header(
        default=None,
        alias="X-Demo-Persona-ID",
        description="本地课堂 Demo 身份；受保护接口缺失时返回 401，不是生产认证令牌。",
    ),
) -> dict:
    return request.state.demo_persona


def require_authenticated_persona(
    persona: dict = Depends(get_demo_persona),
) -> dict:
    if not persona["explicit"]:
        raise AuthenticationRequiredError()
    return persona


def require_roles(*allowed_roles: str):
    def dependency(
        persona: dict = Depends(require_authenticated_persona),
    ) -> dict:
        if persona["role"] not in allowed_roles:
            raise PermissionDeniedError("当前 Demo 身份无权访问此功能")
        return persona

    return dependency


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


def get_commercial_service(
    repository: DemoRepository = Depends(get_repository),
    clock: Clock = Depends(get_clock),
) -> CommercialService:
    return CommercialService(repository, clock)


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
