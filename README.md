# CrossBorder AI
## 深港跨境通勤与口岸等待智能规划平台

SIUS2612 Topic 2 AI Business Prototype

---

## 项目简介

CrossBorder AI 是一个专为深港跨境场景设计的 AI 出行与调度平台。它不是再做一个普通地图 App，而是解决一个普通地图很难彻底解决的问题：**跨境路线不只取决于地理和交通，还取决于"口岸排队不确定性"和"车费""，近还不代表低成本的跨境路线。**

深港跨境客流规模大、波动强、场景高度复杂化。上班族需要知道哪条路线更稳，物流公司和跨境巴士公司需要批次安排和风险管理，但目前不深港路线预测并不准确且系统级风险管理决策不能从公开交通导航系统中获取。

本项目的创新点是把跨境"静态路线规划"升级为**"预测驱动的跨境路线规划"**：利用AI预测未来1-3小时口岸等待时间、并给出合路线建议、主动推送最佳出发时间，而非主推C端收费，而是主推B2B/B2G：跨境巴士、物流、企业 HR、园区/企业通勤数据服务。

---

## 核心功能

### 基础功能层
✅ **时间驱动信息聚合**
- 使用香港实时时钟，动态计算4个口岸（罗湖、福田、皇岗、深圳湾）的模拟等待趋势
- 显示口岸开放状态、特殊通道、模拟天气和交通提示

### 核心差异化层（AI驱动）

🎯 **AI预测引擎**
- 未来1-3小时口岸等待时间预测
- 置信区间和风险量化（"虽然最快但波动大，迟到风险20%"）
- 多模式路线优化（港铁+罗湖 vs 高铁+福田 vs 深圳湾）

✨ **众包智能反馈系统**（创新点）
- 用户实时报告："我现在在罗湖，实际等了15分钟"
- 系统根据反馈质量和新鲜度动态校准预测结果
- 显示："23分钟前有用户报告：福田排队人少"
- 激励机制：报告数据获得积分/VIP功能

✨ **智能提醒订阅**（创新点）
- AI学习用户通勤模式（每周三上午去深圳、偏好最快路线）
- 主动推送："根据当前预测，建议你在8:15出发走福田口岸"
- 异常主动提醒："你常走的罗湖今天异常拥堵+40%"
- 可设置"到达deadline"，系统倒推最晚出发时间

### 商业化功能层（B2B）

💼 **企业批量调度Dashboard**
- 物流公司、跨境巴士公司批量规划
- 员工通勤风险管理和成本优化

---

## 与竞品的差异

| 功能 | Google Maps | i口岸 | **CrossBorder AI** |
|------|-------------|-------|-------------------|
| 路线导航 | ✅ | ❌ | ✅ |
| 实时口岸状态 | ❌ | ✅ | ✅ 基础功能 |
| **未来预测（1-3h）** | ❌ | ❌ | ✅ **核心** |
| **众包实时校准** | ❌ | ❌ | ✅ **创新点** |
| **智能提醒订阅** | ❌ | ❌ | ✅ **创新点** |
| 多模式优化 | 部分 | ❌ | ✅ 核心 |
| 风险量化 | ❌ | ❌ | ✅ 核心 |
| 企业批量规划 | ❌ | ❌ | ✅ B2B |

**核心竞争力：**
- **i口岸**：只看"现在"，被动查询
- **Google Maps**：通用导航，不懂跨境特殊性
- **CrossBorder AI**：看"未来" + 众包增强 + 主动推送 + 跨境专属优化

---

## AI技术核心

1. **时间加权统计预测（Time-Weighted Forecasting）** - 按星期、小时、模拟天气和历史新近度预测等待时间
2. **众包动态校准（Crowdsource Calibration）** - 根据质量、新鲜度和预测跨度修正结果
3. **概率预测（Probabilistic Prediction）** - 提供置信区间和风险评估
4. **路线优化（Multi-Modal Route Optimization）** - 比较港铁、高铁、巴士组合
5. **异常检测（Anomaly Detection）** - 识别节假日、事故、突发拥堵
6. **个性化推荐（Personalization）** - 学习用户偏好和通勤模式

---

## 项目结构

```text
backend/
  app/
    api/                  # FastAPI 路由与依赖
    repositories/         # JSON/CSV 输入与 SQLite 持久化
    schemas/              # Pydantic API 契约
    services/             # 时间加权预测和业务逻辑
    clock.py              # 香港时钟抽象
    main.py               # 应用组装
data/
  history/                # 5,376 条确定性历史样本
  realtime/               # 口岸模拟元数据
  routes/                 # 地点与交通矩阵
  factors/                # 模拟天气、节假日和事件
  crowdsource/            # 相对当前时间的反馈种子
docs/                     # API 契约和演示说明
frontend/
  src/
    features/             # 功能 API、查询 Hook 和组件
    generated/            # OpenAPI 生成类型
    layout/               # 全局导航和香港时钟
    pages/                # 五个业务页面
    shared/               # API、格式化和共享状态组件
```

---

## 技术栈

### 前端
- **框架**: React 19 + TypeScript
- **构建工具**: Vite
- **服务端状态**: TanStack Query
- **图表**: Recharts（预测折线图、置信区间可视化）
- **实时通信**: 60 秒轮询

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据验证**: Pydantic
- **数据**: JSON + CSV + 本地 SQLite

### AI/数据
- **Demo阶段**: 香港实时时钟 + 可解释时间加权统计模型 + 模拟数据
- **生产级**: LSTM/Prophet时间序列模型 + 在线学习算法

---

## 快速开始

在仓库根目录执行：

```bash
./start.sh
```

脚本会在缺少依赖时自动创建后端虚拟环境并安装前后端依赖，然后同时启动：

- 前端：`http://127.0.0.1:5173`
- API 文档：`http://127.0.0.1:8000/docs`

按 `Ctrl+C` 会同时停止前后端服务。需要单独调试某个服务时，参见 `backend/README.md` 和 `frontend/README.md`。

该脚本面向 macOS 和 Linux；Windows 环境可分别使用前后端说明中的命令。

---

## 演示场景

### 场景1：个人用户 - 跨境学生
**小明：香港大学学生，需要9:30前到达深圳南山实习**

1. 打开首页，看到4个口岸实时状态
2. 看到众包反馈："5分钟前 @user123: 福田人很少"
3. 输入查询：9:30到达南山
4. AI推荐：福田口岸（预测等待15分钟，置信区间12-20，风险低）
5. 通关后提交反馈："实际等了12分钟" → 获得10积分
6. 设置智能提醒：每周一三五自动推送最优路线

### 场景2：智能提醒触发
**周三早上7:45**
- 小明收到推送："建议8:15出发走福田口岸"
- 显示预测图表和完整路线

**周五早上检测到异常**
- 7:30推送："⚠️ 罗湖今天异常拥堵+40%，建议改走深圳湾"

### 场景3：企业批量调度
**跨境物流公司HR：20名员工需要9点前到达深圳**

1. 上传员工列表和通勤需求
2. 系统批量预测并生成优化调度方案
3. Dashboard显示：平均通勤75分钟，3人存在迟到风险>20%
4. 系统建议：3名风险员工提前30分钟出发

---

## 开发计划

### Phase 1: MVP核心功能（7月9-12日）
- [ ] 前端：首页实时看板 + 预测结果页 + 众包组件 + 智能提醒设置
- [ ] 后端：实时状态API + 预测API + 众包API + 订阅API
- [ ] 数据：Mock实时数据 + 历史CSV + 众包样本

### Phase 2: 完善与优化（7月13-14日）
- [ ] 企业Dashboard（B2B场景）
- [ ] UI/UX优化和动画
- [ ] 响应式设计

### Phase 3: Pitch准备（7月14-15日）
- [ ] 英文PPT制作
- [ ] Demo视频录制
- [ ] 商业模式细化

---

## 商业模式

### B2B SaaS（主推）
- **跨境巴士公司**: 提供批次进次预测、口岸拥堵预警和客服提示
- **物流公司**: 提供出车时段、口岸选择和延迟风险评估
- **企业/园区HR**: 提供员工通勤风险dashboard和班车优化建议

### 数据API
- 旅游平台API：给旅行社、OTA提供跨境路线预测API

### 政府/公共合作
- 作为口岸客流分析服务，支持高峰管理和公众提示

---

## 文档

- [详细项目规划](docs/project_plan.md) - 完整技术架构、API设计、AI实现方案
- [API接口文档](docs/api_contract.md) - 后端API详细规范
- [Demo演示脚本](docs/demo_script.md) - Pitch演示流程

---

## Git协作

### 分支策略
```bash
main                      # 主分支
frontend/<feature-name>   # 前端功能分支
backend/<feature-name>    # 后端功能分支
data/<feature-name>       # 数据相关分支
docs/<feature-name>       # 文档分支
```

### Commit规范
```text
feat: add real-time board component
feat: add prediction API endpoint
data: add historical port data
docs: update project plan
fix: correct prediction confidence interval calculation
```

### GitHub Remote
```bash
git remote add origin https://github.com/yangyu-rgb/HKUSI-Demo.git
git push -u origin main
```

---

## 评分对应（Topic 2）

### 1. Innovative AI Business Concept (50%)
- ✅ **Originality (15%)**: 跨境预测+众包+智能提醒组合创新
- ✅ **AI at Core (20%)**: 时间序列预测、在线学习、路线优化、异常检测、个性化
- ✅ **Problem-Solution Fit (15%)**: 每天70万人次刚需市场

### 2. Business Viability (30%)
- ✅ **Feasibility (15%)**: 技术可行，数据可获取
- ✅ **Vision (15%)**: B2B SaaS清晰商业模式

### 3. Presentation (20%)
- ✅ **Organization (10%)**: Demo流程清晰（实时→预测→众包→提醒）
- ✅ **Skills (10%)**: 可视化强，现场互动性高

---

## License

This is a demo project for SIUS2612 Capstone Project. Not for commercial use.

---

## 联系方式

Project Repository: https://github.com/yangyu-rgb/HKUSI-Demo

Course: SIUS2612 AI Insider: Bridging Theory and Industrial Application  
HKU Summer Institute 2026
