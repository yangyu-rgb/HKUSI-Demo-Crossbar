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

主要错误代码包括 `VALIDATION_ERROR`、`FORBIDDEN`、`LOCATION_NOT_FOUND`、`TARGET_TIME_OUT_OF_RANGE`、`SUBSCRIPTION_NOT_FOUND`、`NOTIFICATION_NOT_FOUND`、`PLAN_NOT_FOUND`、`DATABASE_ERROR` 和 `INTERNAL_ERROR`。

前端每次请求会附带 `X-Demo-Persona-ID`。可选值来自 `GET /api/demo/personas`；未提供时使用本地默认运营身份。该机制仅用于 Demo 角色与组织隔离，不是生产认证。

## Demo 控制

- `GET /api/health`：返回服务状态和 Demo 模式。
- `GET /api/health/live`：进程存活探测。
- `GET /api/health/ready`：检查双向矩阵、本地 Provider、SQLite、Demo 身份、AI v1 产物和本地通知适配器。
- `GET /api/demo/context`：返回 `Asia/Hong_Kong` 当前时间、建议目标时间、有效预测范围和轮询间隔。
- `GET /api/demo/personas`：返回运营、通勤者和企业管理员三种本地身份。
- `GET /api/demo/v1-model`：返回 AI v1 元数据、合成数据指标、时间切分和运行时产物状态。
- `GET /api/demo/v2-model`：返回 AI v2.2 候选排行榜、最终参数、时间切分、数据审计、区间覆盖和运行时产物状态。
- `GET /api/demo/v1-readiness`：返回 V1 完整 Demo 就绪检查；该状态不影响独立的 V2 门槛。
- `GET /api/demo/audit?limit=50`：仅运营身份可读取本地写操作审计。
- `GET /api/demo/model-shadow-summary`：返回 AI v1 影子观测总量、可用/降级次数与各口岸的平均差异，仅用于本地审阅。
- `POST /api/demo/reset`：清空 SQLite 动态数据，并按当前香港时间重新生成反馈和订阅种子。

## 实时状态与地点

- `GET /api/realtime`：返回香港计算时间、提示信息和四口岸模拟状态。每个口岸包含动态等待时间、人流等级、开放状态、趋势、一小时变化、三小时峰值、有效众包样本数，以及四个带绝对香港时间、90% 区间和相对变化的预测点。顶层 `overview` 汇总最畅通、压力最高、上升最快口岸、异常数和反馈数；`data_sources` 标明本地 Provider 的来源、读取时间、状态、版本和是否降级。
- `GET /api/locations`：返回香港与深圳地点、两个方向及确定性交通矩阵支持的出发地和目的地 ID。

页面处于活动状态时，前端每 60 秒重新请求实时数据，同时支持手动刷新。

## 路线预测

`POST /api/predict` 针对一个受支持的跨境地点组合比较四个口岸。请求可显式提供 `direction`；服务端同时根据地点校验方向，拒绝同城或方向不匹配组合。

```json
{
  "origin_id": "hku",
  "destination_id": "nanshan-tech",
  "direction": "hong_kong_to_shenzhen",
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
- `prediction_engine`、类型化 `official_calibration` 与相对默认场景的分钟变化；校准结构包含版本、客流分布状态、等级权重、各阶段调整分钟和最终不确定性。

用户可见等待时间默认由 AI v2.2 预测。HGB 根据香港官方历史客流压力、口岸、方向、小时和星期计算基础分钟；天气、节假日和事件使用公开乘数，新鲜官方等级在三小时内按新鲜度和跨度校准。模型异常时自动降级到时间加权统计模型。

AI v2.2 按“模型基线—透明场景—官方等级—众包—深圳核验区间”顺序计算。众包先按用户保留最新有效反馈，再以稳健中位值、质量、新鲜度、共识和跨度衰减计算影响；单人、双人与至少三名高质量高共识反馈的上限分别为15%、30%和45%。深圳与香港客流不相加，只在压力不一致时扩大区间。

## 未来场景实验室

- `GET /api/demo/scenarios?days=14`：读取未来 14 天场景和事件预设。
- `PUT /api/demo/scenarios/{date}`：运营身份保存天气、节假日和最多 8 个事件。
- `DELETE /api/demo/scenarios/{date}`：恢复单日默认场景。
- `POST /api/demo/scenarios/reset`：恢复未来 14 天全部默认场景。
- `POST /api/demo/scenarios/compare`：无副作用地对比默认场景和候选草稿的完整路线结果。

事件包含名称、方向、影响口岸、起止时间和低/中/高强度。场景保存在 SQLite，预测按 `target_time` 自动选择当天场景；场景版本进入预测运行 ID。

场景对比请求包含路线条件、偏好和候选 `ScenarioWrite`，响应返回默认/候选两套预测、推荐是否切换和四口岸等待/风险差值。该预览不保存场景、预测运行、影子观测或审计记录。

顶层的 `forecast_run_id` 是由查询、时间、模型和数据版本确定的稳定预测运行标识；`data_sources` 与 `data_version` 让结果可追溯到具体本地输入。订阅预览不生成运行 ID，也不写入影子或反馈闭环记录。

Demo 模型为每个目标时间筛选相同工作日、周末或节假日，目标小时前后 1 小时和模拟天气的历史记录。精确小时权重为 `1.0`，相邻小时为 `0.5`，历史新近度使用 28 天半衰期。`data/factors/events.json` 中的重复事件会按影响等级调整指定口岸的基线，并作为预测依据与实时异常返回。有效众包等待按质量分加权，最大修正权重为 15%，并随反馈新鲜度和预测跨度衰减。加权历史标准差和局部趋势决定区间宽度，正态分布用于把剩余通关时间换算为迟到概率。

推荐顺序：

1. 先保留同时满足准时和预算条件的路线。
2. 在候选路线中应用最快、最便宜或命名的均衡权重。
3. 如果预算内路线都会迟到，返回迟到最少的路线。
4. 如果所有路线都超出预算，返回费用最低的路线并附带提示。

## 众包反馈

- `GET /api/crowdsource/feed?limit=8`：返回最新的未过期反馈，`limit` 范围为 `1–30`，`total` 表示未过期反馈总数。
- `POST /api/crowdsource/report`：将反馈写入 SQLite，并根据质量等级奖励 10、6 或 2 个 Demo 积分。可选的 `forecast_run_id` 与 `forecast_port_id` 会把现场反馈关联到此前预测。

请求可额外提供 `direction`（香港至深圳或深圳至香港）和 `channel`（旅客、车辆或货运）。所有反馈统一为课堂 Demo 输入；API 不接收真实现场或建模同意字段。

反馈有效期为 90 分钟。服务根据新鲜度、等待偏差和人流一致性动态计算 `quality_score` 与 `quality_level`；`expires_at` 和 `used_for_prediction` 用于解释有效期及是否参与预测。过期记录继续保存在 SQLite，但不会出现在动态列表、实时数量或预测计算中。

同一用户在同一口岸 10 分钟内重复提交时，接口返回 HTTP `409` 和错误代码 `DUPLICATE_REPORT`，`details.retry_after_minutes` 表示剩余等待时间。不同口岸的反馈互不影响。

关联反馈只用于展示同一次预测在众包前后的校准变化，不写入训练标签。

提交响应的 `calibration_preview` 返回独立反馈者数量、平均质量、共识等级、动态上限、当前有效权重、稳健等待值和采用原因。预测结果中的 `crowdsource` 因子返回同一组解释字段。

## 运营分析

- `GET /api/demo/operations-summary?window_hours=24`：仅 Demo 操作员可访问；`window_hours` 支持24或168。

响应汇总预测运行和引擎分布、有效众包和质量等级、错误码与请求 ID、写操作审计及本地适配器状态。错误事件只保存路径、状态、错误码、类别、请求 ID 和时间，不保存请求正文或敏感值。

## 提醒订阅

- `GET /api/subscriptions?user_id=demo-user`
- `POST /api/subscriptions`
- `PATCH /api/subscriptions/{subscription_id}`
- `GET /api/subscriptions/{subscription_id}/preview`
- `POST /api/subscriptions/{subscription_id}/evaluations`
- `GET /api/subscriptions/{subscription_id}/evaluations?limit=10`
- `PATCH /api/subscription-evaluations/{evaluation_id}/read`
- `DELETE /api/subscriptions/{subscription_id}`
- `POST /api/demo/alerts/run-cycle`：为当前 Demo 身份运行一次幂等本地告警周期。
- `GET /api/notifications?unread_only=false&limit=30`：读取当前身份的本地通知收件箱。
- `PATCH /api/notifications/{notification_id}/read`：标记本地通知已读。

订阅使用稳定的 `origin_id` 和 `destination_id`，支持双向跨境组合、一周七天与三类提醒开关，并持久化到 SQLite。预览接口计算下一次有效通勤日，以到达前三小时内的预测窗口返回推荐口岸、最晚出发、出发前提醒、异常拥堵和更优路线的触发状态。运行本地告警周期后，触发结果写入幂等通知收件箱；这仍是本地适配器，不代表真实外部投递。`POST /api/subscription` 仅作为已弃用的兼容路径保留。

## 企业方案

- `POST /api/batch`：验证最多 100 名可编辑员工；请求可提供批次 `preferences`，员工可用同名字段覆盖默认路线偏好和预算。结果会回显每名员工实际使用的偏好、预算和预算满足状态，并保存到 SQLite。
- `GET /api/batch/plans?company=...&limit=10`：返回近期保存的方案，前端可载入输入并重新生成。
- `POST /api/batch/csv/validate`：校验包含 `id,name,origin_id,destination_id,arrival_deadline` 的员工 CSV，并返回可直接生成方案的标准化员工数组。
- `GET /api/batch/plans/{plan_id}/export.csv`：导出当前组织可访问的方案。

企业接口仅允许运营或企业管理员身份访问，方案按 `organization_id` 隔离；通勤者身份返回 `403 FORBIDDEN`。

## Demo 边界

- 用户可见预测使用官方历史客流和新鲜官方等级；地图、交通、天气和事件仍为本地 Demo 输入。
- 所有 Provider 都是本地 JSON 或内嵌模拟降级值；`data_sources.status=available` 只表示本地输入可用，不表示真实数据可用。
- SVG 路线仅为示意，不代表真实地理比例。
- SQLite 仅提供本地 Demo 持久化，不代表生产环境并发能力或部署可靠性。
- 运营分析只反映当前本地 SQLite 中的课堂操作，不代表生产监控、真实用户行为或商业指标。
- Demo 身份头、本地通知和本地审计只用于闭合演示逻辑，不替代认证、外部投递或生产审计设施。
- AI v2.2 使用香港真实公开客流特征与生成基础等待标签驱动课堂 Demo；深圳公开快照用于交叉核验，AI v1 仅作影子比较。
- 项目不收集现场真实训练数据，也不提供生产 readiness。
- 所有输出均为辅助决策示例，不是实际口岸运营指引。
