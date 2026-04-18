import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dorm-repair-secret-key';

const signupSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6个字符'),
  confirmPassword: z.string(),
  role: z.enum(['student', 'technician', 'admin']).default('student'),
  studentId: z.string().optional(),
  dormRoom: z.string().optional(),
  phone: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const validated = signupSchema.parse(req.body);
    const roleToInsert = validated.role || 'student';
    console.log('[Signup] Registering user with role:', roleToInsert, 'email:', validated.email);
    const existing = await db.select().from(users).where(eq(users.email, validated.email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '该邮箱已被注册' });
    }
    const hashedPassword = await bcrypt.hash(validated.password, 12);
    const insertData = {
      name: validated.name,
      email: validated.email,
      password: hashedPassword,
      role: roleToInsert,
      studentId: validated.studentId || null,
      dormRoom: validated.dormRoom || null,
      phone: validated.phone || null,
    };
    console.log('[Signup] Inserting user data:', { ...insertData, password: '[HIDDEN]' });
    const [user] = await db.insert(users).values(insertData as typeof users.$inferInsert).returning();
    console.log('[Signup] User created with role:', user.role, 'id:', user.id);
    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('[Signup] Zod validation error:', err.errors);
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('[Signup] Error:', err);
    return res.status(500).json({ success: false, message: '注册失败，请稍后重试' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: err.errors[0].message });
    }
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: '登录失败，请稍后重试' });
  }
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未授权' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; name: string; email: string; role: string };
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    console.log('[/me] User from DB - id:', user.id, 'role:', user.role, 'JWT role:', decoded.role);
    const effectiveRole = user.role || decoded.role;
    return res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: effectiveRole, studentId: user.studentId, dormRoom: user.dormRoom, phone: user.phone },
    });
  } catch (err) {
    console.error('[/me] Token verification error:', err);
    return res.status(401).json({ success: false, message: 'Token 无效' });
  }
});

export default router;
