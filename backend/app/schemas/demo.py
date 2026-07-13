from datetime import datetime

from pydantic import BaseModel

from .realtime import DataSourceStatus


class DemoContextResponse(BaseModel):
    current_time: datetime
    timezone: str
    min_target_time: datetime
    suggested_target_time: datetime
    max_target_time: datetime
    poll_interval_seconds: int


class DemoPersona(BaseModel):
    id: str
    name: str
    role: str
    organization_id: str
    organization_name: str


class DemoPersonasResponse(BaseModel):
    default_persona_id: str
    personas: list[DemoPersona]


class V1ModelResponse(BaseModel):
    artifact_available: bool
    unavailable_reason: str | None = None
    model_version: str
    synthetic_only: bool
    dataset: dict
    split: dict
    metrics: dict
    features: list[str]
    promotion: dict
    limitations: list[str]


class V2ModelResponse(BaseModel):
    artifact_available: bool
    unavailable_reason: str | None = None
    model_version: str
    synthetic_only: bool
    evaluation_scope: str
    dataset: dict
    split: dict
    metrics: dict
    features: list[str]
    limitations: list[str]
    target_scope: str
    real_feature_sources: list[str]
    calibration_version: str
    source_snapshot: dict
    data_audit: dict
    formula: dict
    selection: dict
    candidate_leaderboard: list[dict]
    interval_calibration: dict
    traffic_distribution: dict
    sensitivity: dict
    promotion: dict


class V1ReadinessCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class V1ReadinessResponse(BaseModel):
    demo_ready: bool
    checks: list[V1ReadinessCheck]
    adapter_modes: dict[str, str]


class AuditEvent(BaseModel):
    id: int
    request_id: str
    persona_id: str
    organization_id: str
    method: str
    path: str
    status_code: int
    created_at: datetime


class AuditEventListResponse(BaseModel):
    events: list[AuditEvent]
    total: int


class OperationsSummaryResponse(BaseModel):
    generated_at: datetime
    window_hours: int
    forecast: dict
    crowdsource: dict
    errors: dict
    audit: dict
    adapters: dict


class DemoResetResponse(BaseModel):
    success: bool
    seeded: dict[str, int]
    message: str


class ShadowObservationPortSummary(BaseModel):
    port_id: str
    port_name: str
    observation_count: int
    average_difference_minutes: float | None = None
    average_absolute_difference_minutes: float | None = None


class ShadowObservationSummaryResponse(BaseModel):
    total_observations: int
    available_observations: int
    unavailable_observations: int
    latest_observed_at: datetime | None = None
    ports: list[ShadowObservationPortSummary]


class V2ReadinessCheck(BaseModel):
    name: str
    actual: int
    required: int
    passed: bool


class V2ReadinessPort(BaseModel):
    port_id: str
    label_count: int


class V2ReadinessLabelSource(BaseModel):
    source_type: str
    label_count: int


class ExternalSourceReadiness(BaseModel):
    id: str
    name: str
    provider: str
    status: str
    usage: str
    kind: str
    collection_enabled: bool
    url: str
    source_version: str
    refresh_seconds: int
    traveler_category: str | None = None
    attribution: str
    terms_url: str
    reason: str
    observation_count: int
    last_fetched_at: datetime | None = None
    age_minutes: float | None = None
    freshness_status: str
    expected_runs_24h: int
    successful_runs_24h: int
    completeness_24h_percent: float | None = None
    max_gap_minutes_24h: float | None = None


class ExternalPortCoverage(BaseModel):
    port_id: str
    observation_count: int


class ExternalDirectionCoverage(BaseModel):
    direction: str
    observation_count: int


class ExternalDataReadiness(BaseModel):
    sources: list[ExternalSourceReadiness]
    official_observation_count: int
    feature_observation_count: int
    ports: list[ExternalPortCoverage]
    directions: list[ExternalDirectionCoverage]
    distinct_dates: int
    hour_slices: int
    last_observed_at: datetime | None = None
    collection_runs: int
    successful_runs: int
    failed_runs: int
    success_rate_percent: float | None = None
    forecast_snapshot_total: int
    forecast_snapshot_complete: int
    forecast_snapshot_coverage_percent: float | None = None
    minute_labels_from_official_features: int
    alignment: dict


class V2ReadinessResponse(BaseModel):
    experiment_ready: bool
    production_promotion_ready: bool
    label_count: int
    linked_feedback_count: int
    excluded_feedback_count: int
    label_sources: list[V2ReadinessLabelSource]
    ports: list[V2ReadinessPort]
    distinct_dates: int
    hour_slices: int
    data_versions: list[str]
    statistical_mae_minutes: float | None = None
    shadow_mae_minutes: float | None = None
    shadow_labeled_count: int
    time_split: dict
    checks: list[V2ReadinessCheck]
    data_sources: list[DataSourceStatus]
    coverage_warnings: list[str]
    production_blockers: list[str]
    external_data: ExternalDataReadiness
