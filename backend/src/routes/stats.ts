import { Router, Response } from 'express';
import { db } from '../db';
import { repairRequests, reviews, users } from '../db/schema';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { eq, sql, count } from 'drizzle-orm';

const router = Router();

// GET /api/stats - admin statistics
router.get('/', authenticateJWT, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const [totalRequests] = await db.select({ count: count() }).from(repairRequests);
    const [pendingRequests] = await db.select({ count: count() }).from(repairRequests).where(eq(repairRequests.status, 'pending'));
    const [inProgressRequests] = await db.select({ count: count() }).from(repairRequests).where(eq(repairRequests.status, 'in_progress'));
    const [completedRequests] = await db.select({ count: count() }).from(repairRequests).where(eq(repairRequests.status, 'completed'));
    const [rejectedRequests] = await db.select({ count: count() }).from(repairRequests).where(eq(repairRequests.status, 'rejected'));
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [studentCount] = await db.select({ count: count() }).from(users).where(eq(users.role, 'student'));
    const [technicianCount] = await db.select({ count: count() }).from(users).where(eq(users.role, 'technician'));
    // Category breakdown
    const categoryStats = await db.select({
      category: repairRequests.category,
      count: count(),
    }).from(repairRequests).groupBy(repairRequests.category);
    // Average rating
    const [avgRating] = await db.select({
      avg: sql<number>`COALESCE(AVG(rating), 0)`,
    }).from(reviews);
    return res.json({
      success: true,
      data: {
        totalRequests: totalRequests.count,
        pendingRequests: pendingRequests.count,
        inProgressRequests: inProgressRequests.count,
        completedRequests: completedRequests.count,
        rejectedRequests: rejectedRequests.count,
        totalUsers: totalUsers.count,
        studentCount: studentCount.count,
        technicianCount: technicianCount.count,
        categoryStats,
        avgRating: Number(avgRating.avg).toFixed(1),
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ success: false, message: '获取统计数据失败' });
  }
});

export default router;
