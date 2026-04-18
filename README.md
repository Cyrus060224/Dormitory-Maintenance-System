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

- **角色问题（已修复 v3 - 最终方案）**: 
  - `AuthContext` 完全重构：`login()` 改为**同步函数**，完全信任 JWT payload，不再调用 `/api/auth/me`
  - 初始加载也改为纯 JWT 解码，不发起任何 API 请求，彻底消除竞态条件
  - JWT token 包含 `name` 字段：`{ userId, name, email, role }`
  - 后端 signup/login 路由确保 role 正确写入 JWT
- **注册失败（已修复 v3）**: 
  - 根本原因：旧版 `login()` 是 async，内部调用 `/api/auth/me` 失败时会清除 token 导致注册失败
  - 修复：`login()` 改为同步，直接从 JWT 解码用户信息，无任何 API 调用
  - `Signup.tsx` 和 `Login.tsx` 中的 `await login()` 改为同步调用 `login()`
- **报修提交失败（已修复 v2）**: 
  - 移除 `requireRole('student')` 中间件，改为路由内部手动检查 `user.role !== 'student'`
  - 添加详细日志便于调试
  - 前端显示具体错误信息（含 HTTP 状态码）
- **构建错误修复（已修复 v3）**:
  - `backend/db/schema.ts` 移除 `drizzle-zod` 的 `createInsertSchema`，改用手动 `z.object()` 定义，解决 drizzle-orm 版本不兼容的 TS2345 错误
  - `backend/middleware/auth.ts` 将 `req.user` 改为 `req.authUser`（自定义字段），避免与 `@types/express` 内置 `Express.User` 类型冲突导致的 TS2769 错误
  - `frontend/tsconfig.json` 移除 `"types": ["vite/client"]`，改放到 `tsconfig.app.json`，解决 `tsc -b` 时的 TS2688 错误
  - `frontend/package.json` 将 `eslint-plugin-react-hooks` 从 RC 版本 `^5.1.0-rc.0` 更新为稳定版 `^5.0.0`，解决 ESLint 找不到包的错误
  - `backend/routes/reviews.ts` 移除 `insertReviewSchema.omit()` 用法，改用独立 `z.object()` 避免 TS2352 类型转换错误

## 构建配置说明

- `tsconfig.json` - 主编译配置（无 project references），`tsc -b` 直接编译
- `tsconfig.app.json` - 继承主配置，仅包含 `src`（用于 IDE）
- `tsconfig.node.json` - 独立配置，用于 `vite.config.ts`（含 node types）
- `vite.config.ts` - 使用 `fileURLToPath(import.meta.url)` 替代 `__dirname`（ESM 兼容）
- `package.json` lint 脚本 - 使用 `cd frontend && npm run lint`（使用本地 eslint）

## 代码生成规范

- 所有 API 响应格式: `{ success: boolean, data: T, message?: string }`
- 前端 fetch 使用 `Authorization: Bearer <token>` header
- 路由使用 HashRouter，navigate 使用 `/path`（无需 `/#` 前缀）
- 数据库使用 `drizzle-orm/postgres-js` + `postgres` 驱动
- 禁止使用 `import.meta.url` 或 `fileURLToPath`
