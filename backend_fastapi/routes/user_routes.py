import os
import uuid
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse

from database import get_db, UPLOAD_DIR
from auth import verify_token, require_admin, pwd_context
from models import UpdateProfileRequest, ChangePasswordRequest, UpdateSkillsRequest, CreateAdminRequest, CreateTechnicianRequest

router = APIRouter()


@router.patch("/api/users/{user_id}/skills")
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


@router.get("/api/users")
async def get_users(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    current_user: dict = Depends(require_admin)
):
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        query = "SELECT id, name, email, role, studentId, dormRoom, phone, skills, createdAt FROM users ORDER BY createdAt DESC"
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


@router.get("/api/users/technicians")
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


@router.delete("/api/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "data": None}


@router.get("/api/users/me")
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


@router.post("/api/upload")
async def upload_image(file: UploadFile = File(...), current_user: dict = Depends(verify_token)):
    allowed_extensions = {".png", ".jpg", ".jpeg", ".gif"}
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="只允许上传图片格式 (.png, .jpg, .jpeg, .gif)")

    max_size = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="图片大小不能超过 5MB")

    filename = f"{uuid.uuid4()}{ext.lower()}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        print(f"上传文件写入错误: {e}")
        raise HTTPException(status_code=500, detail="文件上传失败，请稍后重试")

    url = f"/uploads/{filename}"
    return {"success": True, "url": url}


@router.put("/api/users/profile")
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

        updated_user = conn.execute(
            "SELECT id, name, email, role, studentId, dormRoom, phone, createdAt FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
    finally:
        conn.close()

    print(f"[/api/users/profile] User profile updated: {user_id}")
    return {"success": True, "data": dict(updated_user)}


@router.post("/api/users/change-password")
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

        if not pwd_context.verify(payload.oldPassword, user["password"]):
            raise HTTPException(status_code=400, detail="当前密码输入错误")

        hashed_password = pwd_context.hash(payload.newPassword)
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (hashed_password, user_id))
        conn.commit()
    finally:
        conn.close()

    print(f"[/api/users/change-password] Password changed for user: {user_id}")
    return {"success": True, "message": "密码修改成功"}


@router.post("/api/users/create-admin")
async def create_admin(payload: CreateAdminRequest, current_user: dict = Depends(require_admin)):
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
        hashed_password = pwd_context.hash(payload.password)
        conn.execute(
            "INSERT INTO users (id, name, email, password, role, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, payload.name, payload.email, hashed_password, "admin", payload.phone, now),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"[/api/users/create-admin] Admin created: {payload.name} ({payload.email})")
    return JSONResponse(
        status_code=201,
        content={"success": True, "message": "管理员创建成功", "data": {"id": user_id, "name": payload.name, "email": payload.email, "role": "admin"}},
    )


@router.post("/api/users/create-technician")
async def create_technician(payload: CreateTechnicianRequest, current_user: dict = Depends(require_admin)):
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
        hashed_password = pwd_context.hash(payload.password)
        conn.execute(
            "INSERT INTO users (id, name, email, password, role, skills, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, payload.name, payload.email, hashed_password, "technician", payload.skills, payload.phone, now),
        )
        conn.commit()
    finally:
        conn.close()
    print(f"[/api/users/create-technician] Technician created: {payload.name} ({payload.email})")
    return JSONResponse(
        status_code=201,
        content={"success": True, "message": "维修员创建成功", "data": {"id": user_id, "name": payload.name, "email": payload.email, "role": "technician", "skills": payload.skills}},
    )
