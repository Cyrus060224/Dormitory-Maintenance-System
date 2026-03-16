import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { reviews, repairRequests, insertReviewSchema } from '../db/schema';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { eq, and } from 'drizzle-orm';

const router = Router();

// POST /api/reviews - submit review
router.post('/', authenticateJWT, requireRole('student'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const schema = insertReviewSchema.omit({ studentId: true });
    const validated = schema.parse(req.body);
    // Check request belongs to student and is completed
    const [request] = await db.select().from(repairRequests)
      .where(and(eq(repairRequests.id, validated.requestId as string), eq(repairRequests.studentId, user.id)))
      .limit(1);
    if (!request) return res.status(404).json({ success: false, message: '报修单不存在' });
    if (request.status !== 'completed') {
      return res.status(400).json({ success: false, message: '只能对已完成的报修进行评价' });
    }
    // Check not already reviewed
    const existing = await db.select().from(reviews)
      .where(and(eq(reviews.requestId, validated.requestId as string), eq(reviews.studentId, user.id)))
      .limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '已经评价过该报修单' });
    }
    const [review] = await db.insert(reviews).values({
      requestId: validated.requestId as string,
      studentId: user.id,
      rating: validated.rating as number,
      comment: validated.comment,
    } as typeof reviews.$inferInsert).returning();
    return res.status(201).json({ success: true, data: review });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('Create review error:', err);
    return res.status(500).json({ success: false, message: '提交评价失败' });
  }
});

// GET /api/reviews - get reviews (admin)
router.get('/', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const results = await db.select().from(reviews).orderBy(reviews.createdAt);
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('Get reviews error:', err);
    return res.status(500).json({ success: false, message: '获取评价失败' });
  }
});

export default router;
