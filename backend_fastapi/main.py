from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import base64
import json
import time

app = FastAPI(title="Dorm Repair API")

# Configure CORS to allow frontend requests from localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def make_mock_jwt(name: str, email: str, role: str) -> str:
    """Create a fake JWT token (header.payload.signature) so the frontend can decode it."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(
        json.dumps({
            "userId": "mock-user-id",
            "name": name,
            "email": email,
            "role": role,
            "exp": int(time.time()) + 86400,
        }).encode()
    ).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(b"mock-signature").decode().rstrip("=")
    return f"{header}.{payload}.{signature}"


@app.post("/api/login")
async def login(payload: LoginRequest):
    print(f"[/api/login] Received login request: email={payload.email}")
    if payload.email == "zhangsan@qq.com" and payload.password == "zhangsan666":
        token = make_mock_jwt("张三", payload.email, "student")
        print("[/api/login] Login successful")
        return {"status": "success", "token": token, "user": {"name": "张三", "email": payload.email, "role": "student"}}
    raise HTTPException(status_code=401, detail="邮箱或密码错误")


@app.post("/api/register")
async def register(payload: SignupRequest):
    print("[/api/register] Received signup request:")
    print(f"  name: {payload.name}")
    print(f"  email: {payload.email}")
    print(f"  role: {payload.role}")
    print(f"  studentId: {payload.studentId}")
    print(f"  dormRoom: {payload.dormRoom}")
    print(f"  phone: {payload.phone}")
    print(f"  confirmPassword: {payload.confirmPassword}")
    return {
        "status": "success",
        "message": "Backend received data",
    }
