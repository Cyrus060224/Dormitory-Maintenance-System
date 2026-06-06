import os
import time
import uuid
import sqlite3

# ─── Paths ─────────────────────────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "dorm.db"))
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")


# ─── Database Connection ──────────────────────────────────────────────────────
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Schema Initialization ────────────────────────────────────────────────────
def init_db():
    """初始化数据库表结构"""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            studentId TEXT,
            dormRoom TEXT,
            phone TEXT,
            skills TEXT,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repairs (
            id TEXT PRIMARY KEY,
            studentId TEXT NOT NULL,
            dormBuilding TEXT NOT NULL,
            dormRoom TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            imageUrl TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            priority TEXT NOT NULL DEFAULT 'normal',
            assignedTo TEXT,
            adminNote TEXT,
            workNote TEXT,
            rating INTEGER,
            feedbackTags TEXT,
            feedbackText TEXT,
            slaDueDate TEXT,
            slaBreached INTEGER DEFAULT 0,
            aiCategory TEXT,
            aiPriority TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            requestId TEXT NOT NULL,
            studentId TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            repairId TEXT NOT NULL,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            relatedId TEXT,
            isRead INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            authorId TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS parts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repair_parts (
            id TEXT PRIMARY KEY,
            repairId TEXT NOT NULL,
            partId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            createdAt TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ai_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            apiKey TEXT,
            baseUrl TEXT,
            model TEXT,
            systemPrompt TEXT,
            isActive INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    """)

    # 数据库迁移：为已有数据库添加新字段
    migration_add_columns(conn)

    conn.commit()
    conn.close()


def migration_add_columns(conn: sqlite3.Connection):
    """为已有数据库添加评价及SLA相关字段（SQLite 不支持直接 ADD COLUMN IF NOT EXISTS）"""
    try:
        # Check users table
        user_columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if 'skills' not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN skills TEXT")

        # 检查 rating 字段是否存在
        columns = [row[1] for row in conn.execute("PRAGMA table_info(repairs)").fetchall()]
        if 'rating' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN rating INTEGER")
        if 'feedbackTags' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN feedbackTags TEXT")
        if 'feedbackText' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN feedbackText TEXT")
        if 'workNote' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN workNote TEXT")
        if 'slaDueDate' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN slaDueDate TEXT")
        if 'slaBreached' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN slaBreached INTEGER DEFAULT 0")
        if 'aiCategory' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN aiCategory TEXT")
        if 'aiPriority' not in columns:
            conn.execute("ALTER TABLE repairs ADD COLUMN aiPriority TEXT")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                repairId TEXT NOT NULL,
                userId TEXT NOT NULL,
                content TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                relatedId TEXT,
                isRead INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                authorId TEXT NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS parts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS repair_parts (
                id TEXT PRIMARY KEY,
                repairId TEXT NOT NULL,
                partId TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                createdAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT NOT NULL,
                apiKey TEXT,
                baseUrl TEXT,
                model TEXT,
                systemPrompt TEXT,
                isActive INTEGER DEFAULT 0,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        """)
        # Seed a default simulation AI config if the table is empty
        row = conn.execute("SELECT COUNT(*) FROM ai_configs").fetchone()
        if row and row[0] == 0:
            now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            conn.execute("""
                INSERT INTO ai_configs (id, name, provider, apiKey, baseUrl, model, systemPrompt, isActive, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()),
                "宿宝 (模拟引擎)",
                "simulation",
                "",
                "",
                "simulation-model",
                "你是一个可爱的宿舍生活助手，名字叫'宿宝'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。",
                1,
                now,
                now
            ))
    except Exception as e:
        print(f"[Migration] Error: {e}")


# ─── Status Constants ─────────────────────────────────────────────────────────
VALID_STATUSES = {'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'}
STATUS_LABELS = {
    'pending': '待处理',
    'approved': '已审核',
    'in_progress': '维修中',
    'completed': '已完成',
    'pending_evaluation': '待评价',
    'closed': '已结案',
    'rejected': '已拒绝',
}
