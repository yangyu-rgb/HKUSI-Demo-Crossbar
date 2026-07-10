from datetime import datetime
from pathlib import Path
import hashlib
import json

import joblib
import numpy as np
from sklearn.dummy import DummyRegressor

from app.ml.data import EXPECTED_PORTS
from app.ml.features import FEATURE_NAMES
from app.ml.shadow import ShadowWaitModel
from app.schemas.batch import BatchRequest
from app.schemas.prediction import PredictionRequest
from app.services import BatchService, PredictionService


def _write_valid_model(tmp_path: Path) -> tuple[Path, Path, Path]:
    metadata_path = tmp_path / "metadata.json"
    artifact_path = tmp_path / "model.joblib"
    dataset_path = tmp_path / "history.csv"
    dataset_path.write_text("synthetic test dataset\n", encoding="utf-8")
    dataset_hash = hashlib.sha256(dataset_path.read_bytes()).hexdigest()
    metadata = {
        "schema_version": 1,
        "model_version": "synthetic-hgb-wait-v1",
        "features": list(FEATURE_NAMES),
        "synthetic_only": True,
        "evaluation_scope": "synthetic_engineering_reference",
        "promotion": {"status": "eligible"},
        "dataset": {"sha256": dataset_hash},
    }
    estimator = DummyRegressor(strategy="constant", constant=17.5)
    estimator.fit(np.zeros((2, len(FEATURE_NAMES))), np.asarray([17.5, 17.5]))
    artifact = {
        "schema_version": 1,
        "model_version": "synthetic-hgb-wait-v1",
        "feature_names": list(FEATURE_NAMES),
        "estimator": estimator,
        "residual_q90_by_port": {port: 1.0 for port in EXPECTED_PORTS},
        "metadata": {
            "dataset_sha256": dataset_hash,
            "promotion_status": "eligible",
            "synthetic_only": True,
        },
    }
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False), encoding="utf-8"
    )
    joblib.dump(artifact, artifact_path)
    return artifact_path, metadata_path, dataset_path


def _request() -> PredictionRequest:
    return PredictionRequest(
        origin_id="hku",
        destination_id="nanshan-tech",
        target_time="2026-07-10T09:30:00+08:00",
        preferences={"priority": "balanced", "max_budget": 100},
    )


def test_shadow_model_loads_validated_artifact(tmp_path: Path) -> None:
    artifact_path, metadata_path, dataset_path = _write_valid_model(tmp_path)

    model = ShadowWaitModel.load_optional(artifact_path, metadata_path, dataset_path)

    assert model.status.available is True
    assert model.status.model_version == "synthetic-hgb-wait-v1"
    assert model.predict(
        port="罗湖",
        timestamp=datetime.fromisoformat("2026-07-10T09:30:00+08:00"),
        weather="rain",
        is_holiday=False,
    ) == 17.5


def test_shadow_model_rejects_incompatible_metadata(tmp_path: Path) -> None:
    artifact_path, metadata_path, dataset_path = _write_valid_model(tmp_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["features"] = ["unexpected_feature"]
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    model = ShadowWaitModel.load_optional(artifact_path, metadata_path, dataset_path)

    assert model.status.available is False
    assert model.status.reason == "metadata_feature_mismatch"


def test_shadow_model_rejects_changed_training_data(tmp_path: Path) -> None:
    artifact_path, metadata_path, dataset_path = _write_valid_model(tmp_path)
    dataset_path.write_text("changed dataset\n", encoding="utf-8")

    model = ShadowWaitModel.load_optional(artifact_path, metadata_path, dataset_path)

    assert model.status.available is False
    assert model.status.reason == "dataset_mismatch"


def test_shadow_mode_records_differences_without_changing_results(
    repository,
    clock,
    tmp_path: Path,
) -> None:
    artifact_path, metadata_path, dataset_path = _write_valid_model(tmp_path)
    shadow_model = ShadowWaitModel.load_optional(
        artifact_path,
        metadata_path,
        dataset_path,
    )
    baseline = PredictionService(repository, clock).predict(_request())

    result = PredictionService(
        repository,
        clock,
        shadow_model=shadow_model,
    ).predict(_request())

    assert result == baseline
    observations = repository.list_shadow_observations()
    assert len(observations) == 4
    assert {item["port_id"] for item in observations} == {
        "luohu",
        "futian",
        "huanggang",
        "shenzhen-bay",
    }
    assert all(item["status"] == "available" for item in observations)
    assert all(item["model_version"] == "synthetic-hgb-wait-v1" for item in observations)
    assert all(item["shadow_wait_minutes"] == 17.5 for item in observations)
    assert all(item["difference_minutes"] is not None for item in observations)
    repository.reset_dynamic_data()
    assert repository.list_shadow_observations() == []


def test_missing_shadow_artifact_falls_back_without_changing_results(
    repository,
    clock,
    tmp_path: Path,
) -> None:
    missing_model = ShadowWaitModel.load_optional(
        tmp_path / "missing.joblib",
        tmp_path / "missing-metadata.json",
        tmp_path / "missing-history.csv",
    )
    baseline = PredictionService(repository, clock).predict(_request())

    result = PredictionService(
        repository,
        clock,
        shadow_model=missing_model,
    ).predict(_request())

    assert result == baseline
    observations = repository.list_shadow_observations()
    assert len(observations) == 4
    assert all(item["status"] == "unavailable" for item in observations)
    assert all(item["reason"] == "artifact_missing" for item in observations)
    assert all(item["shadow_wait_minutes"] is None for item in observations)


def test_batch_predictions_share_the_shadow_model(
    repository,
    clock,
    tmp_path: Path,
) -> None:
    artifact_path, metadata_path, dataset_path = _write_valid_model(tmp_path)
    shadow_model = ShadowWaitModel.load_optional(
        artifact_path,
        metadata_path,
        dataset_path,
    )
    request = BatchRequest.model_validate(
        {
            "company": "影子模式测试企业",
            "date": "2026-07-10",
            "employees": [
                {
                    "id": "E-1",
                    "origin_id": "hku",
                    "destination_id": "nanshan-tech",
                    "arrival_deadline": "09:30",
                }
            ],
        }
    )

    BatchService(repository, clock, shadow_model=shadow_model).create_plan(request)

    observations = repository.list_shadow_observations()
    assert len(observations) == 4
    assert all(item["status"] == "available" for item in observations)
