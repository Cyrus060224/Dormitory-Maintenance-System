import sqlite3
import time
import os
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Dorm Repair API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

# ─── Database ───────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "dorm.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
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
    conn.commit()
    conn.close()


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


# ─── Auth Endpoints ─────────────────────────────────────────────────────────────
@app.post("/api/register")
async def register(payload: SignupRequest):
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
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=201, content={"status": "success", "message": "Registration successful"})


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
        "token": token,
        "user": {"name": user["name"], "email": user["email"], "role": user["role"]},
    }

# ─── Repair Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/repairs")
async def get_repairs():
    conn = get_db()
    rows = conn.execute("SELECT * FROM repairs ORDER BY createdAt DESC").fetchall()
    conn.close()
    data = [dict(r) for r in rows]
    return {"success": True, "data": data}


@app.post("/api/repairs")
async def create_repair():
    repair_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    return {"success": True, "data": {"id": repair_id, "status": "pending", "createdAt": now, "updatedAt": now}}


@app.patch("/api/repairs/{repair_id}/status")
async def update_repair_status(repair_id: str):
    return {"success": True, "data": {"id": repair_id}}


# ─── Task Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/tasks")
async def get_tasks():
    return {"success": True, "data": []}


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str):
    return {"success": True, "data": {"id": task_id}}


# ─── Stats Endpoint (real data from database) ───────────────────────────────────
@app.get("/api/stats")
async def get_stats():
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM repairs").fetchone()[0]
    pending = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'pending'").fetchone()[0]
    in_progress = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'in_progress'").fetchone()[0]
    completed = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'completed'").fetchone()[0]
    rejected = conn.execute("SELECT COUNT(*) FROM repairs WHERE status = 'rejected'").fetchone()[0]
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    student_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'student'").fetchone()[0]
    technician_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'technician'").fetchone()[0]
    reviews = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
    avg_rating_row = conn.execute("SELECT AVG(rating) FROM reviews").fetchone()[0]
    conn.close()
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
            "categoryStats": [],
            "avgRating": f"{avg_rating_row or 0:.1f}",
            "reviewCount": reviews,
        },
    }


# ─── User Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/users")
async def get_users():
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users ORDER BY createdAt DESC").fetchall()
    conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.get("/api/users/technicians")
async def get_technicians():
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, role FROM users WHERE role = 'technician'").fetchall()
    conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str):
    conn = get_db()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True, "data": None}


# ─── Review Endpoints ───────────────────────────────────────────────────────────
@app.post("/api/reviews")
async def create_review():
    return {"success": True, "data": None}
