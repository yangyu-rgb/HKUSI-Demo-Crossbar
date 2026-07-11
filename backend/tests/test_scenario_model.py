from datetime import datetime

from app.ml.scenario_model import ScenarioWaitModel


def test_v2_artifact_loads_and_scenario_has_directional_effect() -> None:
    model = ScenarioWaitModel.load_optional()
    assert model.status.available is True
    common = {
        "port": "深圳湾",
        "direction": "hong_kong_to_shenzhen",
        "timestamp": datetime.fromisoformat("2026-07-10T09:30:00+08:00"),
    }
    baseline = model.predict(**common, weather="clear", is_holiday=False, event_impact="none")
    severe = model.predict(**common, weather="heavy_rain", is_holiday=True, event_impact="high")
    assert baseline is not None and severe is not None
    assert severe[0] > baseline[0] + 8


def test_v2_loader_fails_closed_when_artifact_is_missing(tmp_path) -> None:
    model = ScenarioWaitModel.load_optional(artifact_path=tmp_path / "missing.joblib")
    assert model.status.available is False
    assert model.predict(
        port="罗湖",
        direction="hong_kong_to_shenzhen",
        timestamp=datetime.fromisoformat("2026-07-10T09:30:00+08:00"),
        weather="clear",
        is_holiday=False,
        event_impact="none",
    ) is None
