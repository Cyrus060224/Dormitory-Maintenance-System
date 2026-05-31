import sqlite3
import time
import os
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Dorm Repair API")

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

# ─── Password hashing ───────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# ─── JWT settings ───────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "dorm-repair-system-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "1440"))

def create_access_token(user_id: str, name: str, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "userId": user_id,
        "name": name,
        "email": email,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")


def require_admin(current_user: dict = Depends(verify_token)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user

# ─── Database ───────────────────────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "dorm.db"))


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化数据库表结构"""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            studentId TEXT,
            dormRoom TEXT,
            phone TEXT,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repairs (
            id TEXT PRIMARY KEY,
            studentId TEXT NOT NULL,
            dormBuilding TEXT NOT NULL,
            dormRoom TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            imageUrl TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            priority TEXT NOT NULL DEFAULT 'normal',
            assignedTo TEXT,
            adminNote TEXT,
            workNote TEXT,
            rating INTEGER,
            feedbackTags TEXT,
            feedbackText TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            requestId TEXT NOT NULL,
            studentId TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT,
            createdAt TEXT NOT NULL
        )
    """)

    # 数据库迁移：为已有数据库添加新字段
    migration_add_columns(conn)

    conn.commit()
    conn.close()


def migration_add_columns(conn: sqlite3.Connection):
    """为已有数据库添加评价相关字段（SQLite 不支持直接 ADD COLUMN IF NOT EXISTS）"""
    try:
        # 检查 rating 字段是否存在
        columns = [row[1] for row in conn.execute("PRAGMA table_info(repairs)").fetchall()]
        if 'rating' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN rating INTEGER")
        if 'feedbackTags' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN feedbackTags TEXT")
        if 'feedbackText' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN feedbackText TEXT")
        if 'workNote' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN workNote TEXT")
    except Exception as e:
        print(f"[Migration] Error: {e}")


# ─── 状态机定义 ───────────────────────────────────────────────────────────
# 状态流转: pending -> approved -> in_progress -> completed -> pending_evaluation -> closed
# 也可能: pending -> rejected
VALID_STATUSES = {'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'}
STATUS_LABELS = {
    'pending': '待处理',
    'approved': '已审核',
    'in_progress': '维修中',
    'completed': '已完成',
    'pending_evaluation': '待评价',
    'closed': '已结案',
    'rejected': '已拒绝',
}


@app.on_event("startup")
def on_startup():
    db_existed = os.path.exists(DB_PATH)
    init_db()
    if not db_existed:
        print("数据库已重置，请重新开始注册第一个账号。")
    else:
        print(f"数据库已就绪：{DB_PATH}")

# ─── Pydantic Models ────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    confirmPassword: Optional[str] = None
    role: Optional[str] = None
    studentId: Optional[str] = None
    dormRoom: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateRepairRequest(BaseModel):
    dormBuilding: str
    dormRoom: str
    category: str
    description: str
    priority: str = "normal"
    imageUrl: Optional[str] = None


class UpdateRepairStatus(BaseModel):
    status: Optional[str] = None
    assignedTo: Optional[str] = None
    adminNote: Optional[str] = None
    workNote: Optional[str] = None


# ─── Auth Endpoints ─────────────────────────────────────────────────────────────
@app.post("/api/register")
async def register(payload: SignupRequest):
    if not payload.name or not payload.email or not payload.password or not payload.confirmPassword:
        raise HTTPException(status_code=400, detail="请填写所有必填项")
    if payload.password != payload.confirmPassword:
        raise HTTPException(status_code=400, detail="两次输入的密码不一致")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要6个字符")
    if payload.role not in ("student", "technician", "admin", None):
        raise HTTPException(status_code=400, detail="账户类型无效")

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (payload.email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="该邮箱已被注册")

    user_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    hashed_password = pwd_context.hash(payload.password or "")
    conn.execute(
        "INSERT INTO users (id, name, email, password, role, studentId, dormRoom, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, payload.name, payload.email, hashed_password, payload.role or "student",
         payload.studentId, payload.dormRoom, payload.phone, now),
    )
    conn.commit()
    conn.close()
    print(f"[/api/register] User registered: {payload.name} ({payload.email})")
    return JSONResponse(
        status_code=201,
        content={"status": "success", "success": True, "message": "注册成功", "data": None},
    )


@app.post("/api/login")
async def login(payload: LoginRequest):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    password_match = pwd_context.verify(payload.password, user["password"])
    if not password_match:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_access_token(user["id"], user["name"], user["email"], user["role"])
    print(f"[/api/login] Login successful: {user['name']} ({user['email']})")
    return {
        "status": "success",
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "studentId": user["studentId"],
            "dormRoom": user["dormRoom"],
            "phone": user["phone"],
        },
    }

# ─── Repair Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/repairs")
async def get_repairs(current_user: dict = Depends(verify_token)):
    conn = get_db()
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    if role == "admin":
        rows = conn.execute("""
            SELECT r.*, 
                   u.name as studentName,
                   t.name as assignedToName
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            ORDER BY r.createdAt DESC
        """).fetchall()
    elif role == "technician":
        rows = conn.execute("""
            SELECT r.*, 
                   u.name as studentName,
                   t.name as assignedToName
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            WHERE r.assignedTo = ?
            ORDER BY r.createdAt DESC
        """, (user_id,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT r.*, 
                   u.name as studentName,
                   t.name as assignedToName
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            WHERE r.studentId = ?
            ORDER BY r.createdAt DESC
        """, (user_id,)).fetchall()
    conn.close()
    data = [dict(r) for r in rows]
    return {"success": True, "data": data}


@app.post("/api/repairs")
async def create_repair(payload: CreateRepairRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    role = current_user.get("role", "student")

    if role != "student":
        raise HTTPException(status_code=403, detail="只有学生可以提交报修申请")

    if payload.category not in ("water", "electricity", "furniture", "network", "other"):
        raise HTTPException(status_code=400, detail="报修类型无效")

    if payload.priority not in ("low", "normal", "high", "urgent"):
        raise HTTPException(status_code=400, detail="优先级无效")

    if not payload.dormBuilding.strip() or not payload.dormRoom.strip() or not payload.description.strip():
        raise HTTPException(status_code=400, detail="请填写所有必填项")

    if len(payload.description.strip()) < 5:
        raise HTTPException(status_code=400, detail="问题描述至少需要5个字")

    repair_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    conn = get_db()
    conn.execute(
        """INSERT INTO repairs 
           (id, studentId, dormBuilding, dormRoom, category, description, imageUrl, status, priority, assignedTo, adminNote, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (repair_id, user_id, payload.dormBuilding, payload.dormRoom, payload.category,
         payload.description, payload.imageUrl, "pending", payload.priority, None, None, now, now),
    )
    conn.commit()

    row = conn.execute("""
        SELECT r.*, 
               u.name as studentName,
               t.name as assignedToName
        FROM repairs r
        LEFT JOIN users u ON r.studentId = u.id
        LEFT JOIN users t ON r.assignedTo = t.id
        WHERE r.id = ?
    """, (repair_id,)).fetchone()
    conn.close()

    print(f"[/api/repairs] Repair created: {repair_id} by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}


@app.patch("/api/repairs/{repair_id}/status")
async def update_repair_status(repair_id: str, payload: UpdateRepairStatus, current_user: dict = Depends(verify_token)):
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    conn = get_db()
    existing = conn.execute("SELECT * FROM repairs WHERE id = ?", (repair_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="报修记录不存在")

    if role == "student":
        conn.close()
        raise HTTPException(status_code=403, detail="学生无法更新报修状态")

    if payload.status and payload.status not in VALID_STATUSES:
        conn.close()
        raise HTTPException(status_code=400, detail="工单状态无效")

    if role == "technician":
        if existing["assignedTo"] != user_id:
            conn.close()
            raise HTTPException(status_code=403, detail="只能更新自己分配到的任务")
        if existing["status"] not in ("approved", "in_progress"):
            conn.close()
            raise HTTPException(status_code=400, detail="当前状态不允许维修员更新")
        if payload.status not in ("in_progress", "completed"):
            conn.close()
            raise HTTPException(status_code=400, detail="维修人员只能将状态更新为维修中或已完成")
        # 维修员提交完成时，状态自动变为 pending_evaluation（待学生评价）
        if payload.status == "completed":
            payload.status = "pending_evaluation"

    if role == "admin":
        if payload.assignedTo:
            technician = conn.execute(
                "SELECT id FROM users WHERE id = ? AND role = 'technician'",
                (payload.assignedTo,),
            ).fetchone()
            if not technician:
                conn.close()
                raise HTTPException(status_code=400, detail="请选择有效的维修人员")
        if payload.status == "completed":
            payload.status = "pending_evaluation"
        if payload.status in ("in_progress", "pending_evaluation") and not (payload.assignedTo or existing["assignedTo"]):
            conn.close()
            raise HTTPException(status_code=400, detail="请先分配维修人员")

    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    updates = []
    values = []

    if payload.status is not None:
        updates.append("status = ?")
        values.append(payload.status)

    if role == "admin":
        if payload.assignedTo is not None:
            updates.append("assignedTo = ?")
            values.append(payload.assignedTo if payload.assignedTo else None)
        if payload.adminNote is not None:
            updates.append("adminNote = ?")
            values.append(payload.adminNote)
    elif role == "technician" and payload.workNote is not None:
        updates.append("workNote = ?")
        values.append(payload.workNote)

    if len(updates) == 0:
        conn.close()
        raise HTTPException(status_code=400, detail="没有可更新的内容")

    updates.append("updatedAt = ?")
    values.append(now)
    values.append(repair_id)

    conn.execute(f"UPDATE repairs SET {', '.join(updates)} WHERE id = ?", values)
    conn.commit()

    row = conn.execute("""
        SELECT r.*, 
               u.name as studentName,
               t.name as assignedToName
        FROM repairs r
        LEFT JOIN users u ON r.studentId = u.id
        LEFT JOIN users t ON r.assignedTo = t.id
        WHERE r.id = ?
    """, (repair_id,)).fetchone()
    conn.close()

    print(f"[/api/repairs/{repair_id}] Status updated by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}


# ─── Task Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/tasks")
async def get_tasks(current_user: dict = Depends(verify_token)):
    if current_user.get("role") != "technician":
        raise HTTPException(status_code=403, detail="只有维修人员可以查看任务列表")
    return await get_repairs(current_user)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, payload: UpdateRepairStatus, current_user: dict = Depends(verify_token)):
    return await update_repair_status(task_id, payload, current_user)


# ─── Stats Endpoint (real data from database) ───────────────────────────────────
@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(verify_token)):
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    conn = get_db()

    if role == "admin":
        total = conn.execute("SELECT COUNT(*) FROM repairs").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'pending'").fetchone()[0]
        in_progress = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'in_progress'").fetchone()[0]
        completed = conn.execute("SELECT COUNT(*) FROM repairs WHERE status IN ('completed', 'pending_evaluation', 'closed')").fetchone()[0]
        rejected = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'rejected'").fetchone()[0]
        category_rows = conn.execute("SELECT category, COUNT(*) as count FROM repairs GROUP BY category").fetchall()
    elif role == "technician":
        total = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ?", (user_id,)).fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status = 'pending'", (user_id,)).fetchone()[0]
        in_progress = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status = 'in_progress'", (user_id,)).fetchone()[0]
        completed = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status IN ('completed', 'pending_evaluation', 'closed')", (user_id,)).fetchone()[0]
        rejected = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status = 'rejected'", (user_id,)).fetchone()[0]
        category_rows = conn.execute("SELECT category, COUNT(*) as count FROM repairs WHERE assignedTo = ? GROUP BY category", (user_id,)).fetchall()
    else:
        total = conn.execute("SELECT COUNT(*) FROM repairs WHERE studentId = ?", (user_id,)).fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM repairs WHERE studentId = ? AND status = 'pending'", (user_id,)).fetchone()[0]
        in_progress = conn.execute("SELECT COUNT(*) FROM repairs WHERE studentId = ? AND status = 'in_progress'", (user_id,)).fetchone()[0]
        completed = conn.execute("SELECT COUNT(*) FROM repairs WHERE studentId = ? AND status IN ('completed', 'pending_evaluation', 'closed')", (user_id,)).fetchone()[0]
        rejected = conn.execute("SELECT COUNT(*) FROM repairs WHERE studentId = ? AND status = 'rejected'", (user_id,)).fetchone()[0]
        category_rows = conn.execute("SELECT category, COUNT(*) as count FROM repairs WHERE studentId = ? GROUP BY category", (user_id,)).fetchall()

    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    student_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'student'").fetchone()[0]
    technician_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'technician'").fetchone()[0]
    reviews = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
    avg_rating_row = conn.execute("SELECT AVG(rating) FROM reviews").fetchone()[0]
    conn.close()

    category_stats = [{"category": r["category"], "count": r["count"]} for r in category_rows]

    return {
        "success": True,
        "data": {
            "totalRequests": total,
            "pendingRequests": pending,
            "inProgressRequests": in_progress,
            "completedRequests": completed,
            "rejectedRequests": rejected,
            "totalUsers": total_users,
            "studentCount": student_count,
            "technicianCount": technician_count,
            "categoryStats": category_stats,
            "avgRating": f"{avg_rating_row or 0:.1f}",
            "reviewCount": reviews,
        },
    }


# ─── User Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/users")
async def get_users(_current_user: dict = Depends(require_admin)):
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users ORDER BY createdAt DESC").fetchall()
    conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.get("/api/users/technicians")
async def get_technicians(_current_user: dict = Depends(require_admin)):
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, role FROM users WHERE role = 'technician'").fetchall()
    conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    if user_id == current_user.get("userId"):
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    conn = get_db()
    result = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True, "data": None}


@app.get("/api/users/me")
async def get_current_user(current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    user = conn.execute(
        "SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True, "data": dict(user)}


class CreateReviewRequest(BaseModel):
    requestId: str
    rating: int
    comment: Optional[str] = None


class EvaluateRequest(BaseModel):
    """学生评价请求模型"""
    rating: int
    feedbackTags: Optional[str] = None  # 逗号分隔的标签字符串
    feedbackText: Optional[str] = None


@app.post("/api/repairs/{repair_id}/evaluate")
async def evaluate_repair(repair_id: str, payload: EvaluateRequest, current_user: dict = Depends(verify_token)):
    """学生评价工单接口 - 将工单状态从 pending_evaluation 更新为 closed"""
    user_id = current_user.get("userId", "")
    role = current_user.get("role", "student")

    if role != "student":
        raise HTTPException(status_code=403, detail="只有学生可以评价")

    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="评分必须在1-5之间")

    conn = get_db()
    existing = conn.execute("SELECT * FROM repairs WHERE id = ?", (repair_id,)).fetchone()

    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="报修记录不存在")

    if existing["studentId"] != user_id:
        conn.close()
        raise HTTPException(status_code=403, detail="只能评价自己的报修")

    if existing["status"] != "pending_evaluation":
        conn.close()
        raise HTTPException(status_code=400, detail="该工单当前不可评价")

    previous_review = conn.execute(
        "SELECT id FROM reviews WHERE requestId = ? AND studentId = ?",
        (repair_id, user_id),
    ).fetchone()
    if previous_review:
        conn.close()
        raise HTTPException(status_code=400, detail="该工单已评价")

    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    # 更新评价信息并将状态改为 closed
    conn.execute(
        """UPDATE repairs 
           SET rating = ?, feedbackTags = ?, feedbackText = ?, status = 'closed', updatedAt = ?
           WHERE id = ?""",
        (payload.rating, payload.feedbackTags, payload.feedbackText, now, repair_id),
    )
    conn.commit()

    # 同时在 reviews 表中插入记录（保持向后兼容）
    review_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO reviews (id, requestId, studentId, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        (review_id, repair_id, user_id, payload.rating, payload.feedbackText, now),
    )
    conn.commit()

    row = conn.execute("""
        SELECT r.*, 
               u.name as studentName,
               t.name as assignedToName
        FROM repairs r
        LEFT JOIN users u ON r.studentId = u.id
        LEFT JOIN users t ON r.assignedTo = t.id
        WHERE r.id = ?
    """, (repair_id,)).fetchone()
    conn.close()

    print(f"[/api/repairs/{repair_id}/evaluate] Evaluation submitted: {payload.rating} stars by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}


@app.post("/api/reviews")
async def create_review(payload: CreateReviewRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    role = current_user.get("role", "student")

    if role != "student":
        raise HTTPException(status_code=403, detail="只有学生可以评价")

    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="评分必须在1-5之间")

    review_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    conn = get_db()
    repair = conn.execute("SELECT * FROM repairs WHERE id = ?", (payload.requestId,)).fetchone()
    if not repair:
        conn.close()
        raise HTTPException(status_code=404, detail="报修记录不存在")
    if repair["studentId"] != user_id:
        conn.close()
        raise HTTPException(status_code=403, detail="只能评价自己的报修")
    if repair["status"] not in ("completed", "pending_evaluation"):
        conn.close()
        raise HTTPException(status_code=400, detail="该工单当前不可评价")
    existing = conn.execute(
        "SELECT id FROM reviews WHERE requestId = ? AND studentId = ?",
        (payload.requestId, user_id),
    ).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="该工单已评价")

    conn.execute(
        "INSERT INTO reviews (id, requestId, studentId, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        (review_id, payload.requestId, user_id, payload.rating, payload.comment, now),
    )
    conn.execute(
        """UPDATE repairs
           SET rating = ?, feedbackText = ?, status = 'closed', updatedAt = ?
           WHERE id = ?""",
        (payload.rating, payload.comment, now, payload.requestId),
    )
    conn.commit()
    conn.close()

    print(f"[/api/reviews] Review created: {review_id} by {current_user.get('name')}")
    return {"success": True, "data": {"id": review_id}}
