# Dorm Repair System | 宿舍报修管理系统

> 一个基于 **FastAPI + React** 的全栈宿舍报修系统，实现学生在线报修、管理员智能分配、维修员高效处理的完整业务闭环。

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [核心功能](#核心功能)
- [工程实践记录](#工程实践记录)
- [快速启动](#快速启动)
- [API 接口文档](#api-接口文档)
- [数据库设计](#数据库设计)
- [项目结构](#项目结构)
- [FAQ](#faq)

---

## 项目简介

**Dorm Repair System** 是一套面向高校宿舍管理的报修业务平台，覆盖以下核心角色场景：

| 角色 | 功能 |
|------|------|
| **学生** | 提交报修申请、查看处理进度、完成服务评价 |
| **管理员** | 审核报修单、分配维修人员、全局数据统计、用户管理 |
| **维修员** | 查看分配任务、更新维修状态、填写维修记录 |

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| [React](https://react.dev/) | 18.3 | UI 组件库 |
| [TypeScript](https://www.typescriptlang.org/) | 5.5 | 类型安全 |
| [Vite](https://vitejs.dev/) | 5.3 | 构建工具 & 开发服务器 |
| [TailwindCSS](https://tailwindcss.com/) | 4.0 | 原子化 CSS 框架 |
| [Radix UI](https://www.radix-ui.com/) | 1.x | 无障碍 UI 原语 |
| [Lucide React](https://lucide.dev/) | 0.400 | 图标库 |
| [Sonner](https://sonner.emilkowal.ski/) | 1.5 | Toast 通知 |
| [Zustand](https://zustand-demo.pmnd.rs/) | 4.5 | 状态管理 |
| [Zod](https://zod.dev/) | 3.25 | 表单验证 |
| [React Router](https://reactrouter.com/) | 6.24 | 路由管理 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| [FastAPI](https://fastapi.tiangolo.com/) | 0.100+ | 高性能异步 Web 框架 |
| [Uvicorn](https://www.uvicorn.org/) | - | ASGI 服务器 |
| [python-jose](https://python-jose.readthedocs.io/) | - | JWT Token 签发与验证 |
| [passlib](https://passlib.readthedocs.io/) | - | 密码哈希 (SHA256-Crypt) |
| [Pydantic](https://docs.pydantic.dev/) | - | 数据验证与序列化 |

### 数据库

| 技术 | 版本 | 用途 |
|------|------|------|
| [SQLite](https://www.sqlite.org/) | 3.x | 轻量级嵌入式关系数据库 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  React 18 + TypeScript + Vite (Port 5173)              ││
│  │  ├── Student View   ├── Technician View  ├── Admin View ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + JWT Bearer Token
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Server (FastAPI)                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Uvicorn ASGI Server (Port 8000)                       ││
│  │  ├── JWT Auth Middleware (Depends)                     ││
│  │  ├── CORS Middleware (localhost:5173)                  ││
│  │  └── RESTful API Routes                                ││
│  │       ├── /api/repairs (CRUD + Role Filter)            ││
│  │       ├── /api/stats  (Real-time Aggregation)          ││
│  │       ├── /api/users  (User Management)                ││
│  │       └── /api/reviews (Service Rating)                ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────┬──────────────────────────────────┘
                           │ sqlite3
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     SQLite Database                         │
│  ├── users   (id, name, email, password, role, ...)        │
│  ├── repairs (id, studentId, assignedTo, status, ...)      │
│  └── reviews (id, requestId, rating, comment, ...)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心功能

### 1. 基于角色的访问控制 (RBAC)

系统通过 **JWT Token** 携带用户角色信息，在后端中间件层统一鉴权，前端根据角色动态渲染不同视图。

| 角色 | 数据可见范围 | 操作权限 |
|------|-------------|----------|
| `student` | 仅自己的报修单 | 提交报修、查看详情、服务评价 |
| `technician` | 分配给自己的任务 | 查看任务、更新状态（进行中/已完成） |
| `admin` | 全部数据 | 审核、分配、统计、用户管理 |

```python
# 后端 JWT 验证中间件
def verify_token(authorization: str = Header(...)) -> dict:
    token = authorization.split(" ", 1)[1]
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    return payload  # 包含 role, userId, name 等
```

### 2. 报修单状态自动流转

```
学生提交 → pending (待处理)
         → admin 审核 → approved (已审核)
         → admin 分配维修员
         → 维修员开始维修 → in_progress (进行中)
         → 维修员完成 → completed (已完成) ✅
         → 学生评价 → reviews
```

状态颜色标识：
- 🟠 `pending` 待处理 → 橙色
- 🔵 `in_progress` 进行中 → 蓝色
- 🟢 `completed` 已完成 → 绿色
- 🔴 `rejected` 已拒绝 → 红色

### 3. 实时数据统计仪表盘

管理员仪表盘从数据库实时聚合数据，包括：

- **报修统计**：总数 / 待处理 / 进行中 / 已完成 / 已拒绝
- **用户统计**：总用户 / 学生 / 维修人员
- **类型分布**：按报修类别 (水管/电路/家具/网络) 分类统计
- **服务评分**：平均评分 + 评价数量

### 4. 前后端字段自动对齐

所有 API 返回数据通过 `LEFT JOIN` 关联用户表，自动填充 `studentName`、`assignedToName` 等展示字段，前端零处理即可渲染。

---

## 工程实践记录

### 跨平台开发环境适配 (Windows + macOS)

#### 问题 1：前端 API 端口 404 错误

**现象**：前端提交报修时请求 `http://localhost:5173/api/repairs`，后端实际运行在 8000 端口。

**根因**：前端 `API` 常量初始值为空字符串 `''`，导致 fetch 请求走相对路径，被 Vite 开发服务器拦截。

**解决方案**：
```typescript
// Before
const API = '';

// After
const API = 'http://127.0.0.1:8000';
```

> **为什么用 `127.0.0.1` 而非 `localhost`？**
> 在 Windows 环境下，`localhost` 可能解析到 IPv6 `::1`，而 FastAPI 默认绑定 `127.0.0.1`（IPv4）。使用 `127.0.0.1` 可消除 DNS 解析歧义，在 Windows 和 macOS 上表现一致。

#### 问题 2：跨域 (CORS) 配置

**现象**：修改 API 地址后，浏览器报 `CORS error`。

**根因**：FastAPI 的 CORS 中间件 `allow_origins` 需要精确匹配前端开发服务器地址。

**解决方案**：
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 默认端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 问题 3：维修人员任务列表不更新

**现象**：维修员登录后任务列表为空。

**根因**：前端 `TechnicianView` 调用的是 `/api/tasks`（占位接口，返回空数组），而非 `/api/repairs`。

**解决方案**：
```typescript
// Before
const res = await fetch(`${API}/api/tasks`, { ... });

// After
const res = await fetch(`${API}/api/repairs`, { ... });
```

同时后端 `GET /api/repairs` 已实现角色过滤：
```sql
-- technician 只能看到分配给自己的任务
SELECT r.*, u.name as studentName, t.name as assignedToName
FROM repairs r
LEFT JOIN users u ON r.studentId = u.id
LEFT JOIN users t ON r.assignedTo = t.id
WHERE r.assignedTo = ?  -- current_user.userId
ORDER BY r.createdAt DESC
```

### Git 跨设备代码同步

本项目使用 **Git** 进行版本控制，支持 Windows 和 macOS 双平台无缝切换：

```bash
# 1. 提交变更
git add .
git commit -m "feat: implement repair status update for technician"

# 2. 推送至远程仓库
git push origin main

# 3. 在另一台设备上拉取最新代码
git pull origin main

# 4. 同步依赖
cd backend_fastapi && pip install -r requirements.txt
cd frontend && npm install
```

> **最佳实践**：每次切换设备后，先执行 `git pull` 再启动服务，避免本地缓存导致的数据不一致。

---

## 快速启动

### 前置要求

| 工具 | 最低版本 | 下载链接 |
|------|---------|---------|
| Python | 3.9+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| npm | 9+ | 随 Node.js 自动安装 |

### 1. 启动后端

```bash
# 进入后端目录
cd backend_fastapi

# 创建虚拟环境 (Windows)
python -m venv .venv
.venv\Scripts\activate

# 创建虚拟环境 (macOS/Linux)
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
python -m uvicorn main:app --reload --port 8000
```

后端服务启动后访问 http://127.0.0.1:8000/docs 可查看自动生成的 API 文档。

### 2. 启动前端

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务启动后访问 http://localhost:5173 即可使用系统。

### 3. 验证部署

| 检查项 | 操作 | 预期结果 |
|--------|------|---------|
| 后端 API | 访问 http://127.0.0.1:8000/docs | 打开 Swagger UI |
| 前端页面 | 访问 http://localhost:5173 | 打开登录页 |
| 跨域通信 | 前端登录后提交报修 | 无 CORS 错误，数据正常写入 |

---

## API 接口文档

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 用户注册 |
| POST | `/api/login` | 用户登录，返回 JWT Token |

### 报修管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/repairs` | 全部角色 | 获取报修列表（按角色过滤） |
| POST | `/api/repairs` | student | 提交报修申请 |
| PATCH | `/api/repairs/{id}/status` | admin/technician | 更新报修状态 |

### 统计与用户

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/stats` | 全部角色 | 获取实时统计数据 |
| GET | `/api/users` | - | 获取用户列表 |
| GET | `/api/users/technicians` | - | 获取维修人员列表 |
| DELETE | `/api/users/{id}` | - | 删除用户 |

### 评价

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/reviews` | student | 提交服务评价 |

> 所有受保护接口需在 Header 中携带 `Authorization: Bearer <token>`

---

## 数据库设计

### users 表

```sql
CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'student',
    studentId   TEXT,
    dormRoom    TEXT,
    phone       TEXT,
    createdAt   TEXT NOT NULL
);
```

### repairs 表

```sql
CREATE TABLE repairs (
    id          TEXT PRIMARY KEY,
    studentId   TEXT NOT NULL,
    dormBuilding TEXT NOT NULL,
    dormRoom    TEXT NOT NULL,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    imageUrl    TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    priority    TEXT NOT NULL DEFAULT 'normal',
    assignedTo  TEXT,
    adminNote   TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
);
```

### reviews 表

```sql
CREATE TABLE reviews (
    id          TEXT PRIMARY KEY,
    requestId   TEXT NOT NULL,
    studentId   TEXT NOT NULL,
    rating      INTEGER NOT NULL,
    comment     TEXT,
    createdAt   TEXT NOT NULL
);
```

---

## 项目结构

```
product---/
├── backend_fastapi/
│   ├── main.py                 # FastAPI 应用入口 & 全部路由
│   ├── requirements.txt        # Python 依赖
│   └── dorm.db                 # SQLite 数据库 (运行时自动生成)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── Index.tsx       # 主页面 (Student/Technician/Admin 视图)
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx # JWT 认证上下文
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript 类型定义
│   │   └── lib/
│   │       └── utils.ts        # 工具函数
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── README.md
```

---

## FAQ

**Q: 首次运行需要初始化数据库吗？**
A: 不需要。后端启动时会自动执行 `init_db()`，如果 `dorm.db` 不存在则自动创建所有表。

**Q: 如何在 Windows 和 macOS 之间切换开发？**
A: 只需 `git pull` 同步代码，然后重新安装依赖并启动服务即可。数据库文件 `dorm.db` 已加入 `.gitignore`，不会跨设备同步。

**Q: JWT Token 过期了怎么办？**
A: Token 默认有效期 1440 分钟（24 小时）。过期后前端会提示重新登录。

**Q: 如何重置数据库？**
A: 删除 `backend_fastapi/dorm.db` 文件，重启后端服务即可重新初始化。

**Q: 生产环境如何部署？**
A:
- 后端：使用 `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4`
- 前端：执行 `npm run build` 生成静态文件，使用 Nginx 或 CDN 部署

---

## License

[MIT](LICENSE)
