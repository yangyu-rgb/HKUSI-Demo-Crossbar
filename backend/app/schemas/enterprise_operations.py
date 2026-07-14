from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class WorkspaceKind(str, Enum):
    COACH_OPERATOR = "coach_operator"
    FREIGHT_OPERATOR = "freight_operator"
    ENTERPRISE_CLIENT = "enterprise_client"
    PORT_AUTHORITY = "port_authority"


class RiskBand(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EnterpriseOperationsPreviewRequest(BaseModel):
    scenario_id: str = Field(min_length=1)


class EnterpriseOperationsPlanRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    preview_id: str = Field(min_length=1)
    selected_action_ids: list[str] = Field(default_factory=list)


class EnterpriseOperationsOutcomeWrite(BaseModel):
    actual_high_risk_count: int = Field(ge=0, le=1000)
    actual_average_arrival_delta_minutes: int = Field(ge=-240, le=240)
    actual_support_contacts: int = Field(ge=0, le=100000)
    note: str = Field(default="", max_length=500)


class CoordinationNoticeWrite(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    affected_ports: list[str] = Field(min_length=1, max_length=10)
    valid_until: datetime
    severity: RiskBand = RiskBand.MEDIUM


class OperationalSummary(BaseModel):
    total_jobs: int
    high_risk_count: int
    medium_risk_count: int
    vehicle_conflicts: int
    cost_exposure_hkd: int
    average_arrival_delta_minutes: int
    affected_people: int


class OperationalJobResult(BaseModel):
    id: str
    label: str
    direction: str
    asset_id: str
    passenger_count: int
    load_units: int | None = None
    baseline_port_id: str
    baseline_port: str
    baseline_departure_time: str
    baseline_arrival: str
    baseline_risk: RiskBand
    recommended_port_id: str
    recommended_port: str
    recommended_departure_time: str
    recommended_arrival: str
    recommended_risk: RiskBand
    changed: bool
    arrival_delta_minutes: int
    exposure_before_hkd: int
    exposure_after_hkd: int


class RecommendedAction(BaseModel):
    id: str
    action_type: str
    target_id: str
    title: str
    detail: str
    impact: str


class AIPortForecast(BaseModel):
    port_id: str
    name: str
    model_base_wait_minutes: int
    calibrated_wait_minutes: int
    confidence_interval: tuple[int, int]
    traffic_pressure: float
    stress_signal: RiskBand
    forecast_source: str


class AIDecisionTrace(BaseModel):
    model_available: bool
    coverage_status: str
    model_supported_port_count: int
    total_port_count: int
    model_version: str
    prediction_engine: str
    target_time: datetime
    forecast_horizon_hours: int
    confidence_level: float
    inputs: list[str]
    optimization_objectives: list[str]
    ports: list[AIPortForecast]
    disclosure: str


class DecisionPreviewResponse(BaseModel):
    preview_id: str
    workspace_kind: WorkspaceKind
    scenario: dict
    baseline: OperationalSummary
    recommended: OperationalSummary
    jobs: list[OperationalJobResult]
    actions: list[RecommendedAction]
    ai_decision_trace: AIDecisionTrace
    explanation: list[str]
    demo_notice: str


class AdoptedDecisionPlanResponse(DecisionPreviewResponse):
    plan_id: str
    status: str
    adopted_at: datetime
    notifications_created: int
    notification_delivery: str
    selected_action_ids: list[str]
    outcome: dict | None = None


class EnterpriseOperationsPlanListResponse(BaseModel):
    plans: list[AdoptedDecisionPlanResponse]
    total: int


class EnterpriseOperationsWorkspaceResponse(BaseModel):
    generated_at: datetime
    workspace_kind: WorkspaceKind
    organization_name: str
    available_views: list[WorkspaceKind]
    scenarios: list[dict]
    active_scenario: dict
    ports: list[dict]
    assets: list[dict]
    jobs: list[dict]
    recent_plans: list[dict]
    coordination_notices: list[dict]
    ai_decision_trace: AIDecisionTrace
    demo_notice: str


class CoordinationNoticeResponse(BaseModel):
    id: str
    organization_id: str
    title: str
    message: str
    affected_ports: list[str]
    valid_until: datetime
    severity: RiskBand
    created_at: datetime
    demo_only: bool


class CoordinationNoticeListResponse(BaseModel):
    notices: list[CoordinationNoticeResponse]
    total: int
