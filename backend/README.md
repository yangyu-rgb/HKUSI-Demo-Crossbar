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

口岸元数据、历史样本和交通矩阵保存在 `data/`。众包反馈、订阅和企业方案历史保存在被 Git 忽略的 `data/runtime/crossborder.db`。调用 `POST /api/demo/reset` 会按当前香港时间恢复种子状态。

预测器按工作日/周末或节假日、目标小时前后 1 小时、模拟天气和 28 天历史半衰期计算加权基线。重复事件会按配置影响指定口岸并写入预测依据与实时异常；众包反馈按质量分修正结果，影响随新鲜度和预测跨度衰减。置信区间使用历史波动率和预测斜率计算；`app/config.py` 中的命名常量保证 Demo 模型可解释、可审查。

## 离线 AI v1

AI v1 使用合成历史数据训练梯度提升等待时间回归模型，并按时间划分训练、验证和测试集。FastAPI 启动时会可选加载该模型，但仅作影子计算：用户看到的等待时间、路线推荐和 API 契约仍由统计模型决定。

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

## 提醒预览与影子观测

`GET /api/subscriptions/{subscription_id}/preview` 会选取下一次有效通勤日期，并以到达前三小时内的预测窗口生成推荐口岸、最晚出发时间和三类提醒预览。它不发送真实通知，也不会把预览情景写入影子模型观测。

`GET /api/demo/model-shadow-summary` 提供按口岸汇总的影子可用性和模型差异，仅用于本地 Demo 审阅。

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
