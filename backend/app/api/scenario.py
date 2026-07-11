from datetime import date

from fastapi import APIRouter, Depends, Query

from ..exceptions import PermissionDeniedError
from ..schemas.scenario import ScenarioDay, ScenarioListResponse, ScenarioResetResponse, ScenarioWrite
from ..services.scenario import ScenarioService
from .dependencies import get_demo_persona, get_scenario_service


router = APIRouter(prefix="/api/demo/scenarios", tags=["Demo 场景"])


def require_operator(persona: dict) -> None:
    if persona["role"] != "operator":
        raise PermissionDeniedError("仅 Demo 运营人员可修改未来场景")


@router.get("", response_model=ScenarioListResponse, summary="获取未来场景日历")
def list_scenarios(start: date | None = None, days: int = Query(14, ge=1, le=14), service: ScenarioService = Depends(get_scenario_service)) -> dict:
    return service.list(start, days)


@router.post("/reset", response_model=ScenarioResetResponse, summary="恢复未来14天默认场景")
def reset_scenarios(service: ScenarioService = Depends(get_scenario_service), persona: dict = Depends(get_demo_persona)) -> dict:
    require_operator(persona)
    return service.reset()


@router.put("/{scenario_date}", response_model=ScenarioDay, summary="保存未来场景")
def save_scenario(scenario_date: date, data: ScenarioWrite, service: ScenarioService = Depends(get_scenario_service), persona: dict = Depends(get_demo_persona)) -> dict:
    require_operator(persona)
    return service.save(scenario_date, data)


@router.delete("/{scenario_date}", response_model=ScenarioDay, summary="恢复单日默认场景")
def delete_scenario(scenario_date: date, service: ScenarioService = Depends(get_scenario_service), persona: dict = Depends(get_demo_persona)) -> dict:
    require_operator(persona)
    return service.delete(scenario_date)
