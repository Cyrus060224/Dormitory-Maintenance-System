<div align="center">

# 🏠 智能宿舍报修管理系统

**Dormitory Maintenance System**

一个融合 AI 智能派单、SLA 时效监控、多角色协作的现代化宿舍报修平台

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

<br/>

[🚀 快速启动](#-快速启动) · [📖 功能列表](#-功能列表) · [🏗️ 系统架构](#️-系统架构) · [🔑 角色权限](#-角色与权限) · [📸 运行效果](#-运行效果)

</div>

---

## 📌 项目简介

在高校宿舍管理中，传统的报修方式往往面临 **响应慢、流程乱、无法追溯、分配不均** 等痛点。本系统以 **"提交即分配、全程可追踪、数据可量化"** 为核心理念，打造了一个从报修提交到工单结案的全链路数字化管理平台。

### 它解决了什么问题？

| 传统痛点 | 本系统的解决方案 |
|----------|-----------------|
| 🔴 报修靠电话/纸质单，容易丢失 | ✅ 在线提交，图片上传，永久留存 |
| 🔴 人工分配维修员，效率低、不公平 | ✅ AI 智能派单，按技能匹配 + 负载均衡 |
| 🔴 工单状态不透明，学生反复催促 | ✅ 实时状态流转 + SLA 倒计时 + 自动预警 |
| 🔴 维修质量无法评估 | ✅ 五星评价体系 + 文字反馈 + 标签打分 |
| 🔴 管理员缺乏数据支撑 | ✅ 多维度数据大屏，一键导出 CSV |

---

## ✨ 功能列表

### 🎓 学生端
- 📝 在线提交报修（楼栋/房间/分类/描述/图片）
- 🤖 AI 视觉预检 — 上传照片自动识别故障类型
- 📋 查看个人报修列表，实时追踪工单状态
- 💬 工单详情页时间轴留言，与维修员沟通
- ⭐ 维修完成后五星评价 + 快捷标签反馈
- 🔔 消息通知中心，不错过任何状态变更

### 🔧 维修员端
- 📋 查看分配给自己的任务列表
- 🔄 更新工单状态（开始维修 / 完成维修）
- 📝 填写维修记录（强制要求，确保履历完整）
- 🔩 登记消耗配件，自动扣减库存
- 📊 个人绩效面板（任务量、完成率、评分）

### 👨‍💼 管理员端
- 📊 **数据大屏** — 报修总量、状态分布、类型占比、趋势折线图
- ✅ 审批/驳回/指派工单，修改优先级
- 👥 用户管理，编辑维修员技能标签
- 🔩 配件库存 CRUD，物料消耗排行
- 🤖 AI 引擎配置中心（支持 Ollama / OpenAI / DeepSeek）
- 📢 公告发布与管理
- 📥 一键导出 CSV 报表

### 🤖 AI 智能能力
- **智能派单** — 根据报修类型匹配维修员技能，按负载均衡自动分配
- **双轨分析** — 先走 Ollama Llama3 NLP，失败自动降级到关键词规则引擎
- **视觉预检** — 上传故障照片，AI 自动判断分类并给出诊断建议
- **宿宝助手** — 内置 AI 聊天机器人，回答宿舍生活与报修相关问题

### ⏱️ SLA 服务级别协议
- 按优先级设定截止时间：紧急 2h / 高 6h / 普通 24h / 低 48h
- 后台每 60 秒自动巡检，剩余 20% 时间发出预警通知
- 超时自动标记并通知学生、维修员、管理员三方
- 数据大屏实时展示 SLA 达标率

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 学生视图  │  │ 维修员视图│  │ 管理员视图│              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       └──────────────┼──────────────┘                    │
│                 authFetch (JWT)                          │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP /api/*
┌─────────────────────┴───────────────────────────────────┐
│                  Backend (FastAPI)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐      │
│  │  Auth   │ │ Repairs │ │  Users  │ │   AI     │      │
│  │ Routes  │ │ Routes  │ │ Routes  │ │  Routes  │      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬─────┘      │
│       └───────────┼───────────┼───────────┘              │
│              ┌────┴────┐ ┌────┴────┐                     │
│              │  SLA    │ │   AI    │                     │
│              │ Service │ │ Service │                     │
│              └────┬────┘ └────┬────┘                     │
│                   └───────────┘                          │
│                    SQLite (dorm.db)                       │
└─────────────────────────────────────────────────────────┘
```

### 项目目录结构

```
Dormitory-Maintenance-System/
├── backend_fastapi/
│   ├── main.py              # 应用入口（81行）
│   ├── database.py          # 数据库连接与初始化
│   ├── auth.py              # JWT 认证与权限守卫
│   ├── models.py            # Pydantic 请求模型
│   ├── services/
│   │   ├── ai_service.py    # AI 分析引擎
│   │   └── sla_service.py   # SLA 后台巡检
│   ├── routes/
│   │   ├── auth_routes.py   # 注册/登录
│   │   ├── repair_routes.py # 报修 CRUD
│   │   ├── user_routes.py   # 用户管理
│   │   ├── parts_routes.py  # 配件库存
│   │   ├── ai_routes.py     # AI 配置/聊天
│   │   └── ...              # 通知/公告/统计/评价
│   ├── seed_db.py           # 测试数据生成
│   └── uploads/             # 图片上传目录
├── frontend/
│   └── src/
│       ├── pages/           # 页面（LandingPage, Dashboard）
│       ├── components/
│       │   ├── dashboard/   # 角色视图组件（7个）
│       │   ├── shared/      # 共享组件（Badge, 常量等）
│       │   └── custom/      # 业务组件（评论, 评价, 分页等）
│       ├── contexts/        # Auth + Language Context
│       ├── lib/             # API 封装, i18n, 工具函数
│       └── types/           # TypeScript 类型定义
├── dev_mac.sh               # macOS/Linux 一键启动
└── dev_win.bat              # Windows 一键启动
```

---

## 💻 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript + Vite 5 |
| **UI 样式** | Tailwind CSS 4 + Radix UI + Lucide Icons |
| **数据可视化** | Recharts（折线图/柱状图/饼图） |
| **状态管理** | React Context + 自定义 Hooks |
| **国际化** | 自研轻量 i18n（中英双语） |
| **后端框架** | FastAPI + Uvicorn |
| **数据验证** | Pydantic V2 |
| **认证鉴权** | JWT (python-jose) + passlib |
| **数据库** | SQLite（零依赖，单文件部署） |
| **AI 能力** | Ollama Llama3 / OpenAI 兼容 API + 关键词规则引擎 |

---

## 🚀 快速启动

### 环境要求

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **npm** ≥ 8

### 一键启动

**macOS / Linux：**
```bash
git clone https://github.com/your-username/Dormitory-Maintenance-System.git
cd Dormitory-Maintenance-System
chmod +x dev_mac.sh
./dev_mac.sh
```

**Windows：**
```bat
git clone https://github.com/your-username/Dormitory-Maintenance-System.git
cd Dormitory-Maintenance-System
dev_win.bat
```

### 手动启动

```bash
# 1. 安装后端依赖
cd backend_fastapi
python -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt

# 2. 启动后端
python -m uvicorn main:app --reload --port 8000

# 3. 新终端，安装并启动前端
cd frontend
npm install
npm run dev
```

### 生成测试数据

```bash
cd backend_fastapi
python seed_db.py
```

生成 4 个测试账号：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@dorm.edu | admin123 |
| 学生 | student@dorm.edu | student123 |
| 维修员（水电） | tech1@dorm.edu | tech123 |
| 维修员（家具+网络） | tech2@dorm.edu | tech123 |

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:5173 |
| API 文档 (Swagger) | http://127.0.0.1:8000/docs |

---

## 🔑 角色与权限

系统采用 JWT 鉴权，三种角色权限隔离：

| 功能 | 学生 | 维修员 | 管理员 |
|------|:----:|:------:|:------:|
| 提交报修 | ✅ | ❌ | ❌ |
| 查看自己的报修 | ✅ | ❌ | ✅ |
| 查看分配的任务 | ❌ | ✅ | ✅ |
| 审批/指派工单 | ❌ | ❌ | ✅ |
| 更新维修状态 | ❌ | ✅ | ✅ |
| 评价工单 | ✅ | ❌ | ❌ |
| 数据统计大屏 | ✅ (个人) | ✅ (个人) | ✅ (全局) |
| 用户管理 | ❌ | ❌ | ✅ |
| 配件库存管理 | ❌ | ❌ | ✅ |
| AI 配置管理 | ❌ | ❌ | ✅ |
| 公告管理 | ❌ | ❌ | ✅ |
| CSV 导出 | ❌ | ❌ | ✅ |

---

## 📸 运行效果

> 💡 启动项目后访问 http://localhost:5173 即可体验。以下为各角色核心页面说明：

### 落地页
- 响应式着陆页，展示系统特性与 CTA 按钮

### 学生仪表盘
- 提交报修表单（支持 5 张图片上传 + AI 视觉预检）
- 个人报修列表（分页 + 状态筛选）
- 工单详情（SLA 倒计时 + 时间轴评论 + 配件消耗明细）

### 维修员仪表盘
- 任务列表（待处理/进行中/已完成分类）
- 绩效面板（任务统计 + 平均评分）

### 管理员仪表盘
- 数据大屏（7 项核心指标 + 趋势图 + 类型饼图 + 配件消耗排行）
- 工单管理（状态筛选 + 审批/指派/驳回）
- 用户管理（技能标签编辑）
- AI 配置中心（多引擎切换 + 连接测试）

### AI 助手「宿宝」
- 右下角悬浮聊天窗口
- 快捷问题芯片
- 支持 Markdown 渲染

---

## 🗄️ 数据库设计

系统使用 SQLite，共 9 张表：

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `users` | 用户表 | role, skills（维修员技能标签） |
| `repairs` | 报修工单表 | status, priority, slaDueDate, aiCategory |
| `reviews` | 评价表 | rating, comment |
| `comments` | 工单评论表 | repairId, userId, content |
| `notifications` | 通知表 | type, relatedId, isRead |
| `announcements` | 公告表 | title, content, authorId |
| `parts` | 配件库存表 | name, price, stock |
| `repair_parts` | 配件消耗记录 | repairId, partId, quantity, price |
| `ai_configs` | AI 引擎配置 | provider, apiKey, model, isActive |

### 工单状态流转

```
pending ──→ approved ──→ in_progress ──→ completed ──→ pending_evaluation ──→ closed
   │
   └──→ rejected
```

---

## 📡 API 概览

共 28+ 个 RESTful API 端点，启动后访问 http://127.0.0.1:8000/docs 查看完整文档。

| 模块 | 端点示例 | 说明 |
|------|----------|------|
| 认证 | `POST /api/register` `POST /api/login` | 注册/登录 |
| 报修 | `GET /api/repairs` `POST /api/repairs` | 报修 CRUD |
| 状态 | `PATCH /api/repairs/{id}/status` | 工单状态流转 |
| 评价 | `POST /api/repairs/{id}/evaluate` | 五星评价 |
| 评论 | `GET/POST /api/repairs/{id}/comments` | 时间轴留言 |
| 统计 | `GET /api/stats` | 数据大屏 |
| 配件 | `GET/POST /api/parts` | 配件库存管理 |
| AI | `POST /api/chat` `POST /api/repairs/analyze-image` | AI 聊天/图片分析 |
| 导出 | `GET /api/repairs/export` | CSV 导出 |

---

## 🌐 国际化

系统内置中英文双语支持，点击页面右上角 🌐 即可切换。翻译文件位于 `frontend/src/lib/i18n.ts`。

---

## 📝 设计亮点

1. **零外部依赖的 AI 方案** — 无需 GPU 服务器，Ollama 本地推理 + 关键词降级引擎，开箱即用
2. **SLA 后台自动巡检** — 异步任务每 60 秒检测，多级预警通知，企业级运维思维
3. **状态机硬约束** — 后端严格校验状态流转路径，杜绝非法跳转
4. **维修记录强制填写** — 完工时必须输入维修细节，确保数据完整性
5. **技能标签 + 负载均衡派单** — 不是随机分配，而是按技能匹配 + 空闲度排序
6. **配件库存联动** — 维修消耗自动扣减库存，管理员可追踪物料成本

---

## 📄 License

MIT License

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star 支持一下！**

</div>
