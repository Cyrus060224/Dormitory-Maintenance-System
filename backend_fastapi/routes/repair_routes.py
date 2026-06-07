import uuid
import time
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from database import get_db, VALID_STATUSES, STATUS_LABELS
from auth import verify_token, require_admin
from models import CreateRepairRequest, UpdateRepairStatus, AnalyzeRepairRequest, EvaluateRequest
from services.ai_service import _get_ai_analysis, ai_dispatch

router = APIRouter()


@router.get("/api/repairs")
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

        total_query = f"SELECT COUNT(*) FROM repairs r {where_clause}"
        total = conn.execute(total_query, params).fetchone()[0]

        # 维修员/管理员按紧急程度排序（待处理优先 + SLA截止时间升序），学生按创建时间倒序
        if role in ("technician", "admin"):
            order_clause = """ORDER BY
                CASE r.status
                    WHEN 'pending' THEN 1
                    WHEN 'approved' THEN 2
                    WHEN 'in_progress' THEN 3
                    WHEN 'pending_evaluation' THEN 4
                    WHEN 'completed' THEN 5
                    WHEN 'closed' THEN 6
                    WHEN 'rejected' THEN 7
                    ELSE 8
                END,
                r.slaDueDate ASC"""
        else:
            order_clause = "ORDER BY r.createdAt DESC"

        data_query = f"""
            SELECT r.*,
                   u.name as studentName,
                   t.name as assignedToName
            FROM repairs r
            LEFT JOIN users u ON r.studentId = u.id
            LEFT JOIN users t ON r.assignedTo = t.id
            {where_clause}
            {order_clause}
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


@router.post("/api/repairs/analyze")
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


@router.post("/api/repairs")
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
            # 收集每位候选维修员的综合数据
            candidates = []
            for tech in matching_techs:
                tech_id = tech['id']
                active_tasks = conn.execute(
                    "SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status IN ('pending', 'approved', 'in_progress')",
                    (tech_id,)
                ).fetchone()[0]
                # 跳过已满载的维修员（>= 5 单）
                if active_tasks >= 5:
                    continue
                avg_row = conn.execute(
                    "SELECT AVG(r.rating) FROM reviews r JOIN repairs rep ON r.requestId = rep.id WHERE rep.assignedTo = ?",
                    (tech_id,)
                ).fetchone()
                avg_rating = round(avg_row[0], 1) if avg_row[0] else 0
                total_completed = conn.execute(
                    "SELECT COUNT(*) FROM repairs WHERE assignedTo = ? AND status IN ('completed', 'closed')",
                    (tech_id,)
                ).fetchone()[0]
                candidates.append({
                    "id": tech_id,
                    "name": tech['name'],
                    "skills": tech['skills'],
                    "activeTasks": active_tasks,
                    "avgRating": avg_rating,
                    "totalCompleted": total_completed,
                })

            if candidates:
                # 尝试 LLM 智能派单
                dispatch_result = await ai_dispatch(payload.description, payload.category, payload.priority, candidates)

                if dispatch_result:
                    # LLM 成功决策
                    assigned_to = dispatch_result["techId"]
                    status = "approved"
                    tech_name = next((c["name"] for c in candidates if c["id"] == assigned_to), "未知")
                    reason = dispatch_result["reason"]
                    admin_note = f"[🤖 AI智能派单] {reason}，已分配给：{tech_name}"
                else:
                    # LLM 失败 → 降级到规则（最小负载）
                    best = min(candidates, key=lambda c: c["activeTasks"])
                    assigned_to = best["id"]
                    status = "approved"
                    admin_note = f"[⚙️ 规则派单] 技能匹配+负载均衡（当前 {best['activeTasks']} 单），自动分配给：{best['name']}"

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


@router.patch("/api/repairs/{repair_id}/status")
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
            if payload.status == "completed":
                if not payload.workNote or len(payload.workNote.strip()) < 5:
                    raise HTTPException(status_code=400, detail="完成维修时必须填写至少5个字的维修记录(workNote)")
                payload.status = "pending_evaluation"

                if payload.partsUsed:
                    for item in payload.partsUsed:
                        part = conn.execute("SELECT * FROM parts WHERE id = ?", (item.partId,)).fetchone()
                        if not part:
                            raise HTTPException(status_code=400, detail="所选配件不存在")

                        # 原子扣减：WHERE stock >= quantity 防止并发竞态
                        result = conn.execute(
                            "UPDATE parts SET stock = stock - ? WHERE id = ? AND stock >= ?",
                            (item.quantity, item.partId, item.quantity)
                        )
                        if result.rowcount == 0:
                            raise HTTPException(status_code=400, detail=f"配件 {part['name']} 库存不足（当前库存 {part['stock']}）")

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

            # 管理员可自由切换所有状态
            all_statuses = {'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'}
            admin_transitions = {s: all_statuses - {s} for s in all_statuses}
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


@router.post("/api/repairs/{repair_id}/evaluate")
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

        conn.execute(
            """UPDATE repairs
               SET rating = ?, feedbackTags = ?, feedbackText = ?, status = 'closed', updatedAt = ?
               WHERE id = ?""",
            (payload.rating, payload.feedbackTags, payload.feedbackText, now, repair_id),
        )
        conn.commit()

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


@router.get("/api/repairs/export")
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
