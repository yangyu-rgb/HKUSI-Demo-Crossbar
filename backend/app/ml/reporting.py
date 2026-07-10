from typing import Any


def _metric_row(name: str, metrics: dict[str, Any]) -> str:
    validation = metrics["validation"]["overall"]
    test = metrics["test"]["overall"]
    return (
        f"| {name} | {validation['mae']:.4f} | {validation['rmse']:.4f} | "
        f"{test['mae']:.4f} | {test['rmse']:.4f} |"
    )


def build_markdown_report(metadata: dict[str, Any]) -> str:
    metrics = metadata["metrics"]
    candidate = metrics["hist_gradient_boosting"]
    lines = [
        "# AI 等待时间预测模型 v1 离线评估",
        "",
        "> 本报告只使用合成数据验证训练与评估流水线，不代表真实口岸预测效果。",
        "",
        "## 实验摘要",
        "",
        f"- 模型版本：`{metadata['model_version']}`",
        f"- 生成时间：`{metadata['generated_at']}`",
        f"- 数据哈希：`{metadata['dataset']['sha256']}`",
        f"- 样本数：{metadata['dataset']['sample_count']}",
        f"- 时间范围：{metadata['dataset']['start']} 至 {metadata['dataset']['end']}",
        f"- 晋级状态：`{metadata['promotion']['status']}`",
        "",
        "## 时间切分",
        "",
        "| 分组 | 日期范围 | 样本数 |",
        "| --- | --- | ---: |",
        f"| 训练 | {metadata['split']['train']['start']} 至 {metadata['split']['train']['end']} | {metadata['split']['train']['sample_count']} |",
        f"| 验证 | {metadata['split']['validation']['start']} 至 {metadata['split']['validation']['end']} | {metadata['split']['validation']['sample_count']} |",
        f"| 测试 | {metadata['split']['test']['start']} 至 {metadata['split']['test']['end']} | {metadata['split']['test']['sample_count']} |",
        "",
        "所有口岸共享相同时间边界，数据未随机打乱。验证集用于选择参数，测试集只用于最终离线评估。",
        "",
        "## 特征与泄漏控制",
        "",
        f"使用特征：{', '.join(f'`{item}`' for item in metadata['features'])}。",
        "",
        "`crowd_level` 由目标等待时间生成，未进入模型。众包修正、路线选择、预算和迟到概率仍属于现有业务层。",
        "",
        "## 模型配置",
        "",
        f"选定参数：`{metadata['selected_parameters']}`",
        "",
        "候选模型使用固定随机种子；对照模型为训练时间段拟合的日历均值和 Ridge 回归。",
        "",
        "## 整体结果",
        "",
        "| 模型 | 验证 MAE | 验证 RMSE | 测试 MAE | 测试 RMSE |",
        "| --- | ---: | ---: | ---: | ---: |",
        _metric_row("Calendar mean", metrics["calendar_mean"]),
        _metric_row("Ridge", metrics["ridge"]),
        _metric_row("HistGradientBoosting", candidate),
        "",
        "## 分口岸测试结果",
        "",
        "| 口岸 | MAE | RMSE | 90% 区间覆盖率 | 平均区间宽度 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for port, values in candidate["test"]["by_port"].items():
        interval = candidate["intervals"]["by_port"][port]
        lines.append(
            f"| {port} | {values['mae']:.4f} | {values['rmse']:.4f} | "
            f"{interval['coverage']:.2%} | {interval['mean_width']:.4f} |"
        )
    lines.extend(
        [
            "",
            "## 测试切片",
            "",
            "| 切片 | 样本数 | MAE | RMSE |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for name, values in candidate["test"]["slices"].items():
        lines.append(
            f"| {name} | {values['sample_count']} | {values['mae']:.4f} | {values['rmse']:.4f} |"
        )
    lines.extend(
        [
            "",
            "## Permutation importance",
            "",
            "| 特征 | 平均重要性 | 标准差 |",
            "| --- | ---: | ---: |",
        ]
    )
    for item in metadata["permutation_importance"]:
        lines.append(
            f"| `{item['feature']}` | {item['mean']:.6f} | {item['standard_deviation']:.6f} |"
        )
    promotion = metadata["promotion"]
    lines.extend(
        [
            "",
            "## 晋级门槛",
            "",
            f"- 相对最佳基线的整体 MAE 改善：{promotion['overall_mae_improvement']:.2%}，要求至少 5%。",
            f"- 分口岸相对最佳基线 MAE 差值：`{promotion['port_mae_delta_vs_best_baseline']}`，单口岸最多允许退化 1 分钟。",
            f"- 90% 区间覆盖率：{promotion['interval_coverage']:.2%}，要求至少 85%。",
            f"- 结果：`{promotion['status']}`。未通过时不得替换现有运行时预测。",
            "",
            "## 限制与后续",
            "",
            "- 数据由确定性公式生成，模型可能只是在学习生成规则。",
            "- 天气、节假日和口岸分布不代表真实世界频率。",
            "- FastAPI 仅在影子模式加载通过校验的模型，并记录其与统计模型的差异；不会改变当前产品行为或用户结果。",
            "- 重复事件当前只作用于统计预测器；AI v1 没有对应事件特征，因此影子差异会包含该运行时调整。",
            "- 获得真实数据后必须重新定义时间范围，并重新划分训练、验证和测试集。",
            "- 合成数据指标不得进入正式效果声明或商业材料。",
            "",
        ]
    )
    return "\n".join(lines)
