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

口岸元数据、历史样本和双向交通矩阵保存在 `data/`。众包反馈、订阅、提醒评估、本地通知、预测运行、企业方案、影子观测与审计保存在被 Git 忽略的 `data/runtime/crossborder.db`。调用 `POST /api/demo/reset` 会按当前香港时间恢复种子状态。

预测器按工作日/周末或节假日、目标小时前后 1 小时、模拟天气和 28 天历史半衰期计算加权基线。重复事件会按配置影响指定口岸并写入预测依据与实时异常；众包反馈按质量分修正结果，影响随新鲜度和预测跨度衰减。置信区间使用历史波动率和预测斜率计算；`app/config.py` 中的命名常量保证 Demo 模型可解释、可审查。

## 离线 AI v1

AI v1 使用合成历史数据训练梯度提升等待时间回归模型，并按时间划分训练、验证和测试集。FastAPI 启动时会可选加载该模型，但仅作影子计算：用户看到的等待时间、路线推荐和 API 契约仍由统计模型决定。

根目录 `start.sh` 会先运行 `scripts/ensure_v1_model.py` 和 `scripts/ensure_v2_model.py`。只有运行时二进制缺失或无法通过已跟踪元数据、特征与数据哈希校验时才重建被忽略的产物；AI v2 使用已跟踪的可解释合成场景数据，所有指标只用于课堂 Demo。

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

口岸状态、天气、日历、重复事件和众包种子统一经本地 JSON Provider 读取。每个实时或预测响应都携带来源、读取时间、状态、版本和是否使用内嵌降级数据。当前没有任何外部 Provider；该边界只为未来经过审核的数据接入保留，不能视为真实数据服务。

`GET /api/demo/model-shadow-summary` 提供按口岸汇总的影子可用性和模型差异，仅用于本地 Demo 审阅。

请求可用 `X-Demo-Persona-ID` 在运营、通勤者和企业管理员之间切换。企业方案按组织隔离，企业接口仅允许运营或企业管理员访问，审计接口仅允许运营访问。显式执行本地告警周期会把触发的提醒以幂等方式写入通知收件箱；这套身份、组织和通知机制只用于 V1 Demo，不是生产认证或投递服务。

`GET /api/demo/v1-readiness` 汇总双向路线矩阵、本地 Provider、SQLite、Demo 身份、AI v1 产物和通知适配器状态；`GET /api/health/live` 与 `GET /api/health/ready` 可供本地运行探测。所有写请求记录请求 ID、身份、组织、路径和状态码，并返回基础安全响应头。

每个正式预测还会生成稳定的 `forecast_run_id`。众包提交可带上 `forecast_run_id` 与 `forecast_port_id`，并记录方向、通关类型、等待起止时间、真实现场声明、来源和建模同意；只有真实、已授权、高质量、未过期且尚无标签的反馈才会写入实际等待标签。旧数据库会进行保守的增量迁移，迁移前的反馈默认视为 Demo 数据。运行以下命令可将标签导出为被 Git 忽略的 CSV 与元数据，并包含数据哈希、时间范围、时间切分、来源和 V2 就绪度：

```bash
python scripts/export_training_snapshot.py
```

`GET /api/demo/v2-readiness` 也返回相同的在线检查。当前阈值要求至少 200 条真实授权标签、四个口岸、21 个日期、8 个小时切片、可用的时间分区和关键本地输入；同时返回被隔离反馈、真实来源和分布风险。200 条只允许启动受控实验，不代表 672 个口岸—日期—小时组合已完整覆盖；真实 Provider 与真实运营回测未完成前仍不能生产晋级。

## 官方特征采集

`data/sources/official_sources.json` 登记外部来源的审批状态、用途、条款和刷新周期。当前只启用香港入境处居民/访客口岸拥堵等级及每日客流；深圳开放数据仍是候选，i口岸在获得书面授权前保持阻断。

```bash
python scripts/collect_official_sources.py
python scripts/collect_official_sources.py --status
python scripts/validate_exact_wait_labels.py /path/to/candidate.csv
```

持续采集建议从仓库根目录运行 `./collector.sh start`，并用 `./collector.sh status` 查看进程、来源新鲜度、24 小时成功次数/完整率和最大缺口；`stop`/`restart` 分别停止或重启。采集器将原始响应写入被 Git 忽略的 `data/runtime/external_sources/`，并把标准化特征、内容哈希、修订历史和运行结果写入 SQLite。

每次正式预测只查询 `generated_at` 当时已经抓取且已经观察到的官方值，并把结果冻结到预测运行。训练快照 schema v3 导出该冻结值；后续来源修订不会改写历史运行。V1 预测值、路线排序和用户结果不读取这些字段。官方等级一致性报告只比较 `normal/busy/very_busy` 的序数类别，不生成伪分钟或分钟 MAE。官方等级和客流不会生成等待分钟标签；候选精确标签校验器也只读，不执行导入。

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
