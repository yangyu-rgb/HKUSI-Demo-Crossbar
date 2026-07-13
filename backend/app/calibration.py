"""Versioned, immutable transparent calibration policy for the Demo."""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class CalibrationPolicy:
    version: str
    recurring_event_multipliers: Mapping[str, float]
    recurring_event_cap: float
    scenario_weather_multipliers: Mapping[str, float]
    scenario_holiday_multiplier: float
    scenario_event_multipliers: Mapping[str, float]
    scenario_cap: float
    crowdsource_single_cap: float
    crowdsource_pair_cap: float
    crowdsource_consensus_cap: float
    crowdsource_consensus_min_reporters: int
    crowdsource_consensus_min_quality: float
    crowdsource_consensus_max_dispersion_minutes: float


CALIBRATION_POLICY = CalibrationPolicy(
    version="transparent-calibration-v2.3",
    recurring_event_multipliers=MappingProxyType({
        "low": 1.05,
        "medium": 1.12,
        "high": 1.20,
    }),
    recurring_event_cap=1.35,
    scenario_weather_multipliers=MappingProxyType({
        "clear": 1.0,
        "rain": 1.08,
        "heavy_rain": 1.18,
        "thunderstorm": 1.25,
    }),
    scenario_holiday_multiplier=1.24,
    scenario_event_multipliers=MappingProxyType({
        "none": 1.0,
        "low": 1.08,
        "medium": 1.20,
        "high": 1.38,
    }),
    scenario_cap=2.10,
    crowdsource_single_cap=0.15,
    crowdsource_pair_cap=0.30,
    crowdsource_consensus_cap=0.45,
    crowdsource_consensus_min_reporters=3,
    crowdsource_consensus_min_quality=80.0,
    crowdsource_consensus_max_dispersion_minutes=8.0,
)
