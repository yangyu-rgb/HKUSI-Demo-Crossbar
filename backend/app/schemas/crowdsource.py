from datetime import datetime

from pydantic import BaseModel, Field

from .common import CrowdLevel, ReportQualityLevel


class CrowdsourceReport(BaseModel):
    user_id: str = Field(default="demo-user", min_length=1)
    port: str = Field(min_length=1)
    actual_wait_time: int = Field(ge=0, le=180)
    crowd_level: CrowdLevel
    comment: str = Field(default="", max_length=160)


class CrowdsourceRecord(CrowdsourceReport):
    id: str
    timestamp: datetime
    time_label: str
    quality_score: int = Field(ge=0, le=100)
    quality_level: ReportQualityLevel
    expires_at: datetime
    used_for_prediction: bool


class CrowdsourceFeedResponse(BaseModel):
    reports: list[CrowdsourceRecord]
    total: int


class CrowdsourceSubmitResponse(BaseModel):
    success: bool
    points_earned: int
    model_updated: bool
    report: CrowdsourceRecord
    message: str
