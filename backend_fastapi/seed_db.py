import sqlite3
import uuid
import time
import random
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


def now_str(dt=None):
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def random_dt(days_ago_min, days_ago_max):
    days = random.uniform(days_ago_min, days_ago_max)
    return datetime.now(timezone.utc) - timedelta(days=days, hours=random.randint(0, 23), minutes=random.randint(0, 59))


def rid():
    return str(uuid.uuid4())


def seed():
    conn = sqlite3.connect("dorm.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check if data already exists
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    if count > 0:
        print("Database already has users. Skipping seeding.")
        conn.close()
        return

    # ========== 基础账号 ==========
    print("👤 Creating accounts...")
    accounts = [
        ("管理员", "admin@example.com", "admin123", "admin", None, None, "13800000000", None),
        ("学生测试", "student@example.com", "student123", "student", "20230001", "A302", "13800000001", None),
        ("水电工张师傅", "tech1@example.com", "tech123", "technician", None, None, "13800000002", "water,electricity"),
        ("网络家具李师傅", "tech2@example.com", "tech123", "technician", None, None, "13800000003", "network,furniture"),
    ]

    now = now_str()
    for name, email, pw, role, sid, room, phone, skills in accounts:
        cursor.execute(
            "INSERT INTO users (id,name,email,password,role,studentId,dormRoom,phone,skills,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (rid(), name, email, pwd_context.hash(pw), role, sid, room, phone, skills, now)
        )

    # ========== 模拟用户 ==========
    students_data = [
        ("陈小明", "chenxm@qq.com", "20230101", "A-301", "13800138001"),
        ("李雨涵", "liyuh@163.com", "20230102", "A-302", "13800138002"),
        ("张伟", "zhangw@126.com", "20230205", "B-205", "13800138003"),
        ("王芳", "wangf@qq.com", "20230210", "B-310", "13800138004"),
        ("刘洋", "liuy@gmail.com", "20230301", "C-101", "13800138005"),
        ("赵静", "zhaoj@163.com", "20230315", "C-215", "13800138006"),
        ("孙浩然", "sunhr@qq.com", "20230401", "D-401", "13800138007"),
        ("周晓燕", "zhouxy@126.com", "20230410", "D-502", "13800138008"),
    ]

    techs_data = [
        ("李师傅", "tech_li@qq.com", "water,electricity"),
        ("王师傅", "tech_wang@qq.com", "furniture,network"),
        ("赵师傅", "tech_zhao@qq.com", "water,furniture,electricity"),
    ]

    student_ids = []
    for name, email, sid, room, phone in students_data:
        uid = rid()
        student_ids.append(uid)
        cursor.execute("INSERT INTO users (id,name,email,password,role,studentId,dormRoom,phone,createdAt) VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, name, email, pwd_context.hash("123456"), "student", sid, room, phone, now_str(random_dt(30, 40))))

    tech_ids = []
    for name, email, skills in techs_data:
        uid = rid()
        tech_ids.append(uid)
        cursor.execute("INSERT INTO users (id,name,email,password,role,skills,createdAt) VALUES (?,?,?,?,?,?,?)",
            (uid, name, email, pwd_context.hash("123456"), "technician", skills, now_str(random_dt(30, 40))))

    print(f"  {len(students_data)} students + {len(techs_data)} technicians created")

    # ========== 报修工单 ==========
    print("🔧 Creating repair tickets...")
    templates = [
        ("water", "high", ["宿舍卫生间水龙头一直滴水关不紧", "洗手台下水管漏水地面总是湿的", "淋浴花洒水压不够水流很小", "卫生间马桶冲水后一直有水流声"]),
        ("water", "urgent", ["宿舍水管爆裂水漫金山急需处理！", "楼上漏水到我们宿舍天花板在滴水"]),
        ("electricity", "normal", ["宿舍插座松了插头插不稳", "阳台灯开关接触不良需要按好几次才亮", "空调遥控器失灵空调无法正常开关"]),
        ("electricity", "high", ["宿舍突然跳闸整间没电了", "插座冒烟了很危险请尽快维修"]),
        ("electricity", "urgent", ["卫生间插座漏电有触电危险！紧急！"]),
        ("furniture", "normal", ["书桌抽屉轨道坏了拉不出来", "椅子腿松了坐着摇摇晃晃", "衣柜门合页松了门关不紧", "床架有异响翻身嘎吱嘎吱响"]),
        ("furniture", "low", ["窗户把手有点松不影响使用但想修一下", "门锁有点涩需要润滑"]),
        ("network", "high", ["宿舍网络完全连不上明天有线上考试", "校园网一直断线影响学习"]),
        ("network", "normal", ["网速特别慢下载文件要等很久", "WiFi信号时断时续很不稳定", "网口指示灯不亮无法有线上网"]),
    ]

    buildings = ["A栋", "B栋", "C栋", "D栋"]
    statuses = [("closed", 0.45), ("completed", 0.10), ("pending_evaluation", 0.08),
                ("in_progress", 0.12), ("approved", 0.10), ("pending", 0.10), ("rejected", 0.05)]

    work_notes = [
        "已检查并修复更换了损坏的零件恢复正常",
        "现场排查后发现是管道接口松动已拧紧并做了防水处理",
        "已更换新的插座面板测试正常",
        "维修完成已清理现场功能恢复正常",
        "配件已更换调试完毕运行正常",
        "检查发现是线路老化导致已重新布线",
        "已调试网络设备更换了网线恢复正常连接",
        "家具五金件已更换结构稳固",
    ]

    feedback_texts = [
        "师傅很专业修得很快好评！", "维修及时态度很好非常满意",
        "修好了感谢！", "效率很高问题解决了",
        "师傅很认真负责还帮忙检查了其他地方",
    ]

    repair_ids = []
    for _ in range(30):
        cat, pri, descs = random.choice(templates)
        desc = random.choice(descs)
        student_id = random.choice(student_ids)
        building = random.choice(buildings)
        room_num = random.randint(101, 608)
        created_dt = random_dt(2, 25)
        created = now_str(created_dt)

        # Pick status
        r = random.random()
        cumulative = 0
        status = "pending"
        for s, w in statuses:
            cumulative += w
            if r <= cumulative:
                status = s
                break

        sla_h = {"urgent": 2, "high": 6, "normal": 24, "low": 48}.get(pri, 24)
        sla_due = now_str(created_dt + timedelta(hours=sla_h))

        assigned_to = None
        admin_note = None
        if status in ("approved", "in_progress", "completed", "pending_evaluation", "closed"):
            assigned_to = random.choice(tech_ids)
            tech_idx = tech_ids.index(assigned_to)
            admin_note = f"[🤖 AI智能派单] 根据技能匹配与空闲度，自动分配给：{techs_data[tech_idx][0]}"

        work_note = random.choice(work_notes) if status in ("completed", "pending_evaluation", "closed") else None

        rating = None
        feedback_tags = None
        feedback_text = None
        if status == "closed":
            rating = random.choice([3, 4, 4, 5, 5, 5])
            feedback_text = random.choice(feedback_texts)
            feedback_tags = ",".join(random.sample(["专业", "快速", "态度好", "负责", "细心"], random.randint(1, 3)))

        sla_breached = 1 if (status in ("pending", "approved") and datetime.now(timezone.utc) > datetime.fromisoformat(sla_due.replace("Z", "+00:00"))) else 0

        if status == "closed":
            updated_dt = created_dt + timedelta(hours=random.randint(1, sla_h - 1))
        elif status in ("completed", "pending_evaluation"):
            updated_dt = created_dt + timedelta(hours=random.randint(1, sla_h))
        else:
            updated_dt = created_dt + timedelta(minutes=random.randint(5, 120))

        repair_id = rid()
        repair_ids.append(repair_id)
        cursor.execute("""INSERT INTO repairs
            (id,studentId,dormBuilding,dormRoom,category,description,imageUrl,status,priority,
             assignedTo,adminNote,workNote,rating,feedbackTags,feedbackText,slaDueDate,slaBreached,
             aiCategory,aiPriority,createdAt,updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (repair_id, student_id, building, str(room_num), cat, desc, None, status, pri,
             assigned_to, admin_note, work_note, rating, feedback_tags, feedback_text, sla_due, sla_breached,
             cat, pri, created, now_str(updated_dt)))

    print(f"  {len(repair_ids)} repair tickets created")

    # ========== 评论 ==========
    print("💬 Creating comments...")
    comment_count = 0
    for rid_ in random.sample(repair_ids, min(15, len(repair_ids))):
        for j in range(random.randint(1, 3)):
            cid = rid()
            ctime = now_str(random_dt(3, 20))
            if j % 2 == 0:
                user_id = random.choice(student_ids)
                content = random.choice(["请问什么时候能来修？", "师傅大概什么时候到？", "这个问题严重吗？", "能尽快处理吗？"])
            else:
                user_id = random.choice(tech_ids)
                content = random.choice(["收到我下午过去看看", "已经在路上了", "配件已准备好马上到", "已安排处理请耐心等待"])
            cursor.execute("INSERT INTO comments (id,repairId,userId,content,createdAt) VALUES (?,?,?,?,?)",
                (cid, rid_, user_id, content, ctime))
            comment_count += 1
    print(f"  {comment_count} comments created")

    # ========== 评价 ==========
    print("⭐ Creating reviews...")
    review_count = 0
    for rid_ in random.sample(repair_ids, min(12, len(repair_ids))):
        cursor.execute("INSERT INTO reviews (id,requestId,studentId,rating,comment,createdAt) VALUES (?,?,?,?,?,?)",
            (rid(), rid_, random.choice(student_ids), random.choice([4, 4, 5, 5, 5]), random.choice(feedback_texts), now_str(random_dt(1, 15))))
        review_count += 1
    print(f"  {review_count} reviews created")

    # ========== 通知 ==========
    print("🔔 Creating notifications...")
    notif_count = 0
    notif_tpls = [
        ("报修状态已更新", "您的报修申请状态已更新为: 维修中", "repair_status"),
        ("新报修任务分配", "您有一个新的报修任务被自动分配", "repair_assigned"),
        ("⏳ 任务即将超期", "您的任务即将超时请尽快处理！", "sla_warning"),
        ("新评论", "您的工单有新的评论", "new_comment"),
        ("新回复", "您的工单收到了新的回复", "new_comment"),
    ]
    for uid in student_ids + tech_ids:
        for _ in range(random.randint(2, 5)):
            title, msg, ntype = random.choice(notif_tpls)
            cursor.execute("INSERT INTO notifications (id,userId,title,message,type,relatedId,isRead,createdAt) VALUES (?,?,?,?,?,?,?,?)",
                (rid(), uid, title, msg, ntype, random.choice(repair_ids), random.choice([0, 0, 1, 1, 1]), now_str(random_dt(1, 10))))
            notif_count += 1
    print(f"  {notif_count} notifications created")

    # ========== 公告 ==========
    print("📢 Creating announcements...")
    anns = [
        ("五一假期宿舍安全提醒", "各位同学五一假期期间请注意宿舍安全离开前请关闭电源锁好门窗如有紧急报修请联系宿管"),
        ("宿舍热水系统维护通知", "本周三下午2点-5点进行热水系统管道维护期间热水供应暂停请同学们提前做好准备"),
        ("新学期报修流程说明", "新学期开始如需报修请通过系统在线提交维修师傅会在24小时内响应紧急情况请直接联系宿管"),
    ]
    for title, content in anns:
        cursor.execute("INSERT INTO announcements (id,title,content,authorId,createdAt) VALUES (?,?,?,?,?)",
            (rid(), title, content, random.choice(tech_ids), now_str(random_dt(5, 20))))
    print(f"  {len(anns)} announcements created")

    # ========== 配件 ==========
    print("🔩 Creating parts inventory...")
    parts_data = [
        ("水管密封圈", 5.5, 150), ("LED灯泡", 12.0, 200), ("电源插座面板", 25.0, 80),
        ("门锁芯", 45.0, 30), ("合页（一对）", 18.0, 60), ("网线（1米）", 3.0, 500),
        ("花洒喷头", 35.0, 40), ("水龙头阀芯", 15.0, 100),
    ]
    part_ids = []
    for name, price, stock in parts_data:
        pid = rid()
        part_ids.append(pid)
        cursor.execute("INSERT INTO parts (id,name,price,stock,createdAt) VALUES (?,?,?,?,?)",
            (pid, name, price, stock, now_str(random_dt(30, 40))))

    rp_count = 0
    for rid_ in random.sample(repair_ids, min(8, len(repair_ids))):
        for _ in range(random.randint(1, 2)):
            pid = random.choice(part_ids)
            qty = random.randint(1, 3)
            part_row = cursor.execute("SELECT price FROM parts WHERE id = ?", (pid,)).fetchone()
            price = part_row["price"] if part_row else 10.0
            cursor.execute("INSERT INTO repair_parts (id,repairId,partId,quantity,price,createdAt) VALUES (?,?,?,?,?,?)",
                (rid(), rid_, pid, qty, price, now_str(random_dt(1, 15))))
            cursor.execute("UPDATE parts SET stock = stock - ? WHERE id = ?", (qty, pid))
            rp_count += 1
    print(f"  {rp_count} parts consumption records created")

    conn.commit()
    conn.close()
    print("\n✅ All seed data generated successfully!")
    print("\nTest accounts:")
    print("  Admin:     admin@example.com / admin123")
    print("  Student:   student@example.com / student123")
    print("  Tech (水): tech1@example.com / tech123")
    print("  Tech (网): tech2@example.com / tech123")


if __name__ == "__main__":
    seed()
