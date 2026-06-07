import uuid
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from database import get_db
from auth import pwd_context, create_access_token
from models import SignupRequest, LoginRequest

router = APIRouter()


@router.post("/api/register")
async def register(payload: SignupRequest):
    # 只允许注册学生账号，维修员和管理员只能由管理员创建
    role = 'student'

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


@router.post("/api/login")
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
