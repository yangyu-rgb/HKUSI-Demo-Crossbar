from datetime import date, datetime

from pydantic import BaseModel, Field

from .common import Priority, Weekday


class Routine(BaseModel):
    origin_id: str = Field(min_length=1)
    destination_id: str = Field(min_length=1)
    days: list[Weekday] = Field(min_length=1)
    arrival_deadline: str = Field(pattern=r"^\d{2}:\d{2}$")
    priority: Priority = Priority.BALANCED


class AlertPreferences(BaseModel):
    advance_reminder: bool = True
    anomaly_alert: bool = True
    better_route_alert: bool = True


class SubscriptionRequest(BaseModel):
    user_id: str = Field(default="demo-user", min_length=1)
    routine: Routine
    alerts: AlertPreferences = Field(default_factory=AlertPreferences)


class SubscriptionUpdate(BaseModel):
    routine: Routine
    alerts: AlertPreferences = Field(default_factory=AlertPreferences)


class SubscriptionRecord(BaseModel):
    subscription_id: str
    user_id: str
    routine: Routine
    alerts: AlertPreferences
    created_at: str
    updated_at: str
    next_alert: datetime | None = None
    message: str | None = None


class SubscriptionListResponse(BaseModel):
    subscriptions: list[SubscriptionRecord]
    total: int


class AlertPreview(BaseModel):
    kind: str
    title: str
    message: str
    enabled: bool
    triggered: bool
    scheduled_at: datetime | None = None


class SubscriptionEvaluationResponse(BaseModel):
    subscription_id: str
    evaluated_at: datetime
    evaluation_time: datetime
    commute_date: date
    target_time: datetime
    recommended_port: str
    recommended_port_id: str
    latest_departure: datetime
    next_alert: datetime | None = None
    alternative_port: str | None = None
    alerts: list[AlertPreview]
    warnings: list[str]
