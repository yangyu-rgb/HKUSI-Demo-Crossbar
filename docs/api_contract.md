# CrossBorder AI API 契约

基础地址：`http://127.0.0.1:8000`

后端使用香港实时时钟和本地模拟数据。机器可读契约位于 [`openapi.json`](openapi.json)；TypeScript 类型由该文件生成到 `frontend/src/generated/api.d.ts`。

## 错误结构

领域错误、参数验证错误、资源不存在、持久化错误和未预期错误都使用相同结构。请求 ID 也会通过 `X-Request-ID` 响应头返回。

```json
{
  "error": {
    "code": "TARGET_TIME_OUT_OF_RANGE",
    "message": "目标时间超出允许范围",
    "details": {
      "min_target_time": "2026-07-10T10:15:00+08:00",
      "max_target_time": "2026-07-11T10:00:00+08:00"
    },
    "request_id": "a1b2c3"
  }
}
```

主要错误代码包括 `VALIDATION_ERROR`、`LOCATION_NOT_FOUND`、`TARGET_TIME_OUT_OF_RANGE`、`SUBSCRIPTION_NOT_FOUND`、`DATABASE_ERROR` 和 `INTERNAL_ERROR`。

## Demo 控制

- `GET /api/health`：返回服务状态和 Demo 模式。
- `GET /api/demo/context`：返回 `Asia/Hong_Kong` 当前时间、建议目标时间、有效预测范围和轮询间隔。
- `POST /api/demo/reset`：清空 SQLite 动态数据，并按当前香港时间重新生成反馈和订阅种子。

## 实时状态与地点

- `GET /api/realtime`：返回香港计算时间、提示信息和四口岸模拟状态。每个口岸包含动态等待时间、人流等级、开放状态、预测点和有效众包样本数。
- `GET /api/locations`：返回确定性交通矩阵支持的出发地和目的地 ID。

页面处于活动状态时，前端每 60 秒重新请求实时数据，同时支持手动刷新。

## 路线预测

`POST /api/predict` 针对一个受支持的地点组合比较四个口岸。

```json
{
  "origin_id": "hku",
  "destination_id": "nanshan-tech",
  "target_time": "2026-07-10T12:00:00+08:00",
  "preferences": {
    "priority": "balanced",
    "max_budget": 100
  }
}
```

`priority` 可使用 `balanced`、`fastest` 或 `cheapest`。将 `max_budget` 设置为 `null` 表示不限制预算。`target_time` 必须处于 `/api/demo/context` 返回的范围内；无时区输入按香港时间解释，带时区输入转换到香港时区。

每个口岸结果包括：

- 全程时间、费用、预计到达、最晚出发和安全缓冲。
- 口岸等待预测和动态 90% 置信区间。
- 迟到概率、风险等级、准时状态和预算状态。
- 路线步骤、异常信息、众包数量、历史样本数量和不确定性。
- 可解释因素，包括时间匹配历史基线、样本数量、可用众包值及其衰减后的实际权重。

Demo 模型为每个目标时间筛选相同工作日或周末、目标小时前后 1 小时和模拟天气的历史记录。精确小时权重为 `1.0`，相邻小时为 `0.5`，历史新近度使用 28 天半衰期。有效众包等待按质量分加权，最大修正权重为 15%，并随反馈新鲜度和预测跨度衰减。加权历史标准差和局部趋势决定区间宽度，正态分布用于把剩余通关时间换算为迟到概率。

推荐顺序：

1. 先保留同时满足准时和预算条件的路线。
2. 在候选路线中应用最快、最便宜或命名的均衡权重。
3. 如果预算内路线都会迟到，返回迟到最少的路线。
4. 如果所有路线都超出预算，返回费用最低的路线并附带提示。

## 众包反馈

- `GET /api/crowdsource/feed?limit=8`：返回最新的未过期反馈，`limit` 范围为 `1–30`，`total` 表示未过期反馈总数。
- `POST /api/crowdsource/report`：将反馈写入 SQLite，并根据质量等级奖励 10、6 或 2 个 Demo 积分。

反馈有效期为 90 分钟。服务根据新鲜度、等待偏差和人流一致性动态计算 `quality_score` 与 `quality_level`；`expires_at` 和 `used_for_prediction` 用于解释有效期及是否参与预测。过期记录继续保存在 SQLite，但不会出现在动态列表、实时数量或预测计算中。

同一用户在同一口岸 10 分钟内重复提交时，接口返回 HTTP `409` 和错误代码 `DUPLICATE_REPORT`，`details.retry_after_minutes` 表示剩余等待时间。不同口岸的反馈互不影响。

## 提醒订阅

- `GET /api/subscriptions?user_id=demo-user`
- `POST /api/subscriptions`
- `PATCH /api/subscriptions/{subscription_id}`
- `DELETE /api/subscriptions/{subscription_id}`

订阅使用稳定的 `origin_id` 和 `destination_id`，并持久化到 SQLite。`POST /api/subscription` 仅作为已弃用的兼容路径保留。

## 企业方案

- `POST /api/batch`：验证最多 100 名可编辑员工，按香港当前预测窗口生成方案，并把请求和结果保存到 SQLite。
- `GET /api/batch/plans?company=...&limit=10`：返回近期保存的方案，前端可载入输入并重新生成。

## Demo 边界

- 仅香港时间来自宿主系统实时时钟；不接入真实口岸、地图、交通、天气、通知或外部 AI 服务。
- SVG 路线仅为示意，不代表真实地理比例。
- SQLite 仅提供本地 Demo 持久化，不代表生产环境并发能力或部署可靠性。
- 所有输出均为辅助决策示例，不是实际口岸运营指引。
