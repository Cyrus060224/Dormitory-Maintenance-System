import uuid
import time

from fastapi import APIRouter, HTTPException, Depends

from database import get_db
from auth import verify_token, require_admin
from models import PartCreateRequest, PartUpdateRequest

router = APIRouter()


@router.get("/api/parts")
async def get_parts(current_user: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM parts ORDER BY createdAt DESC").fetchall()
    finally:
        conn.close()
    return {"success": True, "data": [dict(r) for r in rows]}


@router.post("/api/parts")
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


@router.patch("/api/parts/{part_id}")
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


@router.delete("/api/parts/{part_id}")
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


@router.get("/api/repairs/{repair_id}/parts")
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
