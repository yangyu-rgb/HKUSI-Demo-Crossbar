from datetime import datetime

from pydantic import BaseModel

from .common import CrowdLevel, RiskLevel


class DataSourceStatus(BaseModel):
    provider: str
    source: str
    fetched_at: datetime
    status: str
    fallback: bool
    reason: str | None = None
    data_version: str


class ForecastPoint(BaseModel):
    offset_minutes: int
    forecast_at: datetime
    wait: int
    lower_bound: int
    upper_bound: int
    change_from_now: int


class PortStatus(BaseModel):
    id: str
    name: str
    name_en: str
    current_wait: int
    status: str
    crowd_level: CrowdLevel
    special_channels: list[str]
    passenger_flow: str
    forecast: list[ForecastPoint]
    anomalies: list[str]
    crowdsource_count: int
    trend: str
    change_next_hour: int
    peak_wait: int
    peak_at: datetime


class RealtimeOverview(BaseModel):
    smoothest_port_id: str
    smoothest_port_name: str
    smoothest_wait: int
    highest_pressure_port_id: str
    highest_pressure_port_name: str
    highest_pressure_wait: int
    fastest_rising_port_id: str
    fastest_rising_port_name: str
    fastest_rising_change: int
    active_anomaly_count: int
    crowdsource_report_count: int


class ServiceAlert(BaseModel):
    type: str
    message: str
    severity: RiskLevel


class RealtimeResponse(BaseModel):
    timestamp: datetime
    source: str
    data_sources: list[DataSourceStatus]
    ports: list[PortStatus]
    alerts: list[ServiceAlert]
    overview: RealtimeOverview


class HealthResponse(BaseModel):
    status: str
    service: str
    mode: str


class ReadinessHealthResponse(HealthResponse):
    checks: list[dict]
