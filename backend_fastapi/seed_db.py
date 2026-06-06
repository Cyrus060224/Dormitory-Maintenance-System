import sqlite3
import uuid
import time
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

def seed():
    conn = sqlite3.connect("dorm.db")
    cursor = conn.cursor()
    
    # Check if we already have users
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    if count > 0:
        print("Database already has users. Skipping seeding.")
        conn.close()
        return
    
    users = [
        {
            "name": "管理员",
            "email": "admin@example.com",
            "password": "admin123",
            "role": "admin",
            "studentId": None,
            "dormRoom": None,
            "phone": "13800000000",
            "skills": None,
        },
        {
            "name": "学生测试",
            "email": "student@example.com",
            "password": "student123",
            "role": "student",
            "studentId": "20230001",
            "dormRoom": "A302",
            "phone": "13800000001",
            "skills": None,
        },
        {
            "name": "水电工张师傅",
            "email": "tech1@example.com",
            "password": "tech123",
            "role": "technician",
            "studentId": None,
            "dormRoom": None,
            "phone": "13800000002",
            "skills": "water,electricity",
        },
        {
            "name": "网络家具李师傅",
            "email": "tech2@example.com",
            "password": "tech123",
            "role": "technician",
            "studentId": None,
            "dormRoom": None,
            "phone": "13800000003",
            "skills": "network,furniture",
        }
    ]
    
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    for u in users:
        uid_str = str(uuid.uuid4())
        hashed = pwd_context.hash(u["password"])
        cursor.execute(
            "INSERT INTO users (id, name, email, password, role, studentId, dormRoom, phone, skills, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (uid_str, u["name"], u["email"], hashed, u["role"], u["studentId"], u["dormRoom"], u["phone"], u["skills"], now)
        )
    conn.commit()
    print("Database successfully seeded with default test accounts:")
    print("  - Admin: admin@example.com / admin123")
    print("  - Student: student@example.com / student123")
    print("  - Water/Electric Tech: tech1@example.com / tech123")
    print("  - Network/Furniture Tech: tech2@example.com / tech123")
    conn.close()

if __name__ == "__main__":
    seed()
