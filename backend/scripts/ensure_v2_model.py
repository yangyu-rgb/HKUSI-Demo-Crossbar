"""Ensure the ignored classroom AI v2 artifact exists and matches tracked data."""

from pathlib import Path
import subprocess
import sys


BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from app.ml.scenario_model import ScenarioWaitModel  # noqa: E402


def main() -> None:
    current = ScenarioWaitModel.load_optional()
    if current.status.available:
        print(f"AI v2 ready: {current.status.model_version}")
        return
    runtime = ROOT / "data/runtime/models"
    runtime.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        sys.executable,
        str(BACKEND / "scripts/train_v2_scenario_model.py"),
        "--artifact", str(runtime / "wait_model_v2.joblib"),
        "--metadata", str(runtime / "wait_model_v2.generated.metadata.json"),
    ], check=True)
    rebuilt = ScenarioWaitModel.load_optional()
    if not rebuilt.status.available:
        raise SystemExit(f"AI v2 artifact validation failed: {rebuilt.status.reason}")
    print(f"AI v2 rebuilt: {rebuilt.status.model_version}")


if __name__ == "__main__":
    main()
