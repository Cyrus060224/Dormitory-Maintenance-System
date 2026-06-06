import time

from fastapi import APIRouter, Depends

from database import get_db
from auth import verify_token

router = APIRouter()


@router.get("/api/stats")
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

    try:
        conn = get_db()
        trend_query = """
            SELECT date(createdAt) as date, COUNT(*) as count
            FROM repairs
            WHERE createdAt >= date('now', '-7 days')
            GROUP BY date(createdAt)
            ORDER BY date(createdAt) ASC
        """
        trend_rows = conn.execute(trend_query).fetchall()
        trend_data = [{"date": r["date"], "count": r["count"]} for r in trend_rows]

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

        avg_response_query = """
            SELECT AVG(julianday(updatedAt) - julianday(createdAt)) * 24 as avg_hours
            FROM repairs
            WHERE status IN ('completed', 'closed', 'pending_evaluation')
        """
        avg_resp_row = conn.execute(avg_response_query).fetchone()
        avg_response_time = avg_resp_row["avg_hours"] if avg_resp_row and avg_resp_row["avg_hours"] else 0

        total_cost_row = conn.execute("SELECT SUM(rp.quantity * rp.price) FROM repair_parts rp").fetchone()
        total_cost = total_cost_row[0] if total_cost_row and total_cost_row[0] is not None else 0

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
