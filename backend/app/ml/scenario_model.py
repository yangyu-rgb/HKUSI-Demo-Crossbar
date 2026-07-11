from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from pathlib import Path
from typing import Any
import hashlib
import json
import warnings

from ..config import AI_V2_ARTIFACT_PATH, AI_V2_DATASET_PATH, AI_V2_METADATA_PATH, AI_V2_MODEL_VERSION, AI_V2_SCHEMA_VERSION
from .scenario_features import FEATURE_NAMES, PORTS, scenario_feature_vector


@dataclass(frozen=True)
class ScenarioModelStatus:
    available: bool
    reason: str | None
    model_version: str | None


class ScenarioWaitModel:
    def __init__(self, estimator: Any | None, residuals: dict[str, float], status: ScenarioModelStatus):
        self._estimator = estimator
        self._residuals = residuals
        self._status = status

    @property
    def status(self) -> ScenarioModelStatus:
        return self._status

    @classmethod
    def unavailable(cls, reason: str) -> "ScenarioWaitModel":
        return cls(None, {}, ScenarioModelStatus(False, reason, None))

    @classmethod
    def load_optional(cls, artifact_path: Path = AI_V2_ARTIFACT_PATH, metadata_path: Path = AI_V2_METADATA_PATH, dataset_path: Path = AI_V2_DATASET_PATH) -> "ScenarioWaitModel":
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata.get("schema_version") != AI_V2_SCHEMA_VERSION or metadata.get("model_version") != AI_V2_MODEL_VERSION:
                return cls.unavailable("metadata_version_mismatch")
            if (
                metadata.get("features") != list(FEATURE_NAMES)
                or metadata.get("synthetic_only") is not True
                or metadata.get("evaluation_scope") != "synthetic_scenario_classroom_demo"
            ):
                return cls.unavailable("metadata_scope_mismatch")
            digest = hashlib.sha256(dataset_path.read_bytes()).hexdigest()
            if digest != metadata.get("dataset", {}).get("sha256"):
                return cls.unavailable("dataset_mismatch")
            import joblib
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                artifact = joblib.load(artifact_path)
            if artifact.get("model_version") != AI_V2_MODEL_VERSION or artifact.get("feature_names") != list(FEATURE_NAMES) or artifact.get("dataset_sha256") != digest:
                return cls.unavailable("artifact_mismatch")
            residuals = artifact.get("residual_q90_by_port", {})
            if set(residuals) != set(PORTS) or any(not isinstance(value, (int, float)) or value <= 0 for value in residuals.values()):
                return cls.unavailable("residuals_invalid")
            if not callable(getattr(artifact.get("estimator"), "predict", None)):
                return cls.unavailable("estimator_invalid")
            return cls(artifact["estimator"], residuals, ScenarioModelStatus(True, None, AI_V2_MODEL_VERSION))
        except FileNotFoundError:
            return cls.unavailable("artifact_missing")
        except Exception:
            return cls.unavailable("artifact_unreadable")

    def predict(self, **inputs) -> tuple[float, float] | None:
        if not self._status.available or self._estimator is None:
            return None
        try:
            value = float(self._estimator.predict([scenario_feature_vector(**inputs)])[0])
            if not isfinite(value):
                raise ValueError
            return max(1.0, value), self._residuals[inputs["port"]]
        except Exception:
            self._status = ScenarioModelStatus(False, "prediction_failed", None)
            return None
