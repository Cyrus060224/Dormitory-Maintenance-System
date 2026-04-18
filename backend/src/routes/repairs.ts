import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { repairRequests, users, repairTasks } from '../db/schema';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { eq, desc, sql } from 'drizzle-orm';

const router = Router();

// GET /api/repairs - list repair requests
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.authUser!;
    let results;
    if (user.role === 'student') {
      results = await db.select({
        id: repairRequests.id,
        dormBuilding: repairRequests.dormBuilding,
        dormRoom: repairRequests.dormRoom,
        category: repairRequests.category,
        description: repairRequests.description,
        imageUrl: repairRequests.imageUrl,
        status: repairRequests.status,
        priority: repairRequests.priority,
        adminNote: repairRequests.adminNote,
        createdAt: repairRequests.createdAt,
        updatedAt: repairRequests.updatedAt,
        studentName: users.name,
        assignedToName: sql<string>`(SELECT name FROM users WHERE id = ${repairRequests.assignedTo})`,
      })
        .from(repairRequests)
        .leftJoin(users, eq(repairRequests.studentId, users.id))
        .where(eq(repairRequests.studentId, user.id))
        .orderBy(desc(repairRequests.createdAt));
    } else {
      results = await db.select({
        id: repairRequests.id,
        studentId: repairRequests.studentId,
        dormBuilding: repairRequests.dormBuilding,
        dormRoom: repairRequests.dormRoom,
        category: repairRequests.category,
        description: repairRequests.description,
        imageUrl: repairRequests.imageUrl,
        status: repairRequests.status,
        priority: repairRequests.priority,
        adminNote: repairRequests.adminNote,
        assignedTo: repairRequests.assignedTo,
        createdAt: repairRequests.createdAt,
        updatedAt: repairRequests.updatedAt,
        studentName: users.name,
        assignedToName: sql<string>`(SELECT name FROM users WHERE id = ${repairRequests.assignedTo})`,
      })
        .from(repairRequests)
        .leftJoin(users, eq(repairRequests.studentId, users.id))
        .orderBy(desc(repairRequests.createdAt));
    }
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('Get repairs error:', err);
    return res.status(500).json({ success: false, message: '获取报修列表失败' });
  }
});

// POST /api/repairs - create repair request
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.authUser!;
    console.log('[POST /api/repairs] User:', user.id, 'role:', user.role);
    if (user.role !== 'student') {
      return res.status(403).json({ success: false, message: '只有学生可以提交报修申请' });
    }
    const createRepairSchema = z.object({
      dormBuilding: z.string().min(1, '宿舍楼不能为空'),
      dormRoom: z.string().min(1, '房间号不能为空'),
      category: z.enum(['water', 'electricity', 'furniture', 'network', 'other']),
      description: z.string().min(5, '问题描述至少5个字'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      imageUrl: z.string().optional(),
    });
    const validated = createRepairSchema.parse(req.body);
    console.log('[POST /api/repairs] Validated data:', validated);
    const [request] = await db.insert(repairRequests).values({
      studentId: user.id,
      dormBuilding: validated.dormBuilding,
      dormRoom: validated.dormRoom,
      category: validated.category,
      description: validated.description,
      imageUrl: validated.imageUrl || null,
      priority: validated.priority,
      status: 'pending',
    } as InsertRepairRequest).returning();
    console.log('[POST /api/repairs] Created repair request:', request.id);
    return res.status(201).json({ success: true, data: request });
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('[POST /api/repairs] Zod validation error:', err.errors);
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('[POST /api/repairs] Error:', err);
    return res.status(500).json({ success: false, message: '提交报修失败' });
  }
});

// GET /api/repairs/:id - get single repair
router.get('/:id', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const [request] = await db.select().from(repairRequests).where(eq(repairRequests.id, id)).limit(1);
    if (!request) return res.status(404).json({ success: false, message: '报修单不存在' });
    return res.json({ success: true, data: request });
  } catch (err) {
    console.error('Get repair error:', err);
    return res.status(500).json({ success: false, message: '获取报修单失败' });
  }
});

// PATCH /api/repairs/:id/status - admin updates status and assigns
router.patch('/:id/status', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      status: z.enum(['pending', 'approved', 'in_progress', 'completed', 'rejected']),
      assignedTo: z.string().uuid().optional(),
      adminNote: z.string().optional(),
    });
    const { status, assignedTo, adminNote } = schema.parse(req.body);
    const [updated] = await db.update(repairRequests)
      .set({ status, assignedTo: assignedTo || null, adminNote: adminNote || null, updatedAt: new Date() })
      .where(eq(repairRequests.id, id))
      .returning();
    if (!updated) return res.status(404).json({ success: false, message: '报修单不存在' });
    // If approved and assigned, create a task
    if (status === 'approved' && assignedTo) {
      const existing = await db.select().from(repairTasks).where(eq(repairTasks.requestId, id)).limit(1);
      if (existing.length === 0) {
        await db.insert(repairTasks).values({
          requestId: id,
          technicianId: assignedTo,
          status: 'assigned',
        } as InsertRepairTask);
      } else {
        await db.update(repairTasks)
          .set({ technicianId: assignedTo, updatedAt: new Date() })
          .where(eq(repairTasks.requestId, id));
      }
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('Update status error:', err);
    return res.status(500).json({ success: false, message: '更新状态失败' });
  }
});

type InsertRepairRequest = typeof repairRequests.$inferInsert;
type InsertRepairTask = typeof repairTasks.$inferInsert;

export default router;
