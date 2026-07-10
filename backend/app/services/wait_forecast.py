from datetime import datetime, timedelta
from math import exp, sqrt

from ..clock import Clock, as_hong_kong
from ..config import (
    CROWDSOURCE_HORIZON_DECAY_MINUTES,
    CROWDSOURCE_MAX_WEIGHT,
    HISTORY_ADJACENT_HOUR_WEIGHT,
    HISTORY_RECENCY_HALF_LIFE_DAYS,
    MIN_STANDARD_DEVIATION_MINUTES,
    REPORT_EXPIRY_MINUTES,
    TREND_UNCERTAINTY_FACTOR,
)
from ..repositories import DemoRepository
from .report_quality import evaluate_reports, quality_weighted_wait


def _circular_hour_distance(left: int, right: int) -> int:
    difference = abs(left - right)
    return min(difference, 24 - difference)


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    return sum(value * weight for value, weight in zip(values, weights)) / sum(weights)


class WaitForecastService:
    """Generate simulated waits from calendar-matched historical samples."""

    def __init__(self, repository: DemoRepository, clock: Clock):
        self._repository = repository
        self._clock = clock
        self._latest_history = max(
            record["timestamp"]
            for port in repository.get_port_state()["ports"]
            for record in repository.get_history(port["name"])
        )

    def _historical_estimate(self, port_name: str, target_time: datetime) -> dict:
        target = as_hong_kong(target_time)
        records = self._repository.get_history(port_name)
        weekday_group = target.weekday() < 5
        hour_records = [
            record
            for record in records
            if (record["timestamp"].weekday() < 5) == weekday_group
            and _circular_hour_distance(record["timestamp"].hour, target.hour) <= 1
        ]

        weather_condition = self._repository.get_weather()["condition"]
        weather = (
            "rain"
            if "rain" in weather_condition or "thunder" in weather_condition
            else "clear"
        )
        weather_records = [record for record in hour_records if record["weather"] == weather]
        comparable = weather_records if len(weather_records) >= 6 else hour_records

        holiday_dates = set(self._repository.get_holidays()["dates"])
        target_is_holiday = target.date().isoformat() in holiday_dates
        holiday_records = [
            record for record in comparable if record["is_holiday"] == target_is_holiday
        ]
        if len(holiday_records) >= 6:
            comparable = holiday_records
        if not comparable:
            comparable = records

        values: list[float] = []
        weights: list[float] = []
        for record in comparable:
            age_days = max(
                0.0,
                (self._latest_history - record["timestamp"]).total_seconds() / 86400,
            )
            recency_weight = 0.5 ** (age_days / HISTORY_RECENCY_HALF_LIFE_DAYS)
            hour_weight = (
                1.0
                if record["timestamp"].hour == target.hour
                else HISTORY_ADJACENT_HOUR_WEIGHT
            )
            values.append(float(record["wait_minutes"]))
            weights.append(recency_weight * hour_weight)

        mean = _weighted_mean(values, weights)
        variance = _weighted_mean(
            [(value - mean) ** 2 for value in values],
            weights,
        )
        return {
            "value": mean,
            "standard_deviation": max(sqrt(variance), MIN_STANDARD_DEVIATION_MINUTES),
            "sample_count": len(values),
            "bucket": (
                f"{'工作日' if weekday_group else '周末'} "
                f"{target.hour:02d}:00±1h · {weather}"
            ),
        }

    def estimate(
        self,
        port_name: str,
        target_time: datetime,
        current_time: datetime,
        reports: list[dict],
    ) -> dict:
        target = as_hong_kong(target_time)
        current = as_hong_kong(current_time)
        baseline = self._historical_estimate(port_name, target)
        next_hour = self._historical_estimate(port_name, target + timedelta(hours=1))
        slope = abs(next_hour["value"] - baseline["value"])

        active_reports = [
            report
            for report in reports
            if report["port"] == port_name and report["used_for_prediction"]
        ][-3:]
        crowd_mean = quality_weighted_wait(active_reports) if active_reports else None
        horizon_minutes = max(0.0, (target - current).total_seconds() / 60)
        if active_reports:
            average_freshness = sum(
                max(0.0, 1 - report["_age_minutes"] / REPORT_EXPIRY_MINUTES)
                for report in active_reports
            ) / len(active_reports)
            crowd_weight = (
                CROWDSOURCE_MAX_WEIGHT
                * average_freshness
                * exp(-horizon_minutes / CROWDSOURCE_HORIZON_DECAY_MINUTES)
            )
        else:
            crowd_weight = 0.0

        value = baseline["value"]
        if crowd_mean is not None:
            value = baseline["value"] * (1 - crowd_weight) + crowd_mean * crowd_weight
        sigma = max(
            baseline["standard_deviation"],
            slope * TREND_UNCERTAINTY_FACTOR,
            MIN_STANDARD_DEVIATION_MINUTES,
        )
        factors = [
            {
                "code": "historical_calendar",
                "label": "时间匹配历史基线",
                "value_minutes": round(baseline["value"], 1),
                "effective_weight": round(1 - crowd_weight, 3),
                "detail": baseline["bucket"],
                "sample_count": baseline["sample_count"],
            }
        ]
        if crowd_mean is not None:
            factors.append(
                {
                    "code": "crowdsource",
                    "label": "近期现场反馈",
                    "value_minutes": round(crowd_mean, 1),
                    "effective_weight": round(crowd_weight, 3),
                    "average_quality_score": round(
                        sum(report["quality_score"] for report in active_reports)
                        / len(active_reports)
                    ),
                    "detail": f"{len(active_reports)}条有效反馈，影响随时间衰减",
                }
            )
        factors.append(
            {
                "code": "uncertainty",
                "label": "历史波动与趋势",
                "standard_deviation_minutes": round(sigma, 2),
                "forecast_slope_minutes_per_hour": round(slope, 2),
            }
        )
        return {
            "value": value,
            "standard_deviation": sigma,
            "sample_count": baseline["sample_count"],
            "slope": slope,
            "factors": factors,
            "crowdsource_count": len(active_reports),
        }

    def build_snapshot(self, current_time: datetime | None = None) -> tuple[dict, list[dict]]:
        now = as_hong_kong(current_time or self._clock.now()).replace(microsecond=0)
        metadata = self._repository.get_port_state()
        quality_ports = []
        for port in metadata["ports"]:
            baseline = self._historical_estimate(port["name"], now)
            quality_ports.append({**port, "current_wait": round(baseline["value"])})
        reports = evaluate_reports(self._repository.get_reports(), quality_ports, now)

        ports = []
        for port in metadata["ports"]:
            forecast = []
            estimates = []
            for offset in (0, 60, 120, 180):
                estimate = self.estimate(
                    port["name"],
                    now + timedelta(minutes=offset),
                    now,
                    reports,
                )
                estimates.append(estimate)
                forecast.append({"offset_minutes": offset, "wait": max(1, round(estimate["value"]))})
            current_wait = forecast[0]["wait"]
            crowd_level = "high" if current_wait >= 35 else "medium" if current_wait >= 18 else "low"
            passenger_flow = {"high": "拥挤", "medium": "较繁忙", "low": "畅通"}[crowd_level]
            anomalies = []
            if current_wait >= 35:
                anomalies.append("当前模拟等待处于高位")
            if forecast[1]["wait"] - current_wait >= 8:
                anomalies.append("未来60分钟模拟等待预计明显上升")
            ports.append(
                {
                    **port,
                    "current_wait": current_wait,
                    "crowd_level": crowd_level,
                    "passenger_flow": passenger_flow,
                    "forecast": forecast,
                    "anomalies": anomalies,
                    "crowdsource_count": estimates[0]["crowdsource_count"],
                }
            )
        return {
            "timestamp": now,
            "source": metadata["source"],
            "ports": ports,
            "alerts": metadata["alerts"],
        }, reports
