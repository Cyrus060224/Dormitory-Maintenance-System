import sqlite3
import time
import os
import uuid
import httpx
import json
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import FastAPI, HTTPException, Depends, Header, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Dorm Repair API")

# Ensure uploads directory exists
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
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
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
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
            skills TEXT,
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
            slaDueDate TEXT,
            slaBreached INTEGER DEFAULT 0,
            aiCategory TEXT,
            aiPriority TEXT,
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            repairId TEXT NOT NULL,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            relatedId TEXT,
            isRead INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            authorId TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repair_parts (
            id TEXT PRIMARY KEY,
            repairId TEXT NOT NULL,
            partId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ai_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            apiKey TEXT,
            baseUrl TEXT,
            model TEXT,
            systemPrompt TEXT,
            isActive INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    """)

    # 数据库迁移：为已有数据库添加新字段
    migration_add_columns(conn)

    conn.commit()
    conn.close()



def migration_add_columns(conn: sqlite3.Connection):
    """为已有数据库添加评价及SLA相关字段（SQLite 不支持直接 ADD COLUMN IF NOT EXISTS）"""
    try:
        # Check users table
        user_columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if 'skills' not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN skills TEXT")

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
        if 'slaDueDate' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN slaDueDate TEXT")
        if 'slaBreached' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN slaBreached INTEGER DEFAULT 0")
        if 'aiCategory' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN aiCategory TEXT")
        if 'aiPriority' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN aiPriority TEXT")
            
        conn.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                repairId TEXT NOT NULL,
                userId TEXT NOT NULL,
                content TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                relatedId TEXT,
                isRead INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                authorId TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS parts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_parts (
                id TEXT PRIMARY KEY,
                repairId TEXT NOT NULL,
                partId TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT NOT NULL,
                apiKey TEXT,
                baseUrl TEXT,
                model TEXT,
                systemPrompt TEXT,
                isActive INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        """)
        # Seed a default simulation AI config if the table is empty
        row = conn.execute("SELECT COUNT(*) FROM ai_configs").fetchone()
        if row and row[0] == 0:
            now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            conn.execute("""
                INSERT INTO ai_configs (id, name, provider, apiKey, baseUrl, model, systemPrompt, isActive, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()),
                "宿宝 (模拟引擎)",
                "simulation",
                "",
                "",
                "simulation-model",
                "你是一个可爱的宿舍生活助手，名字叫'宿宝'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。",
                1,
                now,
                now
            ))
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


# ─── SLA Background Compliance Tasks ───────────────────────────────────────────
import asyncio

async def check_sla_compliance():
    """检测工单 SLA 的状态，处理即将超期预警与已超期强力干预"""
    conn = get_db()
    try:
        now_utc = datetime.now(timezone.utc)
        now_str = now_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        
        # 查找所有未完成的工单 (pending, approved, in_progress)
        active_repairs = conn.execute("""
            SELECT id, studentId, dormBuilding, dormRoom, category, status, priority, assignedTo, adminNote, createdAt, slaDueDate, slaBreached 
            FROM repairs 
            WHERE status IN ('pending', 'approved', 'in_progress')
        """).fetchall()
        
        for r in active_repairs:
            repair_id = r["id"]
            created_str = r["createdAt"]
            due_str = r["slaDueDate"]
            priority = r["priority"]
            assigned_to = r["assignedTo"]
            dorm_building = r["dormBuilding"]
            dorm_room = r["dormRoom"]
            admin_note = r["adminNote"]
            
            try:
                # 解析时间（处理可能存在的 'Z' 并统一转换为带 UTC 偏移量的 datetime）
                created_dt = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                due_dt = datetime.fromisoformat(due_str.replace('Z', '+00:00'))
            except Exception as e:
                print(f"[SLA Check] Time parse error for repair {repair_id}: {e}")
                continue
                
            total_duration_sec = (due_dt - created_dt).total_seconds()
            remaining_sec = (due_dt - now_utc).total_seconds()
            
            # 计算是否到达 80% 的阀值（即剩余时间少于 20%）
            warning_threshold = total_duration_sec * 0.20
            
            # (A) 超期检测
            if remaining_sec <= 0 and r["slaBreached"] == 0:
                # 标记为已超期
                conn.execute("UPDATE repairs SET slaBreached = 1, updatedAt = ? WHERE id = ?", (now_str, repair_id))
                
                # 发送通知
                # 1. 给学生发送加急通知
                conn.execute(
                    "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), r["studentId"], "⏳ 报修服务加急提醒", f"您的工单（{dorm_building} {dorm_room}）已超出响应时效，系统已提醒管理员加急处理。", "sla_breached", repair_id, 0, now_str)
                )
                
                # 2. 如果分配了维修工，给维修工发送超期警告
                if assigned_to:
                    conn.execute(
                        "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (str(uuid.uuid4()), assigned_to, "🚨 工单超期警告", f"工单（{dorm_building} {dorm_room}）已超期未解决，请立即处理并联系学生说明情况！", "sla_breached", repair_id, 0, now_str)
                    )
                
                # 3. 给所有管理员发送预警通知
                admins = conn.execute("SELECT id FROM users WHERE role = 'admin'").fetchall()
                for admin in admins:
                    conn.execute(
                        "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (str(uuid.uuid4()), admin["id"], "⚠️ 工单超期督办", f"工单（{dorm_building} {dorm_room}，优先级: {priority}）已超期，需要您的介入督办。", "sla_breached", repair_id, 0, now_str)
                    )
                
                # 自动在工单管理员备注中记录
                new_admin_note = "[⚠️ SLA超期警报] 该工单已超时未解决，自动提醒管理员干预。"
                if admin_note:
                    updated_note = f"{new_admin_note}\n{admin_note}"
                else:
                    updated_note = new_admin_note
                conn.execute("UPDATE repairs SET adminNote = ? WHERE id = ?", (updated_note, repair_id))
                conn.commit()
                print(f"[SLA Compliance] Repair {repair_id} breached SLA. Sent notifications.")
                
            # (B) 即将超期警告 (剩余时间少于 20% 且大于 0 且之前未发过该工单的超期预警通知)
            elif 0 < remaining_sec <= warning_threshold:
                # 检查是否已发送过 warning 通知
                already_warned = conn.execute(
                    "SELECT COUNT(*) FROM notifications WHERE relatedId = ? AND type = 'sla_warning'",
                    (repair_id,)
                ).fetchone()[0]
                
                if already_warned == 0:
                    # 发送预警通知
                    # 1. 如果有分配人，提醒该维修工
                    if assigned_to:
                        conn.execute(
                            "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            (str(uuid.uuid4()), assigned_to, "⏳ 任务即将超期", f"您的任务（{dorm_building} {dorm_room}）即将超时（剩余 {int(remaining_sec / 60)} 分钟），请尽快处理！", "sla_warning", repair_id, 0, now_str)
                        )
                    else:
                        # 2. 如果是 pending，提醒管理员分配
                        admins = conn.execute("SELECT id FROM users WHERE role = 'admin'").fetchall()
                        for admin in admins:
                            conn.execute(
                                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                (str(uuid.uuid4()), admin["id"], "⏳ 待办任务即将超时", f"工单（{dorm_building} {dorm_room}）即将超时（剩余 {int(remaining_sec / 60)} 分钟）且尚未分配，请尽快处理！", "sla_warning", repair_id, 0, now_str)
                            )
                    conn.commit()
                    print(f"[SLA Compliance] Repair {repair_id} warning threshold reached. Sent alert notifications.")
    except Exception as e:
        print(f"[SLA Compliance] Error in check_sla_compliance: {e}")
    finally:
        conn.close()

async def check_sla_compliance_loop():
    """定期检测工单 SLA 的异步循环（每分钟检查一次）"""
    # 刚启动时等待 10 秒以避开系统初始化的开销
    await asyncio.sleep(10)
    while True:
        try:
            await check_sla_compliance()
        except Exception as e:
            print(f"[SLA Loop] Error: {e}")
        await asyncio.sleep(60)


@app.on_event("startup")
def on_startup():
    db_existed = os.path.exists(DB_PATH)
    init_db()
    if not db_existed:
        print("数据库已重置，请重新开始注册第一个账号。")
    else:
        print(f"数据库已就绪：{DB_PATH}")
    
    # 启动后台异步任务
    asyncio.create_task(check_sla_compliance_loop())


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


class PartCreateRequest(BaseModel):
    name: str
    price: float
    stock: int


class PartUpdateRequest(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None


class PartUsage(BaseModel):
    partId: str
    quantity: int


class UpdateRepairStatus(BaseModel):
    status: Optional[str] = None
    assignedTo: Optional[str] = None
    adminNote: Optional[str] = None
    workNote: Optional[str] = None
    priority: Optional[str] = None
    partsUsed: Optional[list[PartUsage]] = None



class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    studentId: Optional[str] = None
    dormRoom: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str
    confirmNewPassword: str


class AnalyzeRepairRequest(BaseModel):
    description: str


class CreateCommentRequest(BaseModel):
    content: str


class CreateAnnouncementRequest(BaseModel):
    title: str
    content: str


class UpdateSkillsRequest(BaseModel):
    skills: str


class AIConfigCreateRequest(BaseModel):
    name: str
    provider: str
    apiKey: Optional[str] = ""
    baseUrl: Optional[str] = ""
    model: Optional[str] = ""
    systemPrompt: Optional[str] = ""
    isActive: Optional[bool] = False


class AIConfigUpdateRequest(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None
    systemPrompt: Optional[str] = None
    isActive: Optional[bool] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    messages: list[ChatMessage]


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
    if payload.confirmPassword is not None and payload.password != payload.confirmPassword:
        raise HTTPException(status_code=400, detail="两次输入的密码不一致")

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
    return JSONResponse(
        status_code=201,
        content={"status": "success", "success": True, "message": "注册成功", "data": None},
    )


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
            "skills": user["skills"] if "skills" in user.keys() else None,
        },
    }

@app.patch("/api/users/{user_id}/skills")
async def update_user_skills(user_id: str, payload: UpdateSkillsRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        conn.execute("UPDATE users SET skills = ? WHERE id = ?", (payload.skills, user_id))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "技能更新成功"}

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


async def _get_ai_analysis(description: str) -> tuple[str, str, str]:
    desc = description.lower()

    # 轨 1：尝试使用本地大模型 Ollama Llama3 进行高级语义分析
    try:
        async with httpx.AsyncClient() as client:
            system_prompt = (
                "You are a professional university dormitory repair analyzer. Classify the user's repair description into exactly one category and one priority.\n\n"
                "Categories:\n"
                "- 'water': plumbing, water leak, bathroom, toilet, hot/cold water, shower, faucets.\n"
                "- 'electricity': power socket, lights, electricity trip, switches, wires, electrical appliances.\n"
                "- 'furniture': bed, table, chair, desk, cabinet, door, window, lock, keys, glass.\n"
                "- 'network': internet connection, campus network, router, WiFi, Ethernet cables.\n"
                "- 'other': anything else.\n\n"
                "Priorities:\n"
                "- 'urgent': Extreme hazards requiring immediate response, like electrical fires, live wires exposed, flooding/heavy bursts of water, locked out of dorm room late at night.\n"
                "- 'high': Severe inconvenience but not immediate physical danger, like no water, no electricity, toilet clogged, door/lock completely broken, window broken in bad weather, network down during exams.\n"
                "- 'normal': Standard maintenance like slightly loose table legs, a flickering lightbulb, slow network, creaking door hinges.\n"
                "- 'low': Trivial requests, very brief descriptions, or cosmetically minor flaws.\n\n"
                "Respond ONLY with a valid JSON object in this format:\n"
                "{\n  \"category\": \"water\" | \"electricity\" | \"furniture\" | \"network\" | \"other\",\n  \"priority\": \"low\" | \"normal\" | \"high\" | \"urgent\"\n}"
            )
            
            response = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": "llama3:8b",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Description: {description}"}
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                    "format": "json"
                },
                timeout=2.0
            )
            
            if response.status_code == 200:
                res_json = response.json()
                content = res_json.get("message", {}).get("content", "").strip()
                parsed = json.loads(content)
                cat = parsed.get("category")
                pri = parsed.get("priority")
                if cat in ("water", "electricity", "furniture", "network", "other") and \
                   pri in ("low", "normal", "high", "urgent"):
                    return cat, pri, "ollama_llama3"
    except Exception as e:
        # Fallback silently to rule engine in production, log details for server output
        print(f"[AI Analyzer] Ollama Llama3 analysis failed or timed out: {e}. Falling back to Rule Engine.")

    # 轨 2：备用/降级方案 ── 升级版本地词法与情感词助推分类引擎
    categories = {
        "water": ["水", "漏水", "水管", "水龙头", "漏雨", "下水道", "马桶", "堵", "排水", "热水", "冷水", "花洒", "地漏", "喷水", "滴水", "爆管", "阀门"],
        "electricity": ["电", "插座", "灯", "断电", "没电", "跳闸", "开关", "电线", "灯管", "漏电", "短路", "电器", "空调", "热水器", "烧坏"],
        "furniture": ["床", "椅子", "桌子", "柜子", "门", "窗", "锁", "合页", "把手", "玻璃", "衣柜", "床架", "抽屉", "合叶", "木工", "钥匙", "开不了"],
        "network": ["网", "校园网", "路由器", "宽带", "网络", "断网", "网线", "连不上", "网速", "WiFi", "wifi", "上网", "接口", "网口", "无线"],
    }

    urgent_hazard_keywords = ["漏电", "着火", "起火", "爆炸", "触电", "电线冒烟", "起火花", "爆裂喷水", "大水漫灌", "水管爆裂"]
    high_hazard_keywords = ["无法锁门", "锁坏了", "没水", "没电", "马桶堵塞", "地面积水", "开不了锁", "无法关窗", "玻璃碎了", "钥匙断在锁里", "天花板漏水"]
    urgency_booster_keywords = ["紧急", "特急", "急需", "火速", "马上", "非常急", "极其严重", "十万火急", "危险", "速来", "马上要用", "尽快", "快来"]

    # 计算分类匹配分数
    scores = {cat: 0 for cat in categories}
    for cat, keywords in categories.items():
        for kw in keywords:
            if kw in desc:
                scores[cat] += desc.count(kw)

    recommended_category = "other"
    max_score = 0
    for cat, score in scores.items():
        if score > max_score:
            max_score = score
            recommended_category = cat

    # 基础优先级评估
    base_priority = "normal"
    if any(kw in desc for kw in urgent_hazard_keywords):
        base_priority = "urgent"
    elif any(kw in desc for kw in high_hazard_keywords):
        base_priority = "high"
    elif len(desc.strip()) < 8:
        base_priority = "low"

    # 情感/主观语气修饰词助推器 (Booster)
    recommended_priority = base_priority
    if any(kw in desc for kw in urgency_booster_keywords):
        if base_priority == "low":
            recommended_priority = "normal"
        elif base_priority == "normal":
            recommended_priority = "high"
        elif base_priority == "high":
            recommended_priority = "urgent"

    return recommended_category, recommended_priority, "rule_booster"


@app.post("/api/repairs/analyze")
async def analyze_repair(payload: AnalyzeRepairRequest, current_user: dict = Depends(verify_token)):
    cat, pri, eng = await _get_ai_analysis(payload.description)
    return {
        "success": True,
        "data": {
            "category": cat,
            "priority": pri,
            "engine": eng
        }
    }


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

    # 运行后台静默双轨 AI 分类与评级评估
    ai_cat, ai_pri, _ = await _get_ai_analysis(payload.description)

    repair_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    # 计算 SLA 截至时间 (基于 UTC 时间戳)
    sla_hours = {"urgent": 2, "high": 6, "normal": 24, "low": 48}
    hours = sla_hours.get(payload.priority, 24)
    sla_due_date = (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    conn = get_db()
    try:
        assigned_to = None
        status = "pending"
        admin_note = None
        
        techs = conn.execute("SELECT id, name, skills FROM users WHERE role = 'technician'").fetchall()
        matching_techs = [t for t in techs if t['skills'] and payload.category in t['skills']]
        
        if matching_techs:
            min_tasks = float('inf')
            best_tech = None
            for tech in matching_techs:
                tech_id = tech['id']
                tasks = conn.execute("SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status IN ('pending', 'approved', 'in_progress')", (tech_id,)).fetchone()[0]
                if tasks < min_tasks:
                    min_tasks = tasks
                    best_tech = tech
                    
            if best_tech and min_tasks < 5:
                assigned_to = best_tech['id']
                status = "approved"
                tech_name = best_tech['name']
                admin_note = f"[🤖 AI智能派单] 根据技能匹配与空闲度（当前负载 {min_tasks} 单），自动分配给：{tech_name}"

        conn.execute(
            """INSERT INTO repairs 
               (id, studentId, dormBuilding, dormRoom, category, description, imageUrl, status, priority, assignedTo, adminNote, slaDueDate, slaBreached, aiCategory, aiPriority, createdAt, updatedAt) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (repair_id, user_id, payload.dormBuilding, payload.dormRoom, payload.category,
             payload.description, payload.imageUrl, status, payload.priority, assigned_to, admin_note, sla_due_date, 0, ai_cat, ai_pri, now, now),
        )
        
        if assigned_to:
            conn.execute(
                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), assigned_to, "新报修任务分配", "您有一个新的报修任务被自动分配", "repair_assigned", repair_id, 0, now)
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

    print(f"[/api/repairs] Repair created: {repair_id} by {current_user.get('name')}. AI Silently Evaluated: {ai_cat} ({ai_pri})")
    return {"success": True, "data": dict(row)}


@app.patch("/api/repairs/{repair_id}/status")
async def update_repair_status(repair_id: str, payload: UpdateRepairStatus, current_user: dict = Depends(verify_token)):
    role = current_user.get("role", "student")
    user_id = current_user.get("userId", "")
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

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
            # 维修员提交完成时，强制填写维修记录，且状态自动变为 pending_evaluation
            if payload.status == "completed":
                if not payload.workNote or len(payload.workNote.strip()) < 5:
                    raise HTTPException(status_code=400, detail="完成维修时必须填写至少5个字的维修记录(workNote)")
                payload.status = "pending_evaluation"
                
                # 处理零部件备件扣除与使用记录录入
                if payload.partsUsed:
                    for item in payload.partsUsed:
                        part = conn.execute("SELECT * FROM parts WHERE id = ?", (item.partId,)).fetchone()
                        if not part:
                            raise HTTPException(status_code=400, detail="所选配件不存在")
                        if part["stock"] < item.quantity:
                            raise HTTPException(status_code=400, detail=f"配件 {part['name']} 库存不足（当前库存 {part['stock']}）")
                        
                        # 扣减库存
                        conn.execute("UPDATE parts SET stock = stock - ? WHERE id = ?", (item.quantity, item.partId))
                        # 写入消费记录明细
                        part_usage_id = str(uuid.uuid4())
                        conn.execute(
                            "INSERT INTO repair_parts (id, repairId, partId, quantity, price, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
                            (part_usage_id, repair_id, item.partId, item.quantity, part["price"], now)
                        )


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
        updates = []
        values = []

        if payload.status is not None:
            updates.append("status = ?")
            values.append(payload.status)

        if payload.workNote is not None:
            updates.append("workNote = ?")
            values.append(payload.workNote)

        if role == "admin":
            if payload.assignedTo is not None:
                updates.append("assignedTo = ?")
                values.append(payload.assignedTo if payload.assignedTo else None)
            if payload.adminNote is not None:
                updates.append("adminNote = ?")
                values.append(payload.adminNote)
            if payload.priority is not None:
                if payload.priority not in ("low", "normal", "high", "urgent"):
                    raise HTTPException(status_code=400, detail="优先级无效")
                updates.append("priority = ?")
                values.append(payload.priority)
                # 重新计算 SLA 截止时间（基于当前时间）
                sla_hours = {"urgent": 2, "high": 6, "normal": 24, "low": 48}
                hours = sla_hours.get(payload.priority, 24)
                new_sla = (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
                updates.append("slaDueDate = ?")
                values.append(new_sla)

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

        # Add notifications for status change or assignment
        now_time = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        if payload.status is not None and payload.status != existing["status"]:
            conn.execute(
                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), existing["studentId"], "报修状态已更新", f"您的报修申请状态已更新为: {STATUS_LABELS.get(payload.status, payload.status)}", "repair_status", repair_id, 0, now_time)
            )
        
        if payload.assignedTo and payload.assignedTo != existing["assignedTo"]:
            conn.execute(
                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), payload.assignedTo, "新报修任务分配", "您有一个新的报修任务被分配", "repair_assigned", repair_id, 0, now_time)
            )
            
        conn.commit()
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

    # Additional metrics calculation
    try:
        conn = get_db()
        # Trend data (last 7 days repairs count)
        trend_query = """
            SELECT date(createdAt) as date, COUNT(*) as count 
            FROM repairs 
            WHERE createdAt >= date('now', '-7 days')
            GROUP BY date(createdAt)
            ORDER BY date(createdAt) ASC
        """
        trend_rows = conn.execute(trend_query).fetchall()
        trend_data = [{"date": r["date"], "count": r["count"]} for r in trend_rows]

        # SLA compliance rate (Dynamic calculation)
        total_repairs = conn.execute("SELECT COUNT(*) FROM repairs").fetchone()[0]
        breached_query = """
            SELECT COUNT(*) FROM repairs 
            WHERE (status IN ('pending', 'approved', 'in_progress') AND slaDueDate < ?)
               OR (status IN ('completed', 'pending_evaluation', 'closed') AND updatedAt > slaDueDate)
        """
        now_str = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        breached_repairs = conn.execute(breached_query, (now_str,)).fetchone()[0]
        sla_compliance_rate = 1.0
        if total_repairs > 0:
            sla_compliance_rate = (total_repairs - breached_repairs) / total_repairs

        # Average response time (time from creation to in_progress or completed) for completed/in_progress repairs
        # Just an approximation: we check the time difference if possible. Actually, we don't track first response time.
        # We can simulate this or leave it as a placeholder. We will provide a dummy average response time for now, or calculate based on updatedAt for completed.
        # Let's compute average duration from createdAt to updatedAt for completed repairs.
        avg_response_query = """
            SELECT AVG(julianday(updatedAt) - julianday(createdAt)) * 24 as avg_hours 
            FROM repairs 
            WHERE status IN ('completed', 'closed', 'pending_evaluation')
        """
        avg_resp_row = conn.execute(avg_response_query).fetchone()
        avg_response_time = avg_resp_row["avg_hours"] if avg_resp_row and avg_resp_row["avg_hours"] else 0
        
        # 统计物料消耗总开销
        total_cost_row = conn.execute("SELECT SUM(rp.quantity * rp.price) FROM repair_parts rp").fetchone()
        total_cost = total_cost_row[0] if total_cost_row and total_cost_row[0] is not None else 0
        
        # 统计最常消耗的前5种备件排行
        parts_consumed_rows = conn.execute("""
            SELECT p.name, SUM(rp.quantity) as count, SUM(rp.quantity * rp.price) as totalCost
            FROM repair_parts rp
            LEFT JOIN parts p ON rp.partId = p.id
            GROUP BY rp.partId
            ORDER BY count DESC
            LIMIT 5
        """).fetchall()
        parts_consumed_stats = [{"name": r["name"] or "已删备件", "count": r["count"], "totalCost": float(f"{r['totalCost']:.2f}")} for r in parts_consumed_rows]
    finally:
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
            "categoryStats": category_stats,
            "avgRating": f"{avg_rating_row or 0:.1f}",
            "reviewCount": reviews,
            "trendData": trend_data,
            "slaComplianceRate": float(f"{sla_compliance_rate:.4f}"),
            "averageResponseTimeHours": float(f"{avg_response_time:.2f}"),
            "totalCost": float(f"{total_cost:.2f}"),
            "partsConsumedStats": parts_consumed_stats,
        },
    }


# ─── Parts Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/parts")
async def get_parts(current_user: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM parts ORDER BY createdAt DESC").fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.post("/api/parts")
async def create_part(payload: PartCreateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        part_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        conn.execute(
            "INSERT INTO parts (id, name, price, stock, createdAt) VALUES (?, ?, ?, ?, ?)",
            (part_id, payload.name, payload.price, payload.stock, now)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM parts WHERE id = ?", (part_id,)).fetchone()
    finally:
        conn.close()
    return {"success": True, "data": dict(row)}


@app.patch("/api/parts/{part_id}")
async def update_part(part_id: str, payload: PartUpdateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM parts WHERE id = ?", (part_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="备品备件不存在")
            
        updates = []
        values = []
        if payload.name is not None:
            updates.append("name = ?")
            values.append(payload.name)
        if payload.price is not None:
            updates.append("price = ?")
            values.append(payload.price)
        if payload.stock is not None:
            updates.append("stock = ?")
            values.append(payload.stock)
            
        if not updates:
            raise HTTPException(status_code=400, detail="未提供修改字段")
            
        values.append(part_id)
        conn.execute(f"UPDATE parts SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM parts WHERE id = ?", (part_id,)).fetchone()
    finally:
        conn.close()
    return {"success": True, "data": dict(row)}


@app.delete("/api/parts/{part_id}")
async def delete_part(part_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM parts WHERE id = ?", (part_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="备品备件不存在")
        conn.execute("DELETE FROM parts WHERE id = ?", (part_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "删除成功"}


@app.get("/api/repairs/{repair_id}/parts")
async def get_repair_parts(repair_id: str, current_user: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT rp.*, p.name as partName
            FROM repair_parts rp
            LEFT JOIN parts p ON rp.partId = p.id
            WHERE rp.repairId = ?
            ORDER BY rp.createdAt ASC
        """, (repair_id,)).fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}



# ─── User Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/users")
async def get_users(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    current_user: dict = Depends(require_admin)
):
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
        rows = conn.execute("""
            SELECT u.id, u.name, u.email, u.role,
                   (SELECT COUNT(*) FROM repairs r 
                    WHERE r.assignedTo = u.id AND r.status IN ('approved', 'in_progress')) as activeTasksCount
            FROM users u
            WHERE u.role = 'technician'
        """).fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
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


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), current_user: dict = Depends(verify_token)):
    # 限制支持的文件格式
    allowed_extensions = {".png", ".jpg", ".jpeg", ".gif"}
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="只允许上传图片格式 (.png, .jpg, .jpeg, .gif)")

    # 限制文件大小在 5MB 以内
    max_size = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="图片大小不能超过 5MB")

    # 生成随机且安全的文件名保存
    filename = f"{uuid.uuid4()}{ext.lower()}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        print(f"上传文件写入错误: {e}")
        raise HTTPException(status_code=500, detail="文件上传失败，请稍后重试")

    # 返回文件的相对托管 URL，Vite 开发环境已配置 /uploads 代理
    url = f"/uploads/{filename}"
    return {"success": True, "url": url}


@app.put("/api/users/profile")
async def update_profile(payload: UpdateProfileRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")

    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        updates = []
        values = []

        if payload.name is not None:
            updates.append("name = ?")
            values.append(payload.name)

        if payload.phone is not None:
            updates.append("phone = ?")
            values.append(payload.phone)

        if user["role"] == "student":
            if payload.studentId is not None:
                updates.append("studentId = ?")
                values.append(payload.studentId)
            if payload.dormRoom is not None:
                updates.append("dormRoom = ?")
                values.append(payload.dormRoom)

        if not updates:
            raise HTTPException(status_code=400, detail="未提供任何修改字段")

        values.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

        # 重新获取最新的用户信息并返回
        updated_user = conn.execute(
            "SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
    finally:
        conn.close()

    print(f"[/api/users/profile] User profile updated: {user_id}")
    return {"success": True, "data": dict(updated_user)}


@app.post("/api/users/change-password")
async def change_password(payload: ChangePasswordRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")

    if len(payload.newPassword) < 6:
        raise HTTPException(status_code=400, detail="新密码长度不能少于6位")

    if payload.newPassword != payload.confirmNewPassword:
        raise HTTPException(status_code=400, detail="两次输入的新密码不一致")

    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        # 验证旧密码
        if not pwd_context.verify(payload.oldPassword, user["password"]):
            raise HTTPException(status_code=400, detail="当前密码输入错误")

        # 加密新密码
        hashed_password = pwd_context.hash(payload.newPassword)
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (hashed_password, user_id))
        conn.commit()
    finally:
        conn.close()

    print(f"[/api/users/change-password] Password changed for user: {user_id}")
    return {"success": True, "message": "密码修改成功"}


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
    role = current_user.get("role", "student")

    if role != "student":
        raise HTTPException(status_code=403, detail="只有学生可以评价")

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


# ─── Comments Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/repairs/{repair_id}/comments")
async def get_repair_comments(repair_id: str, current_user: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT c.*, u.name as userName, u.role as userRole
            FROM comments c
            LEFT JOIN users u ON c.userId = u.id
            WHERE c.repairId = ?
            ORDER BY c.createdAt ASC
        """, (repair_id,)).fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.post("/api/repairs/{repair_id}/comments")
async def add_repair_comment(repair_id: str, payload: CreateCommentRequest, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        repair = conn.execute("SELECT * FROM repairs WHERE id = ?", (repair_id,)).fetchone()
        if not repair:
            raise HTTPException(status_code=404, detail="报修记录不存在")

        comment_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        conn.execute(
            "INSERT INTO comments (id, repairId, userId, content, createdAt) VALUES (?, ?, ?, ?, ?)",
            (comment_id, repair_id, user_id, payload.content, now)
        )
        
        # Determine who should be notified
        # If student comments, notify assigned tech and maybe admin
        # If tech comments, notify student
        if current_user.get("role") == "student" and repair["assignedTo"]:
            conn.execute(
                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), repair["assignedTo"], "新评论", f"您的工单有新的评论", "new_comment", repair_id, 0, now)
            )
        elif current_user.get("role") in ["technician", "admin"]:
            conn.execute(
                "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), repair["studentId"], "新回复", f"您的工单收到了新的回复", "new_comment", repair_id, 0, now)
            )
            
        conn.commit()

        row = conn.execute("""
            SELECT c.*, u.name as userName, u.role as userRole
            FROM comments c
            LEFT JOIN users u ON c.userId = u.id
            WHERE c.id = ?
        """, (comment_id,)).fetchone()
    finally:
        conn.close()
    return {"success": True, "data": dict(row)}


# ─── Notifications Endpoints ──────────────────────────────────────────────────────
@app.get("/api/notifications")
async def get_notifications(current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT * FROM notifications 
            WHERE userId = ? 
            ORDER BY createdAt DESC
        """, (user_id,)).fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.patch("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        conn.execute("UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?", (notification_id, user_id))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "已标记为已读"}


@app.post("/api/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        conn.execute("UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "已全部标记为已读"}


# ─── Announcements Endpoints ──────────────────────────────────────────────────────
@app.get("/api/announcements")
async def get_announcements():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT a.*, u.name as authorName 
            FROM announcements a
            LEFT JOIN users u ON a.authorId = u.id
            ORDER BY a.createdAt DESC
        """).fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@app.post("/api/announcements")
async def create_announcement(payload: CreateAnnouncementRequest, current_user: dict = Depends(require_admin)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        announcement_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        conn.execute(
            "INSERT INTO announcements (id, title, content, authorId, createdAt) VALUES (?, ?, ?, ?, ?)",
            (announcement_id, payload.title, payload.content, user_id, now)
        )
        conn.commit()
        row = conn.execute("""
            SELECT a.*, u.name as authorName 
            FROM announcements a
            LEFT JOIN users u ON a.authorId = u.id
            WHERE a.id = ?
        """, (announcement_id,)).fetchone()
    finally:
        conn.close()
    return {"success": True, "data": dict(row)}


@app.delete("/api/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "公告已删除"}


# ─── Export Endpoint ──────────────────────────────────────────────────────────────
import csv
import io
from fastapi.responses import StreamingResponse

@app.get("/api/repairs/export")
async def export_repairs(current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT r.id, u.name as studentName, r.dormBuilding, r.dormRoom, 
                   r.category, r.status, r.priority, t.name as assignedToName, 
                   r.createdAt, r.updatedAt
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            ORDER BY r.createdAt DESC
        """).fetchall()
    finally:
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Repair ID", "Student Name", "Building", "Room", "Category", 
        "Status", "Priority", "Assigned Technician", "Created At", "Updated At"
    ])
    
    for row in rows:
        writer.writerow([
            row["id"], row["studentName"], row["dormBuilding"], row["dormRoom"],
            row["category"], row["status"], row["priority"], row["assignedToName"],
            row["createdAt"], row["updatedAt"]
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=repairs_export.csv"}
    )


# ─── AI Config and Assistant Chat Endpoints ─────────────────────────────────────────

def mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}...{key[-4:]}"

@app.get("/api/admin/ai-configs")
async def get_ai_configs(current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM ai_configs ORDER BY createdAt DESC").fetchall()
        configs = []
        for r in rows:
            d = dict(r)
            d["apiKey"] = mask_api_key(d["apiKey"])
            configs.append(d)
    finally:
        conn.close()
    return {"success": True, "data": configs}

@app.post("/api/admin/ai-configs")
async def create_ai_config(payload: AIConfigCreateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        config_id = str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        is_active_val = 1 if payload.isActive else 0
        
        if is_active_val == 1:
            conn.execute("UPDATE ai_configs SET isActive = 0")
            
        conn.execute("""
            INSERT INTO ai_configs (id, name, provider, apiKey, baseUrl, model, systemPrompt, isActive, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            config_id, payload.name, payload.provider, payload.apiKey, 
            payload.baseUrl, payload.model, payload.systemPrompt, is_active_val,
            now, now
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        d = dict(row)
        d["apiKey"] = mask_api_key(d["apiKey"])
    finally:
        conn.close()
    return {"success": True, "data": d}

@app.patch("/api/admin/ai-configs/{config_id}")
async def update_ai_config(config_id: str, payload: AIConfigUpdateRequest, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AI配置预设不存在")
            
        updates = []
        values = []
        now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        
        if payload.name is not None:
            updates.append("name = ?")
            values.append(payload.name)
        if payload.provider is not None:
            updates.append("provider = ?")
            values.append(payload.provider)
        if payload.apiKey is not None:
            updates.append("apiKey = ?")
            values.append(payload.apiKey)
        if payload.baseUrl is not None:
            updates.append("baseUrl = ?")
            values.append(payload.baseUrl)
        if payload.model is not None:
            updates.append("model = ?")
            values.append(payload.model)
        if payload.systemPrompt is not None:
            updates.append("systemPrompt = ?")
            values.append(payload.systemPrompt)
            
        if payload.isActive is not None:
            is_active_val = 1 if payload.isActive else 0
            if is_active_val == 1:
                conn.execute("UPDATE ai_configs SET isActive = 0")
            updates.append("isActive = ?")
            values.append(is_active_val)
            
        updates.append("updatedAt = ?")
        values.append(now)
        values.append(config_id)
        
        conn.execute(f"UPDATE ai_configs SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
        
        row = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        d = dict(row)
        d["apiKey"] = mask_api_key(d["apiKey"])
    finally:
        conn.close()
    return {"success": True, "data": d}

@app.delete("/api/admin/ai-configs/{config_id}")
async def delete_ai_config(config_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM ai_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="AI配置预设不存在")
        conn.execute("DELETE FROM ai_configs WHERE id = ?", (config_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "配置已成功删除"}

@app.post("/api/admin/ai-configs/test")
async def test_ai_config(payload: AIConfigCreateRequest, current_user: dict = Depends(require_admin)):
    if payload.provider == "simulation":
        return {"success": True, "message": "模拟引擎测试成功！宿宝已准备就绪。"}
        
    try:
        async with httpx.AsyncClient() as client:
            if payload.provider == "ollama":
                url = f"{payload.baseUrl}/api/chat" if payload.baseUrl else "http://localhost:11434/api/chat"
                res = await client.post(
                    url,
                    json={
                        "model": payload.model or "llama3",
                        "messages": [{"role": "user", "content": "hi"}],
                        "stream": False
                    },
                    timeout=5.0
                )
                if res.status_code == 200:
                    return {"success": True, "message": f"Ollama 引擎连接成功！模型: {payload.model}"}
                else:
                    raise HTTPException(status_code=400, detail=f"Ollama 返回错误 (状态码 {res.status_code}): {res.text}")
            else:
                # OpenAI, DeepSeek, Xiaomi or other custom OpenAI compatibles
                url = f"{payload.baseUrl}/chat/completions"
                headers = {
                    "Content-Type": "application/json"
                }
                if payload.apiKey:
                    headers["Authorization"] = f"Bearer {payload.apiKey}"
                    
                body = {
                    "model": payload.model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5
                }
                res = await client.post(url, json=body, headers=headers, timeout=5.0)
                if res.status_code == 200:
                    return {"success": True, "message": f"大模型接口测试成功！模型: {payload.model}"}
                else:
                    return JSONResponse(
                        status_code=400,
                        content={"success": False, "detail": f"模型接口返回错误 (状态码 {res.status_code}): {res.text}"}
                    )
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "detail": f"测试连接异常: {str(e)}"}
        )

@app.post("/api/chat")
async def chat_with_assistant(payload: AIChatRequest, current_user: dict = Depends(verify_token)):
    conn = get_db()
    active_config = None
    try:
        row = conn.execute("SELECT * FROM ai_configs WHERE isActive = 1 LIMIT 1").fetchone()
        if row:
            active_config = dict(row)
    finally:
        conn.close()
        
    provider = active_config["provider"] if active_config else "simulation"
    system_prompt = active_config["systemPrompt"] if active_config else "你是一个可爱的宿舍生活助手，名字叫'宿宝'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。"
    model = active_config["model"] if active_config else "simulation-model"
    api_key = active_config["apiKey"] if active_config else ""
    base_url = active_config["baseUrl"] if active_config else ""
    
    api_messages = []
    if system_prompt:
        api_messages.append({"role": "system", "content": system_prompt})
    
    for msg in payload.messages[-10:]:
        api_messages.append({"role": msg.role, "content": msg.content})
        
    if provider == "simulation":
        last_user_msg = payload.messages[-1].content if payload.messages else ""
        
        reply = "宿宝收到啦！这是一个模拟引擎的回复。等管理员配置了正式的 API Key（如小米 API 或 DeepSeek）后，宿宝就可以回答各种好玩的生活问题啦！"
        if "断电" in last_user_msg or "停电" in last_user_msg or "没电" in last_user_msg:
            reply = "💡 **宿宝提示：宿舍用电指引**\n\n如果宿舍突然停电，请按照以下步骤排查：\n1. 检查是否只有你宿舍停电，如果是，可能是负荷过大导致跳闸，可查看宿舍门口配电箱的空气开关是否跳开。\n2. 检查校园网/公众号缴费系统，确认电费是否已经用完，如果是，请及时充值，充值后系统一般会在5分钟内自动送电。\n3. 如果以上均正常，请在宿舍管理系统提交“用电类”报修工单，维修师傅会尽快上门协助！"
        elif "水" in last_user_msg or "漏水" in last_user_msg or "堵塞" in last_user_msg:
            reply = "💧 **宿宝提示：水暖管道紧急处理**\n\n1. **水管爆裂/严重漏水**：请迅速关闭洗手池或卫生间下方的三角阀以切断水源，并提交“加急/紧急”报修单，同时可以电话联系楼栋宿管阿姨安排值班师傅。\n2. **下水道堵塞**：请尽量避免继续用水防止溢水，提交报修工单，并在备注中写明是否需要专用疏通工具。"
        elif "密码" in last_user_msg or "修改密码" in last_user_msg:
            reply = "🔒 **宿宝提示：密码管理**\n\n如果您需要修改密码：\n1. 点击左侧导航栏的 **“个人中心”**。\n2. 在页面中找到 **“修改密码”** 面板。\n3. 输入您的旧密码及新密码，点击保存即可。\n\n如果忘记密码，请联系宿管老师（系统管理员）进行后台密码重置。"
        elif "报修" in last_user_msg or "如何报修" in last_user_msg:
            reply = "🛠️ **宿宝提示：如何提交报修单**\n\n1. 在页面左侧点击 **“报修管理”** 页面。\n2. 点击顶部的 **“申请报修”** 按钮。\n3. 填写真实的楼栋、宿舍号，选择故障分类并填写详细描述（建议上传故障照片方便师傅带齐工具）。\n4. 点击提交后，系统将自动分配师傅为您维修，请保持电话畅通！"
        elif "你好" in last_user_msg or "你是谁" in last_user_msg:
            reply = "你好呀！我是宿舍小管家 **「宿宝」** 🤖✨。有什么关于宿舍报修、起居缴费或生活指南的问题，都可以随时问我哦！"
            
        return {"success": True, "data": {"reply": reply}}
        
    try:
        async with httpx.AsyncClient() as client:
            if provider == "ollama":
                url = f"{base_url}/api/chat" if base_url else "http://localhost:11434/api/chat"
                res = await client.post(
                    url,
                    json={
                        "model": model or "llama3",
                        "messages": api_messages,
                        "stream": False
                    },
                    timeout=30.0
                )
                if res.status_code == 200:
                    reply = res.json()["message"]["content"]
                    return {"success": True, "data": {"reply": reply}}
                else:
                    return {"success": False, "detail": f"Ollama 服务返回异常: {res.status_code}"}
            else:
                url = f"{base_url}/chat/completions"
                headers = {
                    "Content-Type": "application/json"
                }
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                body = {
                    "model": model,
                    "messages": api_messages
                }
                res = await client.post(url, json=body, headers=headers, timeout=30.0)
                if res.status_code == 200:
                    reply = res.json()["choices"][0]["message"]["content"]
                    return {"success": True, "data": {"reply": reply}}
                else:
                    return {"success": False, "detail": f"大模型接口调用失败 (代码 {res.status_code}): {res.text}"}
    except Exception as e:
        return {"success": False, "detail": f"AI 服务响应错误: {str(e)}"}

