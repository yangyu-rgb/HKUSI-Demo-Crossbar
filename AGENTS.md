# Agent 协作说明

本说明适用于整个仓库。

## 开始工作前的必做检查

任何 Agent 修改文件前都必须：

1. 阅读 `README.md`。
2. 阅读根目录的 `project_memory.md`。
3. 阅读 `docs/`、`backend/`、`frontend/` 或 `data/` 中与任务有关的文件。
4. 检查当前分支和工作区：

```bash
git status --short --branch
```

5. 尝试刷新远端引用：

```bash
git fetch
```

如果 `git fetch` 成功，编辑前必须比较当前分支与上游分支。如果本地分支落后，应先按照团队约定的 Git 流程整合远端改动。

如果 `git fetch` 因网络或权限问题失败，仅在能根据本地上下文安全完成任务时继续，并在根目录的 `project_memory.md` 中记录该限制。

## Git 操作边界

- Agent 可以执行 `git status`、`git diff`、`git log` 等只读检查，并按上述流程执行 `git fetch` 和比较上游状态。
- Agent 不执行 `git add`、`git commit` 或 `git push`；这些操作由用户负责。
- 每次完成任务后，Agent 必须向用户提供一条建议的 commit 文案。
- 除非用户在当前任务中明确改变上述约定，否则不得代替用户提交或推送改动。

## 项目记忆要求

每个已完成的阶段性任务都必须在同一变更集中更新根目录的 `project_memory.md`。

更新内容必须包括：

- 日期。
- 已完成任务摘要。
- 修改的文件或区域。
- 已执行的验证。
- 远端同步限制、冲突或后续事项。

如果远端成员修改了仓库，下一位拉取或合并这些改动的 Agent 也必须更新 `project_memory.md`，确保项目记忆反映最新成果。

## 冲突与远端改动规则

- 保留团队成员的有效改动。
- 不得为了适配本地计划而覆盖远端工作。
- 项目记忆发生 Markdown 冲突时，应按时间顺序合并并保留双方内容，除非某一项已经明确失效。
- 如果行为、API 结构或演示流程发生变化，应同步更新相关文档，并在 `project_memory.md` 中记录决策。
- 仓库规则保存在本文件中；任务历史、验证和后续事项保存在 `project_memory.md` 中。

## 当前仓库结构

这是 SIUS2612 Topic 2 的本地 Demo 项目，包含：

- `backend/`：FastAPI 模拟后端。
- `frontend/`：React、TypeScript 和 Vite 前端。
- `data/`：确定性的本地样例数据。
- `docs/`：API、演示和项目协作文档。

本项目仅用于 Demo。除非团队明确决定扩大范围，否则不得加入真实 API 密钥、生产环境集成或部署假设。
