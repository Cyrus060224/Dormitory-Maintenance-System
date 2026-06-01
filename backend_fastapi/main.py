import sqlite3
import time
import os
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Dorm Repair API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Password hashing ───────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# ─── JWT settings ───────────────────────────────────────────────────────────────
SECRET_KEY = "dorm-repair-system-secret-key-change-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 1440

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


def verify_token(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

# ─── Database ───────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "dorm.db")


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
    name: str
    email: str
    password: str
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


# ─── Auth Endpoints ─────────────────────────────────────────────────────────────
@app.post("/api/register")
async def register(payload: SignupRequest):
    # 注册只允许 student 和 technician 角色
    allowed_roles = {'student', 'technician'}
    role = payload.role or 'student'
    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="不允许注册该角色")

    if "@" not in payload.email:
        raise HTTPException(status_code=400, detail="邮箱格式不正确")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="密码长度不能少于6位")

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (payload.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="该邮箱已被注册")

        user_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        hashed_password = pwd_context.hash(payload.password or "")
        conn.execute(
            "INSERT INTO users (id, name, email, password, role, studentId, dormRoom, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, payload.name, payload.email, hashed_password, role,
             payload.studentId, payload.dormRoom, payload.phone, now),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"[/api/register] User registered: {payload.name} ({payload.email})")
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=201, content={"status": "success", "message": "Registration successful"})


@app.post("/api/login")
async def login(payload: LoginRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()
    finally:
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
        "token": token,
        "user": {"name": user["name"], "email": user["email"], "role": user["role"]},
    }

# ─── Repair Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/repairs")
async def get_repairs(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(verify_token)
):
    conn = get_db()
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    try:
        conditions = []
        params = []

        if role == "technician":
            conditions.append("r.assignedTo = ?")
            params.append(user_id)
        elif role != "admin":
            conditions.append("r.studentId = ?")
            params.append(user_id)

        if status and status != "all":
            conditions.append("r.status = ?")
            params.append(status)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        # Count total matching records
        total_query = f"SELECT COUNT(*) FROM repairs r {where_clause}"
        total = conn.execute(total_query, params).fetchone()[0]

        # Fetch matching records
        data_query = f"""
            SELECT r.*, 
                   u.name as studentName,
                   t.name as assignedToName
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            {where_clause}
            ORDER BY r.createdAt DESC
        """

        if page is not None and pageSize is not None:
            data_query += " LIMIT ? OFFSET ?"
            limit = pageSize
            offset = (page - 1) * pageSize
            params.extend([limit, offset])

        rows = conn.execute(data_query, params).fetchall()
    finally:
        conn.close()

    data = [dict(r) for r in rows]
    if page is not None and pageSize is not None:
        return {
            "success": True,
            "data": data,
            "total": total,
            "page": page,
            "pageSize": pageSize
        }
    else:
        return {"success": True, "data": data, "total": total}


@app.post("/api/repairs")
async def create_repair(payload: CreateRepairRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    role = current_user.get("role", "student")

    if role != "student":
        raise HTTPException(status_code=403, detail="Only students can create repair requests")

    if not payload.dormBuilding or not payload.dormRoom or not payload.description:
        raise HTTPException(status_code=400, detail="请填写所有必填项")

    if len(payload.description.strip()) < 5:
        raise HTTPException(status_code=400, detail="问题描述至少需要5个字")

    repair_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    conn = get_db()
    try:
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
    finally:
        conn.close()

    print(f"[/api/repairs] Repair created: {repair_id} by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}


@app.patch("/api/repairs/{repair_id}/status")
async def update_repair_status(repair_id: str, payload: UpdateRepairStatus, current_user: dict = Depends(verify_token)):
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM repairs WHERE id = ?", (repair_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="报修记录不存在")

        if role == "student":
            raise HTTPException(status_code=403, detail="学生无法更新报修状态")

        if role == "technician":
            if existing["assignedTo"] != user_id:
                raise HTTPException(status_code=403, detail="只能更新自己分配到的任务")
            if payload.status not in ("in_progress", "completed"):
                raise HTTPException(status_code=400, detail="维修人员只能将状态更新为维修中或已完成")
            # 维修员提交完成时，状态自动变为 pending_evaluation（待学生评价）
            if payload.status == "completed":
                payload.status = "pending_evaluation"

        # Admin validations
        if role == "admin" and payload.status:
            valid_statuses = VALID_STATUSES
            if payload.status not in valid_statuses:
                raise HTTPException(status_code=400, detail="无效的状态")
            
            # Additional admin transition validations (Issue #7)
            admin_transitions = {
                'pending': {'approved', 'rejected'},
                'approved': {'in_progress', 'pending'},
                'in_progress': {'completed', 'pending'},
                'completed': {'pending_evaluation', 'in_progress'},
                'pending_evaluation': {'closed', 'in_progress'},
                'closed': set(),
                'rejected': set()
            }
            if payload.status != existing["status"] and payload.status not in admin_transitions.get(existing["status"], set()):
                current_label = STATUS_LABELS.get(existing["status"], existing["status"])
                target_label = STATUS_LABELS.get(payload.status, payload.status)
                raise HTTPException(status_code=400, detail=f"管理员无法将工单从 {current_label} 直接更改为 {target_label}")

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
    finally:
        conn.close()

    print(f"[/api/repairs/{repair_id}] Status updated by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}





# ─── Stats Endpoint (real data from database) ───────────────────────────────────
@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(verify_token)):
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")

    conn = get_db()

    try:
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
    finally:
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
async def get_users(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    current_user: dict = Depends(verify_token)
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可查看用户列表")
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        query = "SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users ORDER BY createdAt DESC"
        params = []
        if page is not None and pageSize is not None:
            query += " LIMIT ? OFFSET ?"
            params.extend([pageSize, (page - 1) * pageSize])
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    data = [dict(r) for r in rows]
    if page is not None and pageSize is not None:
        return {
            "success": True,
            "data": data,
            "total": total,
            "page": page,
            "pageSize": pageSize
        }
    else:
        return {"success": True, "data": data, "total": total}


@app.get("/api/users/technicians")
async def get_technicians(current_user: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT id, name, email, role FROM users WHERE role = 'technician'").fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(verify_token)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可删除用户")
    conn = get_db()
    try:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "data": None}


@app.get("/api/users/me")
async def get_current_user(current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        user = conn.execute(
            "SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
    finally:
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
    try:
        existing = conn.execute("SELECT * FROM repairs WHERE id = ?", (repair_id,)).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="报修记录不存在")

        if existing["studentId"] != user_id:
            raise HTTPException(status_code=403, detail="只能评价自己的报修")

        if existing["status"] != "pending_evaluation":
            raise HTTPException(status_code=400, detail="该工单当前不可评价")

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
    finally:
        conn.close()

    print(f"[/api/repairs/{repair_id}/evaluate] Evaluation submitted: {payload.rating} stars by {current_user.get('name')}")
    return {"success": True, "data": dict(row)}


@app.post("/api/reviews")
async def create_review(payload: CreateReviewRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")

    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="评分必须在1-5之间")

    review_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO reviews (id, requestId, studentId, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            (review_id, payload.requestId, user_id, payload.rating, payload.comment, now),
        )
        conn.commit()
    finally:
        conn.close()

    print(f"[/api/reviews] Review created: {review_id} by {current_user.get('name')}")
    return {"success": True, "data": {"id": review_id}}
