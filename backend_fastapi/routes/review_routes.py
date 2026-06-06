import uuid
import time

from fastapi import APIRouter, HTTPException, Depends

from database import get_db
from auth import verify_token
from models import CreateReviewRequest, CreateCommentRequest

router = APIRouter()


@router.post("/api/reviews")
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


@router.get("/api/repairs/{repair_id}/comments")
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


@router.post("/api/repairs/{repair_id}/comments")
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
