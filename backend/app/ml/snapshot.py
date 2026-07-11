"""Export auditable prediction-feedback labels for the next model iteration."""

from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from statistics import mean
from typing import Any
import csv
import json

from ..repositories import DemoRepository
from ..clock import as_hong_kong
from .official_alignment import assess_official_alignment


SNAPSHOT_SCHEMA_VERSION = 4
MIN_V2_LABELS = 200
MIN_V2_PORTS = 4
MIN_V2_DATES = 21
MIN_V2_HOUR_SLICES = 8
REQUIRED_PROVIDERS = {"port_status", "weather", "calendar", "events"}
SNAPSHOT_FIELDS = (
    "forecast_run_id",
    "forecast_target_time",
    "observed_at",
    "port_id",
    "port_name",
    "actual_wait_minutes",
    "statistical_wait_minutes",
    "primary_wait_minutes",
    "prediction_engine",
    "scenario_version",
    "shadow_wait_minutes",
    "shadow_status",
    "quality_score",
    "weather",
    "is_holiday",
    "data_version",
    "observed_report_id",
    "direction",
    "channel",
    "source_type",
    "training_consent",
    "wait_started_at",
    "wait_ended_at",
    "official_feature_status",
    "official_feature_version",
    "resident_queue_status_code",
    "resident_queue_level",
    "resident_queue_age_minutes",
    "visitor_queue_status_code",
    "visitor_queue_level",
    "visitor_queue_age_minutes",
    "passenger_total",
    "passenger_hong_kong_resident",
    "passenger_traffic_age_hours",
)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _records_from_rows(rows: list[dict]) -> list[dict]:
    records = []
    for row in rows:
        features = row["features"]
        official = features.get("official_features", {})
        resident_queue = official.get("resident_queue", {})
        visitor_queue = official.get("visitor_queue", {})
        passenger_traffic = official.get("passenger_traffic", {})
        records.append(
            {
                "forecast_run_id": row["forecast_run_id"],
                "forecast_target_time": row["run_target_time"],
                "observed_at": row["observed_at"],
                "port_id": row["port_id"],
                "port_name": row["port_name"],
                "actual_wait_minutes": row["observed_wait_minutes"],
                "statistical_wait_minutes": row["statistical_wait_minutes"],
                "primary_wait_minutes": row.get("primary_wait_minutes"),
                "prediction_engine": row.get("prediction_engine"),
                "scenario_version": row.get("scenario_version"),
                "shadow_wait_minutes": row["shadow_wait_minutes"],
                "shadow_status": row["shadow_status"],
                "quality_score": row["observed_quality_score"],
                "weather": features.get("weather", "unknown"),
                "is_holiday": features.get("is_holiday", False),
                "data_version": row["data_version"],
                "observed_report_id": row["observed_report_id"],
                "direction": row["direction"],
                "channel": row["channel"],
                "source_type": row["source_type"],
                "training_consent": bool(row["training_consent"]),
                "wait_started_at": row["wait_started_at"],
                "wait_ended_at": row["wait_ended_at"],
                "official_feature_status": official.get("status", "missing"),
                "official_feature_version": official.get("feature_version"),
                "resident_queue_status_code": resident_queue.get("status_code"),
                "resident_queue_level": resident_queue.get("level"),
                "resident_queue_age_minutes": resident_queue.get("age_minutes"),
                "visitor_queue_status_code": visitor_queue.get("status_code"),
                "visitor_queue_level": visitor_queue.get("level"),
                "visitor_queue_age_minutes": visitor_queue.get("age_minutes"),
                "passenger_total": passenger_traffic.get("total"),
                "passenger_hong_kong_resident": passenger_traffic.get(
                    "hong_kong_resident"
                ),
                "passenger_traffic_age_hours": passenger_traffic.get("age_hours"),
            }
        )
    return records


def chronological_split(records: list[dict]) -> dict[str, dict[str, Any]]:
    """Split observed labels chronologically without leaking future dates."""
    if not records:
        return {
            name: {"start": None, "end": None, "sample_count": 0, "dates": 0}
            for name in ("train", "validation", "test")
        }
    dates = sorted({_parse_datetime(record["forecast_target_time"]).date() for record in records})
    train_end = max(1, int(len(dates) * 0.70))
    validation_end = max(train_end + 1, int(len(dates) * 0.85))
    validation_end = min(validation_end, len(dates))
    buckets = {
        "train": set(dates[:train_end]),
        "validation": set(dates[train_end:validation_end]),
        "test": set(dates[validation_end:]),
    }
    result: dict[str, dict[str, Any]] = {}
    for name, selected_dates in buckets.items():
        selected = [
            record
            for record in records
            if _parse_datetime(record["forecast_target_time"]).date() in selected_dates
        ]
        result[name] = {
            "start": min(selected_dates).isoformat() if selected_dates else None,
            "end": max(selected_dates).isoformat() if selected_dates else None,
            "sample_count": len(selected),
            "dates": len(selected_dates),
        }
    return result


def assess_v2_readiness(repository: DemoRepository) -> dict:
    rows = repository.list_labeled_forecast_rows()
    records = _records_from_rows(rows)
    external_data = repository.external_data.readiness()
    external_data["alignment"] = assess_official_alignment(repository)
    ports = Counter(record["port_id"] for record in records)
    dates = {
        _parse_datetime(record["forecast_target_time"]).date()
        for record in records
    }
    hour_slices = {
        _parse_datetime(record["forecast_target_time"]).hour
        for record in records
    }
    provider_statuses = repository.get_provider_statuses()
    label_audit = repository.get_training_label_audit()
    source_counts = Counter(record["source_type"] for record in records)
    active_provider_names = {
        item["provider"]
        for item in provider_statuses
        if item["status"] == "available"
    }
    statistical_errors = [
        abs(record["actual_wait_minutes"] - record["statistical_wait_minutes"])
        for record in records
    ]
    shadow_errors = [
        abs(record["actual_wait_minutes"] - record["shadow_wait_minutes"])
        for record in records
        if record["shadow_wait_minutes"] is not None
    ]
    time_split = chronological_split(records)
    populated_splits = sum(
        1 for split in time_split.values() if split["sample_count"] > 0
    )
    checks = [
        {
            "name": "高质量实际等待标签",
            "actual": len(records),
            "required": MIN_V2_LABELS,
            "passed": len(records) >= MIN_V2_LABELS,
        },
        {
            "name": "口岸覆盖",
            "actual": len(ports),
            "required": MIN_V2_PORTS,
            "passed": len(ports) >= MIN_V2_PORTS,
        },
        {
            "name": "独立日期覆盖",
            "actual": len(dates),
            "required": MIN_V2_DATES,
            "passed": len(dates) >= MIN_V2_DATES,
        },
        {
            "name": "小时切片覆盖",
            "actual": len(hour_slices),
            "required": MIN_V2_HOUR_SLICES,
            "passed": len(hour_slices) >= MIN_V2_HOUR_SLICES,
        },
        {
            "name": "关键输入可用",
            "actual": len(active_provider_names & REQUIRED_PROVIDERS),
            "required": len(REQUIRED_PROVIDERS),
            "passed": REQUIRED_PROVIDERS <= active_provider_names,
        },
        {
            "name": "时间切分可用",
            "actual": populated_splits,
            "required": 3,
            "passed": populated_splits == 3,
        },
    ]
    experiment_ready = all(check["passed"] for check in checks)
    coverage_warnings = []
    if not records:
        coverage_warnings.append("尚无符合真实来源、建模同意和质量要求的训练标签。")
    elif ports and max(ports.values()) / len(records) > 0.50:
        dominant_port, dominant_count = ports.most_common(1)[0]
        coverage_warnings.append(
            f"{dominant_port} 占 {dominant_count}/{len(records)} 条标签，口岸分布过于集中。"
        )
    coverage_warnings.append(
        "200 条门槛只验证维度覆盖，不等于完整覆盖四口岸 × 21 日期 × 8 小时的 672 个组合单元。"
    )
    production_reasons = [
        "当前仍是本地 Demo Provider；尚未验证真实口岸、天气和日历数据源。",
        "尚未完成真实运营环境的独立回测、校准比较、漂移监测和人工验收。",
    ]
    return {
        "experiment_ready": experiment_ready,
        "production_promotion_ready": False,
        "label_count": len(records),
        "linked_feedback_count": label_audit["linked_count"],
        "excluded_feedback_count": label_audit["excluded_count"],
        "label_sources": [
            {"source_type": source_type, "label_count": source_counts[source_type]}
            for source_type in sorted(source_counts)
        ],
        "ports": [
            {"port_id": port_id, "label_count": ports[port_id]}
            for port_id in sorted(ports)
        ],
        "distinct_dates": len(dates),
        "hour_slices": len(hour_slices),
        "data_versions": sorted({record["data_version"] for record in records}),
        "statistical_mae_minutes": round(mean(statistical_errors), 2)
        if statistical_errors
        else None,
        "shadow_mae_minutes": round(mean(shadow_errors), 2) if shadow_errors else None,
        "shadow_labeled_count": len(shadow_errors),
        "time_split": time_split,
        "checks": checks,
        "data_sources": provider_statuses,
        "coverage_warnings": coverage_warnings,
        "production_blockers": production_reasons,
        "external_data": external_data,
    }


def export_labeled_snapshot(repository: DemoRepository, output_dir: Path) -> dict:
    """Write a CSV plus metadata sidecar. Empty exports are deliberate and auditable."""
    records = _records_from_rows(repository.list_labeled_forecast_rows())
    records.sort(
        key=lambda item: (
            item["forecast_target_time"],
            item["port_id"],
            item["forecast_run_id"],
        )
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "forecast_feedback_labels.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=SNAPSHOT_FIELDS)
        writer.writeheader()
        writer.writerows(records)
    digest = sha256(csv_path.read_bytes()).hexdigest()
    readiness = assess_v2_readiness(repository)
    timestamps = [record["forecast_target_time"] for record in records]
    metadata = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "generated_at": as_hong_kong(datetime.now(timezone.utc)).isoformat(),
        "csv_file": csv_path.name,
        "sha256": digest,
        "sample_count": len(records),
        "time_range": {
            "start": min(timestamps) if timestamps else None,
            "end": max(timestamps) if timestamps else None,
        },
        "fields": list(SNAPSHOT_FIELDS),
        "time_split": readiness["time_split"],
        "data_sources": readiness["data_sources"],
        "data_versions": readiness["data_versions"],
        "readiness": readiness,
        "limitations": [
            "只导出关联到 forecast_run_id、获得建模同意且来源可追溯的高质量真实反馈。",
            "演示种子、演示录入、低质量反馈和未授权反馈会保留审计关联，但不会写入训练 CSV。",
            "当前数据源均为本地 Demo Provider；该快照不能作为生产模型效果声明。",
            "200 条门槛不代表 672 个口岸—日期—小时组合单元已完整覆盖。",
        ],
    }
    metadata_path = output_dir / "forecast_feedback_labels.metadata.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "csv_path": str(csv_path),
        "metadata_path": str(metadata_path),
        "sample_count": len(records),
        "sha256": digest,
        "readiness": readiness,
    }
