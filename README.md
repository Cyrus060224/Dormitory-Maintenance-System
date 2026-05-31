# Dorm Repair System | 宿舍报修管理系统

一个基于 **FastAPI + SQLite + React/Vite** 的宿舍报修系统，覆盖学生报修、管理员审批派单、维修员处理、学生评价的完整闭环。

> 当前主线是 `backend_fastapi`。`backend` 目录中的 Express/PostgreSQL 版本保留为历史/备用实现，本地演示和后续优化优先使用 FastAPI 版本。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、React Router、Sonner、Lucide |
| 后端 | FastAPI、Uvicorn、Pydantic、python-jose、passlib |
| 数据库 | SQLite，本地文件默认位于 `backend_fastapi/dorm.db` |
| 鉴权 | JWT Bearer Token，角色包含 `student`、`technician`、`admin` |

## 核心流程

1. 学生注册/登录后提交报修申请。
2. 管理员查看全部工单，审核、拒绝或分配维修员。
3. 维修员只能看到分配给自己的任务，并更新为维修中或完成。
4. 维修完成后工单进入待评价，学生提交评分和反馈。
5. 评价后工单结案，统计面板展示实时数据。

状态流转：

```text
pending -> approved -> in_progress -> pending_evaluation -> closed
pending -> rejected
```

## 快速启动

### Windows

```bat
dev_win.bat
```

### macOS / Linux

```bash
chmod +x dev_mac.sh
./dev_mac.sh
```

### npm 脚本

```bash
npm run install:all
npm run dev
```

启动后访问：

| 服务 | 地址 |
| --- | --- |
| 前端 | http://localhost:5173 |
| FastAPI 文档 | http://127.0.0.1:8000/docs |

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

```env
JWT_SECRET=dorm-repair-secret-key-change-in-production
TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# DB_PATH=backend_fastapi/dorm.db
# VITE_API_BASE_URL=http://127.0.0.1:8000
```

开发模式下，前端通过 Vite proxy 将 `/api` 转发到 `http://127.0.0.1:8000`，通常不需要设置 `VITE_API_BASE_URL`。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/register` | 注册用户 |
| `POST` | `/api/login` | 登录并返回 JWT |
| `GET` | `/api/users/me` | 获取当前用户 |
| `GET` | `/api/repairs` | 按角色获取工单列表 |
| `POST` | `/api/repairs` | 学生提交报修 |
| `PATCH` | `/api/repairs/{id}/status` | 管理员/维修员更新工单 |
| `POST` | `/api/repairs/{id}/evaluate` | 学生评价并结案 |
| `GET` | `/api/stats` | 获取统计数据 |
| `GET` | `/api/users` | 管理员获取用户列表 |
| `GET` | `/api/users/technicians` | 管理员获取维修员列表 |
| `DELETE` | `/api/users/{id}` | 管理员删除用户 |

受保护接口需要请求头：

```http
Authorization: Bearer <token>
```

## 数据表

| 表 | 说明 |
| --- | --- |
| `users` | 用户、角色、联系方式、宿舍信息 |
| `repairs` | 报修工单、状态、派单、维修记录、评价字段 |
| `reviews` | 服务评价记录，保留兼容独立评价查询 |

## 工程说明

- `frontend` 是 React/Vite 单页应用。
- `backend_fastapi` 是当前主线后端。
- `backend` 是 Express/PostgreSQL 历史实现，暂不作为默认启动路径。
- `vercel.json` 仍指向旧的 Express 部署入口，当前仅保留为后续部署专项的参考，不建议直接用于本轮 FastAPI 演示部署。

## 常用检查

```bash
cd frontend
npm run typecheck
npm run build
```

后端可通过 `http://127.0.0.1:8000/docs` 使用 Swagger UI 做接口冒烟测试。
