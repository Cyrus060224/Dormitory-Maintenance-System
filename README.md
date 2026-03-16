# 宿舍报修系统

## 项目概述

基于 Web 的宿舍报修系统，支持学生在线报修、维修人员任务管理、管理员审核分配和数据统计的完整闭环。

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS v4 + shadcn/ui + React Router (HashRouter)
- **后端**: Express.js + TypeScript + Drizzle ORM + PostgreSQL (postgres.js)
- **认证**: JWT (jsonwebtoken) + bcryptjs
- **验证**: Zod

## 项目结构

```
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # 路由配置 + AuthProvider
│   │   ├── main.tsx                   # 入口文件
│   │   ├── index.css                  # Tailwind v4 主题
│   │   ├── pages/
│   │   │   └── Index.tsx              # 主应用（学生/维修员/管理员视图）
│   │   ├── components/
│   │   │   ├── custom/
│   │   │   │   ├── Login.tsx          # 登录页
│   │   │   │   └── Signup.tsx         # 注册页（含角色选择）
│   │   │   └── ui/                    # shadcn/ui 组件
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx        # 认证上下文
│   │   ├── types/
│   │   │   └── index.ts               # 全局类型定义
│   │   ├── config/
│   │   │   └── constants.ts           # API_BASE_URL 等常量
│   │   └── lib/
│   │       └── utils.ts               # cn() 工具函数
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── index.ts                   # Express 服务器入口
│   │   ├── db/
│   │   │   ├── index.ts               # Drizzle 数据库连接
│   │   │   ├── schema.ts              # 数据库表定义 + Zod schemas
│   │   │   ├── migrate.ts             # 迁移脚本
│   │   │   └── migrations/
│   │   │       └── 1773650094510_init.sql
│   │   ├── middleware/
│   │   │   └── auth.ts                # JWT 认证中间件
│   │   └── routes/
│   │       ├── auth.ts                # /api/auth/* (login/signup/me)
│   │       ├── repairs.ts             # /api/repairs/*
│   │       ├── tasks.ts               # /api/tasks/*
│   │       ├── reviews.ts             # /api/reviews/*
│   │       ├── stats.ts               # /api/stats
│   │       └── users.ts               # /api/users/*
│   └── package.json
└── package.json
```

## 用户角色

| 角色 | 功能 |
|------|------|
| **学生** | 提交报修申请、查看进度、完成后评价 |
| **维修人员** | 查看分配任务、更新维修状态、填写维修记录 |
| **管理员** | 审核报修、分配维修员、查看统计数据、管理用户 |

## 数据库表

- `users` - 用户（学生/维修员/管理员）
- `repair_requests` - 报修申请
- `repair_tasks` - 维修任务（关联报修单和维修员）
- `reviews` - 服务评价

## API 路由

- `POST /api/auth/signup` - 注册（支持 role: student/technician/admin）
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户
- `GET/POST /api/repairs` - 报修列表/提交报修
- `PATCH /api/repairs/:id/status` - 管理员审核分配
- `GET/PATCH /api/tasks` - 维修任务列表/更新状态
- `POST /api/reviews` - 提交评价
- `GET /api/stats` - 统计数据
- `GET /api/users` - 用户列表
- `GET /api/users/technicians` - 维修员列表
- `DELETE /api/users/:id` - 删除用户

## 关键修复说明

- **角色问题**: 注册时选择的角色通过 `role` 字段存入数据库，JWT token 包含 `role`，AuthContext 从 `/api/auth/me` 获取完整用户信息（含 role），Index.tsx 根据 `user.role` 渲染对应视图
- **报修提交失败**: 后端 `/api/repairs` POST 路由正确解析请求体，使用 `requireRole('student')` 中间件，Zod 验证 omit 掉 studentId/assignedTo/status 字段，从 JWT 中获取 studentId

## 代码生成规范

- 所有 API 响应格式: `{ success: boolean, data: T, message?: string }`
- 前端 fetch 使用 `Authorization: Bearer <token>` header
- 路由使用 HashRouter，navigate 使用 `/path`（无需 `/#` 前缀）
- 数据库使用 `drizzle-orm/postgres-js` + `postgres` 驱动
- 禁止使用 `import.meta.url` 或 `fileURLToPath`
