from datetime import datetime, timedelta
from math import exp, sqrt
from statistics import NormalDist

from ..clock import Clock, as_hong_kong
from ..config import (
    CROWDSOURCE_HORIZON_DECAY_MINUTES,
    CROWDSOURCE_MAX_WEIGHT,
    EVENT_IMPACT_MULTIPLIERS,
    HISTORY_ADJACENT_HOUR_WEIGHT,
    HISTORY_RECENCY_HALF_LIFE_DAYS,
    MIN_STANDARD_DEVIATION_MINUTES,
    MAX_COMBINED_EVENT_MULTIPLIER,
    REPORT_EXPIRY_MINUTES,
    TREND_UNCERTAINTY_FACTOR,
    CONFIDENCE_LEVEL,
)
from ..repositories import DemoRepository
from .report_quality import evaluate_reports, quality_weighted_wait


def _circular_hour_distance(left: int, right: int) -> int:
    difference = abs(left - right)
    return min(difference, 24 - difference)


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    return sum(value * weight for value, weight in zip(values, weights)) / sum(weights)


def _time_is_in_event_window(
    target_time: datetime,
    start_time: str,
    end_time: str,
) -> bool:
    target_minutes = target_time.hour * 60 + target_time.minute
    start_hour, start_minute = (int(value) for value in start_time.split(":"))
    end_hour, end_minute = (int(value) for value in end_time.split(":"))
    start_minutes = start_hour * 60 + start_minute
    end_minutes = end_hour * 60 + end_minute
    if start_minutes <= end_minutes:
        return start_minutes <= target_minutes < end_minutes
    return target_minutes >= start_minutes or target_minutes < end_minutes


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

        input_context = self._repository.get_prediction_input_context(target)
        weather = input_context["weather"]
        weather_records = [record for record in hour_records if record["weather"] == weather]
        comparable = weather_records if len(weather_records) >= 6 else hour_records

        target_is_holiday = input_context["is_holiday"]
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
                f"{'节假日' if target_is_holiday else ('工作日' if weekday_group else '周末')} "
                f"{target.hour:02d}:00±1h · {weather}"
            ),
            "is_holiday": target_is_holiday,
        }

    def _event_context(self, port_name: str, target_time: datetime) -> dict:
        target = as_hong_kong(target_time)
        active_events = [
            event
            for event in self._repository.get_events().get("events", [])
            if port_name in event.get("affected_ports", [])
            and target.weekday() in event.get("weekdays", [])
            and _time_is_in_event_window(
                target,
                event["start_time"],
                event["end_time"],
            )
        ]
        multiplier = min(
            MAX_COMBINED_EVENT_MULTIPLIER,
            _weighted_mean(
                [EVENT_IMPACT_MULTIPLIERS[event["impact"]] for event in active_events],
                [1.0] * len(active_events),
            )
            if active_events
            else 1.0,
        )
        return {
            "multiplier": multiplier,
            "events": active_events,
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
        event_context = self._event_context(port_name, target)
        next_event_context = self._event_context(port_name, target + timedelta(hours=1))
        event_adjusted_baseline = baseline["value"] * event_context["multiplier"]
        event_adjusted_next = next_hour["value"] * next_event_context["multiplier"]
        slope = abs(event_adjusted_next - event_adjusted_baseline)

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

        value = event_adjusted_baseline
        if crowd_mean is not None:
            value = event_adjusted_baseline * (1 - crowd_weight) + crowd_mean * crowd_weight
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
        if baseline["is_holiday"]:
            factors.append(
                {
                    "code": "holiday_calendar",
                    "label": "节假日日历",
                    "detail": "按节假日历史样本计算基线",
                }
            )
        if event_context["events"]:
            event_names = "、".join(event["name"] for event in event_context["events"])
            factors.append(
                {
                    "code": "recurring_event",
                    "label": "周期性事件",
                    "value_multiplier": round(event_context["multiplier"], 3),
                    "detail": f"{event_names}，已作用于指定口岸等待基线",
                }
            )
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
            "uncalibrated_value": event_adjusted_baseline,
            "standard_deviation": sigma,
            "sample_count": baseline["sample_count"],
            "slope": slope,
            "factors": factors,
            "crowdsource_count": len(active_reports),
            "crowdsource_mean": crowd_mean,
            "crowdsource_weight": crowd_weight,
            "event_names": [event["name"] for event in event_context["events"]],
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
        z_score = NormalDist().inv_cdf(0.5 + CONFIDENCE_LEVEL / 2)
        for port in metadata["ports"]:
            estimates = []
            for offset in (0, 60, 120, 180):
                estimate = self.estimate(
                    port["name"],
                    now + timedelta(minutes=offset),
                    now,
                    reports,
                )
                estimates.append(estimate)
            waits = [max(1, round(estimate["value"])) for estimate in estimates]
            current_wait = waits[0]
            forecast = []
            for offset, wait, estimate in zip((0, 60, 120, 180), waits, estimates):
                forecast_at = now + timedelta(minutes=offset)
                forecast.append(
                    {
                        "offset_minutes": offset,
                        "forecast_at": forecast_at,
                        "wait": wait,
                        "lower_bound": max(
                            1,
                            round(
                                estimate["value"]
                                - z_score * estimate["standard_deviation"]
                            ),
                        ),
                        "upper_bound": round(
                            estimate["value"]
                            + z_score * estimate["standard_deviation"]
                        ),
                        "change_from_now": wait - current_wait,
                    }
                )
            crowd_level = "high" if current_wait >= 35 else "medium" if current_wait >= 18 else "low"
            passenger_flow = {"high": "拥挤", "medium": "较繁忙", "low": "畅通"}[crowd_level]
            anomalies = []
            if estimates[0]["event_names"]:
                anomalies.append(
                    "周期性事件影响：" + "、".join(estimates[0]["event_names"])
                )
            if current_wait >= 35:
                anomalies.append("当前模拟等待处于高位")
            if forecast[1]["wait"] - current_wait >= 8:
                anomalies.append("未来60分钟模拟等待预计明显上升")
            change_next_hour = forecast[1]["wait"] - current_wait
            trend = (
                "rising"
                if change_next_hour >= 3
                else "falling" if change_next_hour <= -3 else "stable"
            )
            peak = max(forecast, key=lambda item: item["wait"])
            ports.append(
                {
                    **port,
                    "current_wait": current_wait,
                    "crowd_level": crowd_level,
                    "passenger_flow": passenger_flow,
                    "forecast": forecast,
                    "anomalies": anomalies,
                    "crowdsource_count": estimates[0]["crowdsource_count"],
                    "trend": trend,
                    "change_next_hour": change_next_hour,
                    "peak_wait": peak["wait"],
                    "peak_at": peak["forecast_at"],
                }
            )
        smoothest = min(ports, key=lambda item: item["current_wait"])
        highest_pressure = max(ports, key=lambda item: item["current_wait"])
        fastest_rising = max(ports, key=lambda item: item["change_next_hour"])
        return {
            "timestamp": now,
            "source": metadata["source"],
            "data_sources": self._repository.get_provider_statuses(),
            "ports": ports,
            "alerts": metadata["alerts"],
            "overview": {
                "smoothest_port_id": smoothest["id"],
                "smoothest_port_name": smoothest["name"],
                "smoothest_wait": smoothest["current_wait"],
                "highest_pressure_port_id": highest_pressure["id"],
                "highest_pressure_port_name": highest_pressure["name"],
                "highest_pressure_wait": highest_pressure["current_wait"],
                "fastest_rising_port_id": fastest_rising["id"],
                "fastest_rising_port_name": fastest_rising["name"],
                "fastest_rising_change": fastest_rising["change_next_hour"],
                "active_anomaly_count": sum(
                    len(port["anomalies"]) for port in ports
                ),
                "crowdsource_report_count": sum(
                    port["crowdsource_count"] for port in ports
                ),
            },
        }, reports
