from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from pathlib import Path
from typing import Any
import json
import warnings

from ..config import (
    AI_V1_ARTIFACT_PATH,
    AI_V1_DATASET_PATH,
    AI_V1_METADATA_PATH,
    AI_V1_MODEL_VERSION,
    AI_V1_SCHEMA_VERSION,
)
from .data import EXPECTED_PORTS, dataset_sha256
from .features import FEATURE_NAMES, feature_vector


@dataclass(frozen=True)
class ShadowModelStatus:
    available: bool
    reason: str | None
    model_version: str | None


class ShadowWaitModel:
    """Optional AI v1 predictor that must never replace the demo forecast."""

    def __init__(
        self,
        *,
        estimator: Any | None,
        status: ShadowModelStatus,
    ):
        self._estimator = estimator
        self._status = status

    @property
    def status(self) -> ShadowModelStatus:
        return self._status

    @classmethod
    def unavailable(cls, reason: str) -> "ShadowWaitModel":
        return cls(
            estimator=None,
            status=ShadowModelStatus(
                available=False,
                reason=reason,
                model_version=None,
            ),
        )

    @classmethod
    def load_optional(
        cls,
        artifact_path: Path = AI_V1_ARTIFACT_PATH,
        metadata_path: Path = AI_V1_METADATA_PATH,
        dataset_path: Path = AI_V1_DATASET_PATH,
    ) -> "ShadowWaitModel":
        if not artifact_path.is_file():
            return cls.unavailable("artifact_missing")
        if not metadata_path.is_file():
            return cls.unavailable("metadata_missing")

        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls.unavailable("metadata_unreadable")

        metadata_error = cls._validate_metadata(metadata)
        if metadata_error:
            return cls.unavailable(metadata_error)
        try:
            current_dataset_hash = dataset_sha256(dataset_path)
        except OSError:
            return cls.unavailable("dataset_unreadable")
        if current_dataset_hash != metadata["dataset"]["sha256"]:
            return cls.unavailable("dataset_mismatch")

        try:
            import joblib

            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message="Setting the shape on a NumPy array has been deprecated.*",
                    category=DeprecationWarning,
                )
                artifact = joblib.load(artifact_path)
        except ImportError:
            return cls.unavailable("ml_dependencies_unavailable")
        except Exception:
            return cls.unavailable("artifact_unreadable")

        artifact_error = cls._validate_artifact(artifact, metadata)
        if artifact_error:
            return cls.unavailable(artifact_error)
        return cls(
            estimator=artifact["estimator"],
            status=ShadowModelStatus(
                available=True,
                reason=None,
                model_version=metadata["model_version"],
            ),
        )

    @staticmethod
    def _validate_metadata(metadata: Any) -> str | None:
        if not isinstance(metadata, dict):
            return "metadata_invalid"
        if metadata.get("schema_version") != AI_V1_SCHEMA_VERSION:
            return "metadata_schema_mismatch"
        if metadata.get("model_version") != AI_V1_MODEL_VERSION:
            return "metadata_version_mismatch"
        if metadata.get("features") != list(FEATURE_NAMES):
            return "metadata_feature_mismatch"
        if metadata.get("synthetic_only") is not True:
            return "metadata_scope_mismatch"
        if metadata.get("evaluation_scope") != "synthetic_engineering_reference":
            return "metadata_scope_mismatch"
        if metadata.get("promotion", {}).get("status") != "eligible":
            return "metadata_not_eligible"
        dataset_hash = metadata.get("dataset", {}).get("sha256")
        if not isinstance(dataset_hash, str) or not dataset_hash:
            return "metadata_dataset_missing"
        return None

    @staticmethod
    def _validate_artifact(artifact: Any, metadata: dict) -> str | None:
        if not isinstance(artifact, dict):
            return "artifact_invalid"
        if artifact.get("schema_version") != AI_V1_SCHEMA_VERSION:
            return "artifact_schema_mismatch"
        if artifact.get("model_version") != metadata["model_version"]:
            return "artifact_version_mismatch"
        if artifact.get("feature_names") != list(FEATURE_NAMES):
            return "artifact_feature_mismatch"
        artifact_metadata = artifact.get("metadata")
        if not isinstance(artifact_metadata, dict):
            return "artifact_metadata_missing"
        if artifact_metadata.get("dataset_sha256") != metadata["dataset"]["sha256"]:
            return "artifact_dataset_mismatch"
        if artifact_metadata.get("promotion_status") != "eligible":
            return "artifact_not_eligible"
        if artifact_metadata.get("synthetic_only") is not True:
            return "artifact_scope_mismatch"
        residuals = artifact.get("residual_q90_by_port")
        if not isinstance(residuals, dict) or set(residuals) != set(EXPECTED_PORTS):
            return "artifact_residuals_invalid"
        if any(
            not isinstance(value, (float, int)) or value <= 0
            for value in residuals.values()
        ):
            return "artifact_residuals_invalid"
        estimator = artifact.get("estimator")
        if not callable(getattr(estimator, "predict", None)):
            return "artifact_estimator_invalid"
        feature_count = getattr(estimator, "n_features_in_", len(FEATURE_NAMES))
        if feature_count != len(FEATURE_NAMES):
            return "artifact_feature_count_mismatch"
        return None

    def predict(
        self,
        *,
        port: str,
        timestamp: datetime,
        weather: str,
        is_holiday: bool,
    ) -> float | None:
        if not self._status.available or self._estimator is None:
            return None
        try:
            prediction = float(
                self._estimator.predict(
                    [
                        feature_vector(
                            port=port,
                            timestamp=timestamp,
                            weather=weather,
                            is_holiday=is_holiday,
                        )
                    ]
                )[0]
            )
            if not isfinite(prediction):
                raise ValueError("模型返回非有限值")
            return max(1.0, prediction)
        except Exception:
            self._estimator = None
            self._status = ShadowModelStatus(
                available=False,
                reason="prediction_failed",
                model_version=None,
            )
            return None
