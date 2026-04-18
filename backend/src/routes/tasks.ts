import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { repairTasks, repairRequests, users } from '../db/schema';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// GET /api/tasks - get tasks for technician
router.get('/', authenticateJWT, requireRole('technician', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.authUser!;
    const whereClause = user.role === 'technician' ? eq(repairTasks.technicianId, user.id) : undefined;
    const results = await db.select({
      id: repairTasks.id,
      requestId: repairTasks.requestId,
      technicianId: repairTasks.technicianId,
      status: repairTasks.status,
      workNote: repairTasks.workNote,
      startedAt: repairTasks.startedAt,
      completedAt: repairTasks.completedAt,
      createdAt: repairTasks.createdAt,
      updatedAt: repairTasks.updatedAt,
      dormBuilding: repairRequests.dormBuilding,
      dormRoom: repairRequests.dormRoom,
      category: repairRequests.category,
      description: repairRequests.description,
      priority: repairRequests.priority,
      requestStatus: repairRequests.status,
      studentName: users.name,
    })
      .from(repairTasks)
      .leftJoin(repairRequests, eq(repairTasks.requestId, repairRequests.id))
      .leftJoin(users, eq(repairRequests.studentId, users.id))
      .where(whereClause)
      .orderBy(desc(repairTasks.createdAt));
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('Get tasks error:', err);
    return res.status(500).json({ success: false, message: '获取任务列表失败' });
  }
});

// PATCH /api/tasks/:id - update task status
router.patch('/:id', authenticateJWT, requireRole('technician', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      status: z.enum(['assigned', 'in_progress', 'completed']),
      workNote: z.string().optional(),
    });
    const { status, workNote } = schema.parse(req.body);
    const now = new Date();
    const updateData: Record<string, unknown> = { status, updatedAt: now };
    if (workNote !== undefined) updateData.workNote = workNote;
    if (status === 'in_progress') updateData.startedAt = now;
    if (status === 'completed') {
      updateData.completedAt = now;
      // Also update the repair request status
      const [task] = await db.select().from(repairTasks).where(eq(repairTasks.id, id)).limit(1);
      if (task) {
        await db.update(repairRequests)
          .set({ status: 'completed', updatedAt: now })
          .where(eq(repairRequests.id, task.requestId));
      }
    }
    const [updated] = await db.update(repairTasks)
      .set(updateData as InsertRepairTask)
      .where(eq(repairTasks.id, id))
      .returning();
    if (!updated) return res.status(404).json({ success: false, message: '任务不存在' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('Update task error:', err);
    return res.status(500).json({ success: false, message: '更新任务失败' });
  }
});

type InsertRepairTask = typeof repairTasks.$inferInsert;

export default router;
