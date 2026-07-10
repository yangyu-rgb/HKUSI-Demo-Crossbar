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
- `/crowdsource`：持久化反馈、重复提交拦截、质量评分和有效期动态列表。
- `/alerts`：持久化订阅的创建、编辑和删除。
- `/business`：员工编辑、重复生成和已保存方案历史。

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
```

`npm run check:api` 会重新生成 OpenAPI 文件；如果已提交的契约文件不是最新版本，命令会失败。
