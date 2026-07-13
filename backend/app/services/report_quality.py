from datetime import datetime, timedelta
from math import floor
from statistics import median

from ..clock import as_hong_kong
from ..config import (
    REPORT_EXPIRY_MINUTES,
    REPORT_MIN_PREDICTION_SCORE,
    REPORT_QUALITY_HIGH_THRESHOLD,
    REPORT_QUALITY_MEDIUM_THRESHOLD,
)
from ..calibration import CALIBRATION_POLICY


CROWD_LEVEL_ORDER = {"low": 0, "medium": 1, "high": 2}


def _wait_consistency(actual_wait: int, current_wait: int) -> float:
    difference = abs(actual_wait - current_wait)
    if difference <= 5:
        return 1.0
    if difference <= 15:
        return 0.75
    if difference <= 30:
        return 0.4
    return 0.0


def _expected_crowd_level(actual_wait: int) -> str:
    if actual_wait < 18:
        return "low"
    if actual_wait < 35:
        return "medium"
    return "high"


def _crowd_consistency(actual_wait: int, reported_level: str) -> float:
    expected = _expected_crowd_level(actual_wait)
    distance = abs(CROWD_LEVEL_ORDER[expected] - CROWD_LEVEL_ORDER[reported_level])
    if distance == 0:
        return 1.0
    if distance == 1:
        return 0.5
    return 0.0


def evaluate_report(report: dict, port: dict, current_time: datetime) -> dict:
    """根据香港当前时间计算反馈的新鲜度、质量分和预测可用性。"""
    effective_at = as_hong_kong(datetime.fromisoformat(report["timestamp"]))
    now = as_hong_kong(current_time)
    age_minutes = max(
        0.0,
        (now - effective_at).total_seconds() / 60,
    )
    expires_at = effective_at + timedelta(minutes=REPORT_EXPIRY_MINUTES)
    freshness = max(0.0, 1 - age_minutes / REPORT_EXPIRY_MINUTES)
    wait_evidence = _wait_consistency(
        report["actual_wait_time"],
        port["current_wait"],
    )
    score = round(
        100
        * (
            freshness * 0.50
            + wait_evidence * 0.35
            + _crowd_consistency(
                report["actual_wait_time"],
                report["crowd_level"],
            )
            * 0.15
        )
    )
    score = min(100, max(0, score))
    if score >= REPORT_QUALITY_HIGH_THRESHOLD:
        quality_level = "high"
    elif score >= REPORT_QUALITY_MEDIUM_THRESHOLD:
        quality_level = "medium"
    else:
        quality_level = "low"
    active = now < expires_at
    if age_minutes < 1:
        time_label = "刚刚"
    else:
        time_label = f"{floor(age_minutes)}分钟前"
    return {
        **report,
        "time_label": time_label,
        "quality_score": score,
        "quality_level": quality_level,
        "expires_at": expires_at,
        "used_for_prediction": active and score >= REPORT_MIN_PREDICTION_SCORE,
        "_active": active,
        "_age_minutes": age_minutes,
    }


def evaluate_reports(
    reports: list[dict],
    ports: list[dict],
    current_time: datetime,
) -> list[dict]:
    """批量计算反馈质量；无法匹配当前口岸的数据不进入结果。"""
    ports_by_name = {port["name"]: port for port in ports}
    return [
        evaluate_report(report, ports_by_name[report["port"]], current_time)
        for report in reports
        if report["port"] in ports_by_name
    ]


def public_report(report: dict) -> dict:
    """移除仅供服务内部判断使用的计算字段。"""
    return {
        key: value
        for key, value in report.items()
        if not key.startswith("_") and key not in {
            "is_real_observation",
            "training_consent",
            "wait_started_at",
            "wait_ended_at",
            "eligible_for_v2_label",
        }
    }


def quality_weighted_wait(reports: list[dict]) -> float:
    """按反馈质量分计算等待时间加权平均值。"""
    total_weight = sum(report["quality_score"] for report in reports)
    return sum(
        report["actual_wait_time"] * report["quality_score"]
        for report in reports
    ) / total_weight


def crowdsource_consensus(reports: list[dict]) -> dict:
    """Build a robust, reporter-deduplicated calibration summary."""
    latest_by_reporter: dict[str, dict] = {}
    for report in sorted(reports, key=lambda item: item["timestamp"]):
        latest_by_reporter[report["user_id"]] = report
    selected = list(latest_by_reporter.values())
    if not selected:
        return {
            "reports": [],
            "value_minutes": None,
            "distinct_reporters": 0,
            "average_quality_score": 0.0,
            "average_freshness": 0.0,
            "dispersion_minutes": None,
            "consensus_level": "none",
            "consensus_factor": 0.0,
            "weight_cap": 0.0,
            "reason": "没有有效反馈",
        }

    weighted = sorted(
        (
            float(report["actual_wait_time"]),
            max(0.01, report["quality_score"] / 100)
            * max(0.01, 1 - report["_age_minutes"] / REPORT_EXPIRY_MINUTES),
        )
        for report in selected
    )
    half_weight = sum(weight for _value, weight in weighted) / 2
    cumulative = 0.0
    robust_wait = weighted[-1][0]
    for value, weight in weighted:
        cumulative += weight
        if cumulative >= half_weight:
            robust_wait = value
            break

    waits = [float(report["actual_wait_time"]) for report in selected]
    centre = median(waits)
    dispersion = median(abs(value - centre) for value in waits)
    average_quality = sum(report["quality_score"] for report in selected) / len(selected)
    average_freshness = sum(
        max(0.0, 1 - report["_age_minutes"] / REPORT_EXPIRY_MINUTES)
        for report in selected
    ) / len(selected)

    policy = CALIBRATION_POLICY
    high_consensus = (
        len(selected) >= policy.crowdsource_consensus_min_reporters
        and average_quality >= policy.crowdsource_consensus_min_quality
        and dispersion <= policy.crowdsource_consensus_max_dispersion_minutes
    )
    if high_consensus:
        level, factor, cap = "high", 1.0, policy.crowdsource_consensus_cap
        reason = "多人高质量反馈一致，启用45%动态上限"
    elif dispersion <= 8:
        level, factor = "medium", 0.75
        cap = (
            policy.crowdsource_single_cap
            if len(selected) == 1
            else policy.crowdsource_pair_cap
        )
        reason = "反馈基本一致，按人数使用保守上限"
    else:
        level, factor = "low", 0.4
        cap = (
            policy.crowdsource_single_cap
            if len(selected) == 1
            else policy.crowdsource_pair_cap
        )
        reason = "反馈分歧较大，降低众包影响"

    return {
        "reports": selected,
        "value_minutes": robust_wait,
        "distinct_reporters": len(selected),
        "average_quality_score": average_quality,
        "average_freshness": average_freshness,
        "dispersion_minutes": dispersion,
        "consensus_level": level,
        "consensus_factor": factor,
        "weight_cap": cap,
        "reason": reason,
    }
