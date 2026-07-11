from datetime import datetime, timedelta
from io import StringIO
import csv

from pydantic import ValidationError

from ..clock import Clock
from ..repositories import DemoRepository
from ..ml.shadow import ShadowWaitModel
from ..ml.scenario_model import ScenarioWaitModel
from ..schemas.batch import BatchEmployee, BatchRequest
from ..schemas.common import Priority
from ..schemas.prediction import PredictionPreferences, PredictionRequest
from .prediction import PredictionService


class BatchService:
    def __init__(
        self,
        repository: DemoRepository,
        clock: Clock,
        shadow_model: ShadowWaitModel | None = None,
        scenario_model: ScenarioWaitModel | None = None,
    ):
        self._repository = repository
        self._prediction_service = PredictionService(
            repository,
            clock,
            shadow_model=shadow_model,
            scenario_model=scenario_model,
        )

    def create_plan(
        self,
        request: BatchRequest,
        organization_id: str = "demo-org",
    ) -> dict:
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
            organization_id,
        )
        return {"plan_id": plan_id, **result}

    def list_plans(
        self,
        company: str,
        limit: int,
        organization_id: str = "demo-org",
    ) -> dict:
        plans = self._repository.list_batch_plans(company, limit, organization_id)
        return {"plans": plans, "total": len(plans)}

    def validate_csv(self, csv_text: str) -> dict:
        reader = csv.DictReader(StringIO(csv_text.lstrip("\ufeff")))
        required = {"id", "name", "origin_id", "destination_id", "arrival_deadline"}
        if reader.fieldnames is None or not required <= set(reader.fieldnames):
            missing = sorted(required - set(reader.fieldnames or []))
            return {
                "valid": False,
                "employees": [],
                "errors": [{"row": 1, "message": f"缺少列：{', '.join(missing)}"}],
            }
        employees = []
        errors = []
        for row_number, row in enumerate(reader, start=2):
            try:
                employee = BatchEmployee.model_validate(
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "origin_id": row["origin_id"],
                        "destination_id": row["destination_id"],
                        "arrival_deadline": row["arrival_deadline"],
                    }
                )
                if self._repository.infer_direction(
                    employee.origin_id,
                    employee.destination_id,
                ) is None:
                    raise ValueError("出发地与目的地必须位于深港两侧")
                employees.append(employee.model_dump(mode="json"))
            except (ValidationError, ValueError) as error:
                errors.append({"row": row_number, "message": str(error)})
        if len(employees) > 100:
            errors.append({"row": 1, "message": "单次最多导入 100 名员工"})
            employees = employees[:100]
        return {"valid": not errors and bool(employees), "employees": employees, "errors": errors}

    def export_plan_csv(
        self,
        plan_id: str,
        organization_id: str = "demo-org",
    ) -> str | None:
        record = self._repository.get_batch_plan(plan_id, organization_id)
        if record is None:
            return None
        employees = {
            str(item["id"]): item
            for item in record["request"].get("employees", [])
        }
        output = StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=(
                "employee_id",
                "name",
                "recommended_port",
                "departure_time",
                "total_time",
                "late_risk_percent",
                "priority",
                "max_budget",
                "within_budget",
            ),
        )
        writer.writeheader()
        for item in record["result"]["plan"]:
            employee = employees.get(str(item["employee_id"]), {})
            writer.writerow({**item, "name": employee.get("name", "")})
        return output.getvalue()
