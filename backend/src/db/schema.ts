import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull().default('student'), // student | technician | admin
  studentId: text('student_id'),
  dormRoom: text('dorm_room'),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertUserSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  role: z.enum(['student', 'technician', 'admin']).default('student'),
  studentId: z.string().optional().nullable(),
  dormRoom: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Repair requests table
export const repairRequests = pgTable('repair_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id),
  dormBuilding: text('dorm_building').notNull(),
  dormRoom: text('dorm_room').notNull(),
  category: text('category').notNull(), // water | electricity | furniture | network | other
  description: text('description').notNull(),
  imageUrl: text('image_url'),
  status: text('status').notNull().default('pending'), // pending | approved | in_progress | completed | rejected
  priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
  assignedTo: uuid('assigned_to').references(() => users.id),
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertRepairRequestSchema = z.object({
  studentId: z.string().uuid(),
  dormBuilding: z.string().min(1, '宿舍楼不能为空'),
  dormRoom: z.string().min(1, '房间号不能为空'),
  category: z.enum(['water', 'electricity', 'furniture', 'network', 'other']),
  description: z.string().min(5, '问题描述至少5个字'),
  imageUrl: z.string().optional().nullable(),
  status: z.enum(['pending', 'approved', 'in_progress', 'completed', 'rejected']).default('pending'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().uuid().optional().nullable(),
  adminNote: z.string().optional().nullable(),
});

export type RepairRequest = typeof repairRequests.$inferSelect;
export type InsertRepairRequest = typeof repairRequests.$inferInsert;

// Repair tasks table (assigned work)
export const repairTasks = pgTable('repair_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => repairRequests.id),
  technicianId: uuid('technician_id').notNull().references(() => users.id),
  status: text('status').notNull().default('assigned'), // assigned | in_progress | completed
  workNote: text('work_note'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertRepairTaskSchema = z.object({
  requestId: z.string().uuid(),
  technicianId: z.string().uuid(),
  status: z.enum(['assigned', 'in_progress', 'completed']).default('assigned'),
  workNote: z.string().optional().nullable(),
  startedAt: z.date().optional().nullable(),
  completedAt: z.date().optional().nullable(),
});

export type RepairTask = typeof repairTasks.$inferSelect;
export type InsertRepairTask = typeof repairTasks.$inferInsert;

// Reviews table
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => repairRequests.id),
  studentId: uuid('student_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertReviewSchema = z.object({
  requestId: z.string().uuid(),
  studentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
