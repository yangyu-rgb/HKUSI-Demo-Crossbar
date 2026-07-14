# CrossBorder AI 后端

用于 CrossBorder AI 本地 Demo 的 FastAPI 服务。平台时间使用 `Asia/Hong_Kong`，口岸、天气和交通数据仍为本地模拟输入。

## 架构

```text
app/
  api/           # HTTP 路由和依赖提供器
  schemas/       # Pydantic 请求、响应契约和枚举
  services/      # 预测与业务流程逻辑
  repositories/ # 缓存的 JSON 输入和 SQLite 动态持久化
  main.py        # 应用组装、中间件和错误映射
```

口岸元数据、历史样本、双向交通矩阵和确定性企业运营情景保存在 `data/`。众包反馈、订阅、提醒评估、本地通知、预测运行、企业运营方案、协调建议、员工接驳方案、影子观测、商业订阅与审计保存在被 Git 忽略的 `data/runtime/crossborder.db`。调用 `POST /api/demo/reset` 会按当前香港时间恢复种子状态。商业套餐、模拟结账和本地收据只验证商业叙事，不接收支付凭证，也不代表真实客户或收入。

预测器按工作日/周末或节假日、目标小时前后 1 小时、模拟天气和 28 天历史半衰期计算加权基线。重复事件会按配置影响指定口岸并写入预测依据与实时异常；众包反馈按质量分修正结果，影响随新鲜度和预测跨度衰减。置信区间使用历史波动率和预测斜率计算；`app/config.py` 中的命名常量保证 Demo 模型可解释、可审查。

## 离线 AI v1

AI v1 使用合成历史数据训练梯度提升等待时间回归模型，并按时间划分训练、验证和测试集。FastAPI 启动时会可选加载该模型，但仅作影子计算：用户看到的等待时间、路线推荐和 API 契约仍由统计模型决定。

根目录 `start.sh` 会先运行 `scripts/ensure_v1_model.py` 和 `scripts/ensure_v2_model.py`。V2.2 从已跟踪的规范化香港官方客流快照确定性生成最近730天、140,160条运行时基础数据，再校验或重建被忽略的模型二进制；干净克隆不依赖既有 SQLite、现场标签或网络采集。

最终训练器比较 Ridge、ExtraTrees 和 HistGradientBoosting 共25组候选，只用验证集选择，测试集仅作最终报告；数据审计、日历基线改善、客流消融、测试退化、90%区间覆盖、最差切片和单调敏感性全部通过才允许加载。AI v1 已冻结为影子对照。

```bash
pip install -r requirements-dev.txt
python scripts/train_wait_model.py
```

命令会生成：

- 被 Git 忽略的 `data/runtime/models/wait_model_v1.joblib`。
- 可审计的 `data/models/wait_model_v1.metadata.json`。
- `docs/model_v1_report.md` 离线评估报告。

合成数据指标不得作为真实口岸效果声明。获得真实数据后，必须重新划分训练、验证和测试集。

影子加载器会校验模型架构版本、模型版本、特征顺序、晋级状态，以及训练数据哈希是否仍与当前历史文件一致。每个口岸会将统计等待值、AI 等待值、差值和不可用原因写入本地 SQLite；模型文件缺失、元数据不兼容、数据不一致或推理失败时，预测会自动保持统计模型结果。`POST /api/demo/reset` 会清除这些观测记录。

## 提醒、Demo 身份、数据 Provider 与影子观测

`GET /api/subscriptions/{subscription_id}/preview` 会选取下一次有效通勤日期，并以到达前三小时内的预测窗口生成推荐口岸、最晚出发时间和三类提醒预览。它是纯计算，不发送通知，也不写入提醒历史或影子模型观测。需要保留审阅记录时，调用 `POST /api/subscriptions/{subscription_id}/evaluations`；历史与已读状态分别由 `GET /api/subscriptions/{subscription_id}/evaluations` 和 `PATCH /api/subscription-evaluations/{evaluation_id}/read` 提供。

口岸状态、天气、日历、重复事件和众包种子统一经本地 JSON Provider 读取，并实现最小 Provider/Repository 协议。每个实时或预测响应都携带来源、读取时间、状态、版本和是否使用内嵌降级数据。当前没有任何外部 Provider；该边界只为未来经过审核的数据接入保留，不能视为真实数据服务。

`GET /api/demo/model-shadow-summary` 提供按口岸汇总的影子可用性和模型差异，仅用于本地 Demo 审阅。

健康检查、Demo 上下文与身份列表、实时口岸态势和商业套餐允许匿名读取。其他请求必须在本地登录后携带 `X-Demo-Persona-ID`：缺失时返回 `401 AUTH_REQUIRED`，角色不符返回 `403 FORBIDDEN`。个人可使用规划、众包、提醒、AI 和移动场景对比；企业管理员可使用运营控制塔、员工接驳和 AI；巴士/物流调度身份只进入对应企业运营工作空间；口岸官方只读取聚合压力并管理本地协调建议；平台运营可切换四种视角并使用全部桌面功能。企业方案按组织隔离，审计与运营汇总仅允许平台运营访问。显式执行本地告警周期会把触发的提醒以幂等方式写入通知收件箱；该身份头可被伪造，只用于 V1 Demo，不是生产认证或投递服务。

`/api/enterprise-operations/*` 提供分角色 CSV 模板/校验、手工任务契约、四场景横向比较、动态调度预览、方案采用、通知草稿、导出和人工复盘。预览会对每条任务的候选口岸调用已校验的 AI v2.2 HGB，随后应用透明天气/节假日/事件校准，再按起终点、时限、容量、车辆可用时间、周转和口岸开放约束优化；响应通过 `ai_decision_trace` 暴露模型版本、输入、90% 区间和降级来源。草稿和比较不持久化，采用时才把输入、场景快照和结果保存到 SQLite。它不会连接真实巴士、货车、短信、客服或口岸系统；等待标签、成本暴露和改善指标仍是课堂重建情景。

`GET /api/demo/v1-readiness` 汇总双向路线矩阵、本地 Provider、SQLite、Demo 身份、AI v1 产物和通知适配器状态；`GET /api/health/live` 与 `GET /api/health/ready` 可供本地运行探测。所有写请求记录请求 ID、身份、组织、路径和状态码，并返回基础安全响应头。

每个正式预测仍生成稳定的 `forecast_run_id`，众包可关联该运行以演示反馈前后的变化。公开 API 不再接收真实现场、建模同意或训练标签字段；反馈按用户去重并以质量、新鲜度、共识和预测距离衰减，单人、双人和多人高共识上限分别为15%、30%和45%。旧数据库字段仅作本地兼容，不进入公开响应或训练流程。

`GET /api/demo/operations-summary` 仅供 Demo 操作员查看本地预测、众包、错误、审计和适配器状态。统一错误信封除错误码、消息、详情和请求 ID 外，还提供类别、是否可重试及用户行动建议；未知异常只向用户返回脱敏提示，完整异常写入本地服务日志。

AI v2.2 状态响应提供 `optimization_matrix`，逐项标明候选选型、运行时影子 A/B、场景 A/B 与透明解释已完成；在线学习因没有合规真实等待标签而阻断，SHAP 和运行时模型集成保留为有证据后再评估的事项。

## 官方特征采集

`data/sources/official_sources.json` 登记外部来源、用途和条款。香港入境处每日客流是主特征；深圳市口岸办公开统计固化为核验快照；i口岸内部接口保持阻断。

```bash
python scripts/collect_official_sources.py
python scripts/collect_official_sources.py --status
```

维护者可选择运行 `collector.sh` 更新香港缓存，但这不属于课堂运行链路。`start.sh` 只使用仓库快照，确保断网演示稳定。

每次正式预测保存所用输入版本。AI v2.2 读取香港官方历史客流压力；新鲜的 `normal/busy/very_busy` 等级按数据年龄和三小时预测跨度衰减后校准分钟结果，深圳快照只核验区间。等级不转换成真实分钟标签。

## 运行

从仓库根目录执行以下命令，可以同时启动前后端：

```bash
./start.sh
```

需要单独调试后端时，在 `backend/` 目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动后可通过 `http://127.0.0.1:8000/docs` 查看交互式 API 文档。

## 验证

```bash
pip install -r requirements-dev.txt
pytest -q
python scripts/export_openapi.py
```

测试使用隔离的临时 SQLite 数据库，不会修改 Demo 运行数据库。
