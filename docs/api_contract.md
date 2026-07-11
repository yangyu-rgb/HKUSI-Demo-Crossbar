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
- `GET /api/demo/v2-model`：返回直接驱动路线的 AI v2 合成场景模型、时间切分指标和运行时产物状态。
- `GET /api/demo/v1-readiness`：返回 V1 完整 Demo 就绪检查；该状态不影响独立的 V2 门槛。
- `GET /api/demo/audit?limit=50`：仅运营身份可读取本地写操作审计。
- `GET /api/demo/model-shadow-summary`：返回 AI v1 影子观测总量、可用/降级次数与各口岸的平均差异，仅用于本地审阅。
- `GET /api/demo/v2-readiness`：基于来源可追溯且获得建模同意的高质量实际等待标签，返回标签数、已关联/隔离数、训练来源、口岸/日期/小时切片覆盖、时间切分、分布提醒、统计与影子误差、输入源状态和 V2 实验/生产晋级判断。
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
- `prediction_engine` 与相对默认场景的分钟变化；顶层返回目标日期实际使用的场景快照和版本。

用户可见等待时间默认由 AI v2 场景模型预测。模型根据口岸、方向、小时、星期、节假日、天气和事件强度计算等待分钟；模型缺失、版本不兼容或推理异常时自动降级到时间加权统计模型。路线费用、交通时间、预算和偏好仍由确定性优化层处理。

AI v2 原始等待值会再使用有效众包反馈校准。校准沿用质量、新鲜度和预测跨度衰减规则，最大权重为 15%；无有效反馈时保持纯 V2 输出，V2 降级时不会重复应用统计模型已经完成的众包修正。预测依据同时返回 V2 原始值、校准值、众包值和实际权重。

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

请求可额外提供 `direction`（香港至深圳或深圳至香港）、`channel`（旅客、车辆或货运）、`is_real_observation` 和 `training_consent`。建模同意只有在明确声明为实际现场反馈时才有效；服务端根据提交时间和等待分钟数保存可审计的等待起止时间，并把真实用户观察标记为 `crowdsource_observation`。客户端不能把自己声明成合作方或官方来源。

反馈有效期为 90 分钟。服务根据新鲜度、等待偏差和人流一致性动态计算 `quality_score` 与 `quality_level`；`expires_at` 和 `used_for_prediction` 用于解释有效期及是否参与预测。过期记录继续保存在 SQLite，但不会出现在动态列表、实时数量或预测计算中。

对明确声明的真实现场反馈，质量评分以等待起止元数据代替“与模拟当前值的一致程度”，避免因真实值偏离 Demo 基线而被自动排除；演示反馈继续使用原有一致性规则。

同一用户在同一口岸 10 分钟内重复提交时，接口返回 HTTP `409` 和错误代码 `DUPLICATE_REPORT`，`details.retry_after_minutes` 表示剩余等待时间。不同口岸的反馈互不影响。

关联的反馈只会在实际现场声明、建模同意、真实来源、未过期、质量为 `high` 且该预测口岸尚无实际标签全部满足时写入训练标签；演示、未授权、低质量或重复标签仍保留关联，但不会污染 V2 训练快照。

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

- V1 用户可见预测只使用宿主系统香港时间与本地模拟口岸、地图、交通、天气和事件；隔离的香港官方等级/客流只进入快照和外部校验，不控制 V1 输出。
- 所有 Provider 都是本地 JSON 或内嵌模拟降级值；`data_sources.status=available` 只表示本地输入可用，不表示真实数据可用。
- SVG 路线仅为示意，不代表真实地理比例。
- SQLite 仅提供本地 Demo 持久化，不代表生产环境并发能力或部署可靠性。
- Demo 身份头、本地通知和本地审计只用于闭合演示逻辑，不替代认证、外部投递或生产审计设施。
- AI v2 使用合成场景标签直接驱动课堂 Demo；AI v1 仅作影子比较。真实数据 readiness 继续独立阻止任何真实效果或生产准确率声明。

`V2ReadinessResponse.external_data` 单独返回外部来源审批状态、官方特征观测数、口岸/方向/日期/小时覆盖、来源新鲜度、24 小时预期/成功次数、完整率、最大缺口、预测快照覆盖率和官方序数等级一致性。官方一致性只报告类别命中率、序数误差和混淆矩阵，不报告分钟 MAE。官方拥堵等级与每日客流的 `minute_labels_from_official_features` 固定为 `0`，不得与 `label_count` 合并。
- 所有输出均为辅助决策示例，不是实际口岸运营指引。
