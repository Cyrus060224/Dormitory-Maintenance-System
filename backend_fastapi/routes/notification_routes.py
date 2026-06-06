from fastapi import APIRouter, Depends

from database import get_db
from auth import verify_token

router = APIRouter()


@router.get("/api/notifications")
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


@router.patch("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        conn.execute("UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?", (notification_id, user_id))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "已标记为已读"}


@router.post("/api/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(verify_token)):
    user_id = current_user.get("userId", "")
    conn = get_db()
    try:
        conn.execute("UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": "已全部标记为已读"}
