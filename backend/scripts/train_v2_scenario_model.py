from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from argparse import ArgumentParser
import csv
import hashlib
import json
import sys

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
from app.ml.scenario_features import FEATURE_NAMES, PORTS, scenario_feature_vector  # noqa: E402

DATASET = ROOT / "data/history/scenario_wait_history_v2.csv"
ARTIFACT = ROOT / "data/runtime/models/wait_model_v2.joblib"
DEFAULT_METADATA = ROOT / "data/models/wait_model_v2.metadata.json"
MODEL_VERSION = "synthetic-scenario-hgb-v2"


def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=ARTIFACT)
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = list(csv.DictReader(DATASET.open(encoding="utf-8")))
    dates = sorted({row["timestamp"][:10] for row in rows})
    train_end = dates[int(len(dates) * 0.70) - 1]
    validation_end = dates[int(len(dates) * 0.85) - 1]
    x = np.asarray([scenario_feature_vector(port=row["port"], direction=row["direction"], timestamp=datetime.fromisoformat(row["timestamp"]), weather=row["weather"], is_holiday=row["is_holiday"] == "true", event_impact=row["event_impact"]) for row in rows])
    y = np.asarray([float(row["wait_minutes"]) for row in rows])
    train_mask = np.asarray([row["timestamp"][:10] <= train_end for row in rows])
    validation_mask = np.asarray([train_end < row["timestamp"][:10] <= validation_end for row in rows])
    test_mask = ~(train_mask | validation_mask)
    model = HistGradientBoostingRegressor(max_iter=260, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=20, l2_regularization=1.0, random_state=2612).fit(x[train_mask], y[train_mask])
    metrics = {}
    for name, mask in (("validation", validation_mask), ("test", test_mask)):
        predicted = model.predict(x[mask])
        metrics[name] = {"sample_count": int(mask.sum()), "mae": round(float(mean_absolute_error(y[mask], predicted)), 4), "rmse": round(float(mean_squared_error(y[mask], predicted) ** 0.5), 4)}
    train_rows = [row for row, include in zip(rows, train_mask) if include]
    train_values = y[train_mask]
    baseline_groups: dict[tuple[str, str, int], list[float]] = {}
    for row, value in zip(train_rows, train_values):
        key = (row["port"], row["direction"], datetime.fromisoformat(row["timestamp"]).hour)
        baseline_groups.setdefault(key, []).append(float(value))
    baseline_means = {key: float(np.mean(values)) for key, values in baseline_groups.items()}
    test_rows = [row for row, include in zip(rows, test_mask) if include]
    baseline_prediction = np.asarray([baseline_means[(row["port"], row["direction"], datetime.fromisoformat(row["timestamp"]).hour)] for row in test_rows])
    metrics["calendar_baseline_test"] = {"sample_count": int(test_mask.sum()), "mae": round(float(mean_absolute_error(y[test_mask], baseline_prediction)), 4), "rmse": round(float(mean_squared_error(y[test_mask], baseline_prediction) ** 0.5), 4)}
    test_prediction = model.predict(x[test_mask])
    metrics["test_slices"] = {}
    for field, values in (("weather", ("clear", "rain", "heavy_rain", "thunderstorm")), ("event_impact", ("none", "low", "medium", "high"))):
        for value in values:
            mask = np.asarray([row[field] == value for row in test_rows])
            metrics["test_slices"][f"{field}:{value}"] = {"sample_count": int(mask.sum()), "mae": round(float(mean_absolute_error(y[test_mask][mask], test_prediction[mask])), 4)}
    validation_prediction = model.predict(x[validation_mask])
    validation_rows = [row for row, include in zip(rows, validation_mask) if include]
    residuals = {port: round(float(np.quantile([abs(actual - predicted) for row, actual, predicted in zip(validation_rows, y[validation_mask], validation_prediction) if row["port"] == port], 0.9)), 4) for port in PORTS}
    digest = hashlib.sha256(DATASET.read_bytes()).hexdigest()
    metadata = {
        "schema_version": 1, "model_version": MODEL_VERSION,
        "generated_at": datetime.now(ZoneInfo("Asia/Hong_Kong")).replace(microsecond=0).isoformat(),
        "evaluation_scope": "synthetic_scenario_classroom_demo", "synthetic_only": True,
        "dataset": {"path": str(DATASET.relative_to(ROOT)), "sha256": digest, "sample_count": len(rows), "start": dates[0], "end": dates[-1]},
        "split": {"train_end": train_end, "validation_end": validation_end, "test_end": dates[-1]},
        "features": list(FEATURE_NAMES), "metrics": metrics, "residual_q90_by_port": residuals,
        "limitations": ["仅使用可解释合成场景标签。", "指标用于课堂演示，不代表真实口岸准确率。"]
    }
    artifact = {"schema_version": 1, "model_version": MODEL_VERSION, "feature_names": list(FEATURE_NAMES), "dataset_sha256": digest, "estimator": model, "residual_q90_by_port": residuals}
    args.artifact.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, args.artifact)
    args.metadata.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"artifact={args.artifact}\nmetadata={args.metadata}\ntest_mae={metrics['test']['mae']}")


if __name__ == "__main__":
    main()
