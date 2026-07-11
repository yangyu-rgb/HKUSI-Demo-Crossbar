from datetime import datetime, timedelta

import pytest

from app.exceptions import DomainValidationError
from app.schemas.prediction import PredictionRequest
from app.services import PredictionService
from app.services.wait_forecast import WaitForecastService


def request(
    *,
    origin_id: str = "hku",
    destination_id: str = "nanshan-tech",
    target_time: str = "2026-07-10T09:30:00",
    priority: str = "balanced",
    max_budget: int | None = 100,
) -> PredictionRequest:
    return PredictionRequest(
        origin_id=origin_id,
        destination_id=destination_id,
        target_time=target_time,
        preferences={"priority": priority, "max_budget": max_budget},
    )


def test_location_matrix_changes_route_time(prediction_service: PredictionService) -> None:
    hku = prediction_service.predict(request())
    kowloon = prediction_service.predict(
        request(origin_id="kowloon-tong", destination_id="futian-cbd")
    )

    hku_times = {item["port_id"]: item["total_time"] for item in hku["ports"]}
    kowloon_times = {item["port_id"]: item["total_time"] for item in kowloon["ports"]}
    assert hku_times != kowloon_times
    assert hku["query"]["origin_name"] == "香港大学"
    assert kowloon["query"]["destination_name"] == "深圳福田 CBD"


def test_preferences_change_recommendation(prediction_service: PredictionService) -> None:
    fastest = prediction_service.predict(
        request(priority="fastest", target_time="2026-07-10T10:30:00")
    )
    cheapest = prediction_service.predict(
        request(priority="cheapest", target_time="2026-07-10T10:30:00")
    )

    assert fastest["recommended"] == "深圳湾"
    assert cheapest["recommended"] == "罗湖"


def test_departure_and_feasibility_are_calculated(
    prediction_service: PredictionService,
) -> None:
    result = prediction_service.predict(request())
    recommended = result["ports"][0]

    assert recommended["on_time"] is True
    assert recommended["buffer_minutes"] > 0
    assert recommended["latest_departure"] < datetime.fromisoformat(
        "2026-07-10T09:30:00+08:00"
    )
    assert recommended["estimated_arrival"] <= datetime.fromisoformat(
        "2026-07-10T09:30:00+08:00"
    )


def test_all_routes_late_returns_least_late_warning(
    prediction_service: PredictionService,
) -> None:
    result = prediction_service.predict(
        request(target_time="2026-07-10T08:00:00", max_budget=None)
    )

    assert result["ports"][0]["on_time"] is False
    assert any("无法准时" in warning for warning in result["warnings"])


def test_no_route_in_budget_returns_cheapest_warning(
    prediction_service: PredictionService,
) -> None:
    result = prediction_service.predict(request(max_budget=10))

    assert result["ports"][0]["within_budget"] is False
    assert result["recommended"] == "罗湖"
    assert any("预算" in warning for warning in result["warnings"])


def test_unknown_location_is_rejected(prediction_service: PredictionService) -> None:
    with pytest.raises(DomainValidationError, match="不支持该出发地点"):
        prediction_service.predict(request(origin_id="unknown"))


def test_forecast_uses_calendar_history_and_uncertainty(
    prediction_service: PredictionService,
) -> None:
    result = prediction_service.predict(
        request(target_time="2026-07-10T08:15:00", max_budget=None)
    )
    luohu = next(item for item in result["ports"] if item["port_id"] == "luohu")
    history_factor = next(
        factor for factor in luohu["factors"] if factor["code"] == "historical_calendar"
    )

    assert history_factor["sample_count"] >= 6
    assert "工作日" in history_factor["detail"]
    assert luohu["historical_sample_count"] >= 6
    assert luohu["confidence_interval"][1] > luohu["confidence_interval"][0]
    assert luohu["uncertainty_minutes"] >= 3


def test_target_window_is_enforced(prediction_service: PredictionService) -> None:
    with pytest.raises(DomainValidationError, match="目标时间超出"):
        prediction_service.predict(request(target_time="2026-07-25T12:00:00"))


def test_calendar_model_changes_with_hour_and_day_type(repository, clock) -> None:
    forecast = WaitForecastService(repository, clock)
    weekday_peak = forecast.estimate(
        "罗湖",
        datetime.fromisoformat("2026-07-10T08:30:00+08:00"),
        clock.now(),
        [],
    )
    weekday_midday = forecast.estimate(
        "罗湖",
        datetime.fromisoformat("2026-07-10T13:00:00+08:00"),
        clock.now(),
        [],
    )
    weekend_peak = forecast.estimate(
        "罗湖",
        datetime.fromisoformat("2026-07-11T08:30:00+08:00"),
        clock.now(),
        [],
    )

    assert weekday_peak["value"] > weekday_midday["value"]
    assert weekday_peak["value"] > weekend_peak["value"]


def test_crowdsource_weight_decays_for_longer_horizons(repository, clock) -> None:
    forecast = WaitForecastService(repository, clock)
    _snapshot, reports = forecast.build_snapshot(clock.now())
    current = forecast.estimate("福田", clock.now(), clock.now(), reports)
    future = forecast.estimate(
        "福田",
        clock.now() + timedelta(hours=3),
        clock.now(),
        reports,
    )
    current_crowd = next(
        factor for factor in current["factors"] if factor["code"] == "crowdsource"
    )
    future_crowd = next(
        factor for factor in future["factors"] if factor["code"] == "crowdsource"
    )

    assert current_crowd["effective_weight"] > future_crowd["effective_weight"]


def test_holiday_calendar_is_used_and_explained(repository, clock) -> None:
    forecast = WaitForecastService(repository, clock)

    estimate = forecast.estimate(
        "罗湖",
        datetime.fromisoformat("2026-07-01T08:30:00+08:00"),
        clock.now(),
        [],
    )

    holiday_factor = next(
        factor for factor in estimate["factors"] if factor["code"] == "holiday_calendar"
    )
    assert holiday_factor["detail"] == "按节假日历史样本计算基线"


def test_recurring_event_is_applied_and_visible_in_realtime(repository, clock) -> None:
    forecast = WaitForecastService(repository, clock)
    event_time = datetime.fromisoformat("2026-07-10T09:00:00+08:00")

    estimate = forecast.estimate("罗湖", event_time, event_time, [])
    snapshot, _reports = forecast.build_snapshot(event_time)
    luohu = next(port for port in snapshot["ports"] if port["id"] == "luohu")
    event_factor = next(
        factor for factor in estimate["factors"] if factor["code"] == "recurring_event"
    )

    assert event_factor["value_multiplier"] == 1.12
    assert "Morning cross-border commuter peak" in event_factor["detail"]
    assert any("周期性事件影响" in anomaly for anomaly in luohu["anomalies"])
