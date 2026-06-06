import asyncio
import uuid
from datetime import datetime, timezone

from database import get_db


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
                conn.execute("UPDATE repairs SET slaBreached = 1, updatedAt = ? WHERE id = ?", (now_str, repair_id))

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
                already_warned = conn.execute(
                    "SELECT COUNT(*) FROM notifications WHERE relatedId = ? AND type = 'sla_warning'",
                    (repair_id,)
                ).fetchone()[0]

                if already_warned == 0:
                    if assigned_to:
                        conn.execute(
                            "INSERT INTO notifications (id, userId, title, message, type, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            (str(uuid.uuid4()), assigned_to, "⏳ 任务即将超期", f"您的任务（{dorm_building} {dorm_room}）即将超时（剩余 {int(remaining_sec / 60)} 分钟），请尽快处理！", "sla_warning", repair_id, 0, now_str)
                        )
                    else:
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
    await asyncio.sleep(10)
    while True:
        try:
            await check_sla_compliance()
        except Exception as e:
            print(f"[SLA Loop] Error: {e}")
        await asyncio.sleep(60)
