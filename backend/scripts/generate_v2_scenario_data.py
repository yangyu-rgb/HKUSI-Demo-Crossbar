"""Generate deterministic classroom scenario labels for AI v2."""

from datetime import datetime, timedelta
from pathlib import Path
import csv
import math
import random


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data/history/scenario_wait_history_v2.csv"
START = datetime(2025, 1, 1)
DAYS = 224
PORTS = {"罗湖": (18, 13), "福田": (13, 10), "皇岗": (27, 15), "深圳湾": (16, 9)}
DIRECTIONS = ("hong_kong_to_shenzhen", "shenzhen_to_hong_kong")
WEATHERS = ("clear", "rain", "heavy_rain", "thunderstorm")
IMPACTS = ("none", "low", "medium", "high")
WEATHER_FACTOR = {"clear": 1.0, "rain": 1.08, "heavy_rain": 1.18, "thunderstorm": 1.25}
EVENT_FACTOR = {"none": 1.0, "low": 1.08, "medium": 1.20, "high": 1.38}


def wait_minutes(port_index: int, base: int, peak: int, moment: datetime, direction: str, weather: str, holiday: bool, impact: str) -> int:
    morning_center = 8.3 if direction == "hong_kong_to_shenzhen" else 9.2
    evening_center = 18.0 if direction == "shenzhen_to_hong_kong" else 17.4
    morning = math.exp(-((moment.hour - morning_center) ** 2) / 3.0)
    evening = math.exp(-((moment.hour - evening_center) ** 2) / 4.5)
    weekend = 0.9 if moment.weekday() >= 5 else 1.0
    holiday_factor = 1.24 if holiday else 1.0
    direction_factor = 1.07 if direction == "shenzhen_to_hong_kong" and moment.hour >= 16 else 1.0
    interaction = 1.04 if impact != "none" and weather in {"heavy_rain", "thunderstorm"} else 1.0
    noise = random.Random(f"{moment.isoformat()}-{port_index}-{direction}-{weather}-{impact}").uniform(-2.2, 2.2)
    value = (base + peak * morning + peak * 0.72 * evening + noise)
    return max(2, round(value * weekend * holiday_factor * direction_factor * WEATHER_FACTOR[weather] * EVENT_FACTOR[impact] * interaction))


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(["timestamp", "port", "direction", "weather", "is_holiday", "event_impact", "wait_minutes"])
        for day_offset in range(DAYS):
            day = START + timedelta(days=day_offset)
            holiday = day_offset % 29 == 0 or day_offset % 47 == 0
            for hour in range(24):
                moment = day.replace(hour=hour)
                for port_index, (port, (base, peak)) in enumerate(PORTS.items()):
                    for direction_index, direction in enumerate(DIRECTIONS):
                        weather = WEATHERS[(day_offset + direction_index) % len(WEATHERS)]
                        impact = IMPACTS[(day_offset * 3 + hour + port_index + direction_index) % len(IMPACTS)]
                        writer.writerow([moment.isoformat(), port, direction, weather, str(holiday).lower(), impact, wait_minutes(port_index, base, peak, moment, direction, weather, holiday, impact)])
    print(f"generated={OUTPUT}")


if __name__ == "__main__":
    main()
