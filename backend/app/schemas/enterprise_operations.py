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


class OperationsJobKind(str, Enum):
    COACH = "coach"
    FREIGHT = "freight"


class OperationsPriority(str, Enum):
    STANDARD = "standard"
    URGENT = "urgent"
    CRITICAL = "critical"


class PortConstraint(str, Enum):
    OPEN = "open"
    RESTRICTED = "restricted"
    CLOSED = "closed"


class EnterpriseOperationsJobInput(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=80)
    job_kind: OperationsJobKind
    asset_id: str = Field(min_length=1, max_length=40)
    origin_id: str = Field(min_length=1, max_length=60)
    destination_id: str = Field(min_length=1, max_length=60)
    departure_time: datetime
    arrival_deadline: datetime
    baseline_port_id: str = Field(min_length=1, max_length=40)
    passenger_count: int = Field(default=0, ge=0, le=200)
    load_units: int = Field(default=0, ge=0, le=1000)
    asset_capacity: int = Field(ge=1, le=2000)
    asset_available_at: datetime
    turnaround_minutes: int = Field(default=20, ge=0, le=240)
    exposure_hkd: int = Field(default=4000, ge=0, le=1_000_000)
    priority: OperationsPriority = OperationsPriority.STANDARD


class EnterpriseScenarioEvent(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    impact: str = Field(pattern=r"^(none|low|medium|high)$")
    direction: str | None = Field(default=None, pattern=r"^(hong_kong_to_shenzhen|shenzhen_to_hong_kong)$")
    affected_ports: list[str] = Field(default_factory=list, max_length=10)
    start_time: str = Field(default="00:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(default="23:59", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class EnterpriseScenarioInput(BaseModel):
    preset_id: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=100)
    weather: str = Field(pattern=r"^(clear|rain|heavy_rain|thunderstorm)$")
    is_holiday: bool = False
    events: list[EnterpriseScenarioEvent] = Field(default_factory=list, max_length=8)
    port_constraints: dict[str, PortConstraint] = Field(default_factory=dict)


class EnterpriseOperationsCsvValidateRequest(BaseModel):
    workspace_kind: WorkspaceKind
    csv_text: str = Field(min_length=1, max_length=500_000)


class EnterpriseOperationsCsvError(BaseModel):
    row: int
    field: str | None = None
    message: str


class EnterpriseOperationsCsvValidateResponse(BaseModel):
    valid: bool
    jobs: list[EnterpriseOperationsJobInput]
    errors: list[EnterpriseOperationsCsvError]
    warnings: list[EnterpriseOperationsCsvError]
    summary: dict


class EnterpriseOperationsPreviewRequest(BaseModel):
    scenario_id: str | None = None
    jobs: list[EnterpriseOperationsJobInput] = Field(default_factory=list, max_length=100)
    scenario: EnterpriseScenarioInput | None = None


class EnterpriseOperationsComparisonRequest(BaseModel):
    jobs: list[EnterpriseOperationsJobInput] = Field(min_length=1, max_length=100)
    scenario_ids: list[str] = Field(min_length=2, max_length=5)


class EnterpriseOperationsPlanRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    preview_id: str = Field(min_length=1)
    selected_action_ids: list[str] = Field(default_factory=list)
    jobs: list[EnterpriseOperationsJobInput] = Field(default_factory=list, max_length=100)
    scenario: EnterpriseScenarioInput | None = None


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
    affected_load_units: int = 0
    changed_jobs: int = 0


class OperationalJobResult(BaseModel):
    id: str
    label: str
    direction: str
    asset_id: str
    recommended_asset_id: str
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
    predicted_wait_minutes: int
    prediction_interval: tuple[int, int]
    model_source: str


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


class ScenarioComparisonItem(BaseModel):
    scenario: dict
    summary: OperationalSummary
    baseline: OperationalSummary
    recommended: OperationalSummary
    port_forecasts: list[AIPortForecast]
    action_count: int
    top_recommendation: str


class EnterpriseOperationsComparisonResponse(BaseModel):
    input_summary: dict
    baseline_scenario_id: str
    scenarios: list[ScenarioComparisonItem]
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
    scenario_presets: list[EnterpriseScenarioInput]
    sample_jobs: list[EnterpriseOperationsJobInput]
    locations: dict
    csv_columns: list[str]


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
