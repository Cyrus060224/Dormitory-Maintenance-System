import { Router, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { eq, ne } from 'drizzle-orm';

const router = Router();

// GET /api/users - admin get all users
router.get('/', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      studentId: users.studentId,
      dormRoom: users.dormRoom,
      phone: users.phone,
      createdAt: users.createdAt,
    }).from(users).orderBy(users.createdAt);
    return res.json({ success: true, data: allUsers });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// GET /api/users/technicians - get technicians list
router.get('/technicians', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const technicians = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
    }).from(users).where(eq(users.role, 'technician'));
    return res.json({ success: true, data: technicians });
  } catch (err) {
    console.error('Get technicians error:', err);
    return res.status(500).json({ success: false, message: '获取维修人员列表失败' });
  }
});

// DELETE /api/users/:id - admin delete user
router.delete('/:id', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    if (result.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });
    return res.json({ success: true, data: null });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ success: false, message: '删除用户失败' });
  }
});

export default router;
