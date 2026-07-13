from datetime import datetime

from pydantic import BaseModel, Field

from .common import (
    CrossingChannel,
    CrowdLevel,
    ObservationSource,
    ReportQualityLevel,
    TravelDirection,
)


class CrowdsourceReport(BaseModel):
    user_id: str = Field(default="demo-user", min_length=1)
    port: str = Field(min_length=1)
    actual_wait_time: int = Field(ge=0, le=180)
    crowd_level: CrowdLevel
    comment: str = Field(default="", max_length=160)
    forecast_run_id: str | None = None
    forecast_port_id: str | None = None
    direction: TravelDirection = TravelDirection.HONG_KONG_TO_SHENZHEN
    channel: CrossingChannel = CrossingChannel.TRAVELLER


class CrowdsourceRecord(CrowdsourceReport):
    id: str
    timestamp: datetime
    time_label: str
    quality_score: int = Field(ge=0, le=100)
    quality_level: ReportQualityLevel
    expires_at: datetime
    used_for_prediction: bool
    source_type: ObservationSource


class CrowdsourceFeedResponse(BaseModel):
    reports: list[CrowdsourceRecord]
    total: int


class ForecastFeedbackLink(BaseModel):
    forecast_run_id: str
    forecast_port_id: str
    linked: bool
    calibration_linked: bool
    reason: str | None = None


class CrowdsourceSubmitResponse(BaseModel):
    success: bool
    points_earned: int
    model_updated: bool
    report: CrowdsourceRecord
    message: str
    forecast_feedback: ForecastFeedbackLink | None = None
    calibration_preview: dict
