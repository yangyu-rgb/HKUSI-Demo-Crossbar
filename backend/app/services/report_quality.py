from datetime import datetime, timedelta
from math import floor

from ..clock import as_hong_kong
from ..config import (
    REPORT_EXPIRY_MINUTES,
    REPORT_MIN_PREDICTION_SCORE,
    REPORT_QUALITY_HIGH_THRESHOLD,
    REPORT_QUALITY_MEDIUM_THRESHOLD,
)


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
    score = round(
        100
        * (
            freshness * 0.50
            + _wait_consistency(
                report["actual_wait_time"],
                port["current_wait"],
            )
            * 0.35
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
        if not key.startswith("_")
    }


def quality_weighted_wait(reports: list[dict]) -> float:
    """按反馈质量分计算等待时间加权平均值。"""
    total_weight = sum(report["quality_score"] for report in reports)
    return sum(
        report["actual_wait_time"] * report["quality_score"]
        for report in reports
    ) / total_weight
