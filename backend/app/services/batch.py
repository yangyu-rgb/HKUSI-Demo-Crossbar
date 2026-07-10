from datetime import datetime, timedelta

from ..clock import Clock
from ..repositories import DemoRepository
from ..ml.shadow import ShadowWaitModel
from ..schemas.batch import BatchRequest
from ..schemas.common import Priority
from ..schemas.prediction import PredictionPreferences, PredictionRequest
from .prediction import PredictionService


class BatchService:
    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        shadow_model: ShadowWaitModel | None = None,
    ):
        self._repository = repository
        self._prediction_service = PredictionService(
            repository,
            clock,
            shadow_model=shadow_model,
        )

    def create_plan(self, request: BatchRequest) -> dict:
        plan = []
        for employee in request.employees:
            deadline = datetime.fromisoformat(
                f"{request.date.isoformat()}T{employee.arrival_deadline}:00"
            )
            preferences = employee.preferences or request.preferences
            result = self._prediction_service.predict(
                PredictionRequest(
                    origin_id=employee.origin_id,
                    destination_id=employee.destination_id,
                    target_time=deadline,
                    preferences=preferences,
                )
            )
            route = result["ports"][0]
            departure = deadline - timedelta(minutes=route["total_time"] + 10)
            plan.append(
                {
                    "employee_id": employee.id,
                    "recommended_port": route["name"],
                    "departure_time": departure.strftime("%H:%M"),
                    "total_time": route["total_time"],
                    "late_risk_percent": route["late_risk_percent"],
                    "priority": Priority(preferences.priority),
                    "max_budget": preferences.max_budget,
                    "within_budget": route["within_budget"],
                }
            )

        high_risk_count = sum(item["late_risk_percent"] >= 20 for item in plan)
        over_budget_count = sum(not item["within_budget"] for item in plan)
        recommendation = "高风险员工建议提前20分钟出发，并订阅异常拥堵提醒。"
        if over_budget_count:
            recommendation += f" 另有{over_budget_count}名员工没有满足预算的可用路线。"
        result = {
            "company": request.company,
            "date": request.date.isoformat(),
            "plan": plan,
            "summary": {
                "employee_count": len(plan),
                "avg_commute_time": round(
                    sum(item["total_time"] for item in plan) / len(plan)
                ),
                "high_risk_count": high_risk_count,
                "recommendation": recommendation,
            },
        }
        plan_id = self._repository.save_batch_plan(
            request.company,
            request.date.isoformat(),
            request.model_dump(mode="json"),
            result,
        )
        return {"plan_id": plan_id, **result}

    def list_plans(self, company: str, limit: int) -> dict:
        plans = self._repository.list_batch_plans(company, limit)
        return {"plans": plans, "total": len(plans)}
