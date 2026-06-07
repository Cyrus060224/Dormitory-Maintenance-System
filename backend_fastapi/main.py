import os
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from database import UPLOAD_DIR, DB_PATH, init_db
from services.sla_service import check_sla_compliance_loop
from routes import (
    auth_routes,
    repair_routes,
    user_routes,
    parts_routes,
    review_routes,
    notification_routes,
    announcement_routes,
    stats_routes,
    ai_routes,
)

app = FastAPI(title="Dorm Repair API")

# 保持对后台任务的引用，防止被 GC 回收
_sla_task: asyncio.Task | None = None

# Ensure uploads directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount static uploads hosting
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "请求处理失败"
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": message, "data": None},
    )


# Include all route modules
for mod in [
    auth_routes,
    repair_routes,
    user_routes,
    parts_routes,
    review_routes,
    notification_routes,
    announcement_routes,
    stats_routes,
    ai_routes,
]:
    app.include_router(mod.router)


def _sla_task_done_callback(task: asyncio.Task):
    """后台 SLA 任务异常回调——防止异常被静默吞没"""
    if task.cancelled():
        return
    exc = task.exception()
    if exc:
        print(f"[SLA] 后台任务异常退出: {exc}")


@app.on_event("startup")
def on_startup():
    global _sla_task
    db_existed = os.path.exists(DB_PATH)
    init_db()
    if not db_existed:
        print("数据库已重置，请重新开始注册第一个账号。")
    else:
        print(f"数据库已就绪：{DB_PATH}")

    # 启动后台异步任务，绑定引用 + 异常回调
    _sla_task = asyncio.create_task(check_sla_compliance_loop())
    _sla_task.add_done_callback(_sla_task_done_callback)
