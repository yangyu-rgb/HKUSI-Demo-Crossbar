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
- `/crowdsource`：持久化反馈、方向/通道、真实现场与建模同意、重复提交拦截、质量评分和有效期动态列表。
- `/alerts`：持久化订阅 CRUD、下一次通勤评估、本地告警周期、通知收件箱和已读状态。
- `/business`：员工 CSV 导入校验、偏好编辑、风险/口岸筛选、方案历史和 CSV 导出。
- `/model`：V1 合成数据指标、分口岸误差、运行时影子差异、V1 Demo 就绪度、V2 真实标签门槛及官方特征来源/覆盖状态。

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
npm run build
npm run generate:api
npm run test:e2e
```

`npm run check:api` 会重新生成 OpenAPI 文件；如果已提交的契约文件不是最新版本，命令会失败。Playwright 会分别启动并等待后端存活探针与前端页面，再用 Chromium 覆盖桌面与移动端双向规划、场景实验室、通知和模型门槛，并对七个路由执行 axe WCAG A/AA 检查。CI 使用单 worker，避免并行重置共享 Demo SQLite 状态。
