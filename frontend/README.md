# CrossBorder AI 前端

用于 CrossBorder AI 本地 Demo 的 React、TypeScript 和 Vite 界面。

## 架构

```text
src/
  layout/     # 共享导航、重置控制和页面外壳
  pages/      # 懒加载的路由级页面
  features/   # 功能 API、查询 Hook、组件和局部类型
  generated/  # 从后端 OpenAPI 契约生成的类型
  shared/     # API 错误、查询键、格式化、Skeleton 和页面状态
```

TanStack Query 负责服务端状态、缓存失效、Mutation 和 60 秒实时轮询。全局时钟基于服务端香港时间每秒推进，规划和企业表单使用服务端建议时间初始化。

路由：

- `/`：四口岸状态、手动刷新和 Recharts 趋势对比。
- `/planner`：带验证的预测表单、可解释结果和 SVG 路线。
- `/crowdsource`：课堂反馈、方向/通道、重复提交拦截、质量评分、多人共识与15%/30%/45%动态校准。
- `/alerts`：持久化订阅 CRUD、下一次通勤评估、本地告警周期、通知收件箱和已读状态。
- `/business`：员工 CSV 导入校验、偏好编辑、风险/口岸筛选、方案历史和 CSV 导出。
- `/model`：V2.2 技术公式、大白话解释、基础模型指标、区间校准和 V1 影子对照。
- `/operations`：仅 Demo 操作员可访问的预测、众包、错误、审计和适配器运营分析。
- `/mobile`：独立手机首页，提供当前最优口岸、四口岸排名、双侧来源说明和四个课堂快捷入口。

页头身份选择器提供运营、个人通勤者和企业管理员三种本地 Demo 角色。切换后请求会携带 `X-Demo-Persona-ID` 并重新加载当前角色的数据；这不是生产登录系统。

## 运行

从仓库根目录执行以下命令，可以同时启动前后端：

```bash
./start.sh
```

需要单独调试前端时，先在 `8000` 端口启动后端，然后在 `frontend/` 目录执行：

```bash
npm install
npm run dev
```

需要修改 API 地址时：

```bash
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

## 验证和重新生成契约

```bash
npm test
npm run test:coverage
npm run build
npm run generate:api
npm run test:e2e
```

`test:coverage` 对本轮关键 API、众包、地图和运营模块执行不低于70%的语句、分支、函数和行覆盖率门槛。`npm run check:api` 会重新生成 OpenAPI 文件；如果已提交的契约文件不是最新版本，命令会失败。Playwright 会分别启动并等待后端存活探针与前端页面，再用 Chromium 覆盖口岸地图、双向规划、场景实验室、通知、运营分析、模型说明和独立手机首页，并对全部业务路由执行 axe WCAG A/AA 检查。CI 使用单 worker，避免并行重置共享 Demo SQLite 状态。
