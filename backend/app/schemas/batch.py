from datetime import date

from pydantic import BaseModel, Field


class BatchEmployee(BaseModel):
    id: int | str
    name: str = Field(default="", max_length=60)
    origin_id: str = Field(min_length=1)
    destination_id: str = Field(min_length=1)
    arrival_deadline: str = Field(pattern=r"^\d{2}:\d{2}$")


class BatchRequest(BaseModel):
    company: str = Field(min_length=1)
    employees: list[BatchEmployee] = Field(min_length=1, max_length=100)
    date: date


class BatchPlanItem(BaseModel):
    employee_id: int | str
    recommended_port: str
    departure_time: str
    total_time: int
    late_risk_percent: int


class BatchSummary(BaseModel):
    employee_count: int
    avg_commute_time: int
    high_risk_count: int
    recommendation: str


class BatchResponse(BaseModel):
    plan_id: str
    company: str
    date: date
    plan: list[BatchPlanItem]
    summary: BatchSummary


class BatchHistoryRecord(BaseModel):
    plan_id: str
    company: str
    date: str
    request: dict
    result: dict
    created_at: str


class BatchHistoryResponse(BaseModel):
    plans: list[BatchHistoryRecord]
    total: int
