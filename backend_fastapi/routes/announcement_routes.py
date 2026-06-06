import uuid
import time

from fastapi import APIRouter, HTTPException, Depends

from database import get_db
from auth import require_admin
from models import CreateAnnouncementRequest

router = APIRouter()


@router.get("/api/announcements")
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


@router.post("/api/announcements")
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


@router.delete("/api/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: dict = Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "公告已删除"}
