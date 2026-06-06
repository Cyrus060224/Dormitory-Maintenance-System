export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'technician' | 'admin';
  studentId?: string;
  dormRoom?: string;
  phone?: string;
  skills?: string;
  createdAt?: string;
  activeTasksCount?: number;
}

export interface RepairRequest {
  id: string;
  studentId?: string;
  dormBuilding: string;
  dormRoom: string;
  category: 'water' | 'electricity' | 'furniture' | 'network' | 'other';
  description: string;
  imageUrl?: string;
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'pending_evaluation' | 'closed' | 'rejected';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string;
  adminNote?: string;
  workNote?: string;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  assignedToName?: string;
  rating?: number;
  feedbackTags?: string;
  feedbackText?: string;
  slaDueDate?: string;
  slaBreached?: number;
  aiCategory?: 'water' | 'electricity' | 'furniture' | 'network' | 'other';
  aiPriority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface RepairTask {
  id: string;
  requestId: string;
  technicianId: string;
  status: 'assigned' | 'in_progress' | 'completed';
  workNote?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  dormBuilding?: string;
  dormRoom?: string;
  category?: string;
  description?: string;
  priority?: string;
  requestStatus?: string;
  studentName?: string;
}

export interface Review {
  id: string;
  requestId: string;
  studentId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface Stats {
  totalRequests: number;
  pendingRequests: number;
  inProgressRequests: number;
  completedRequests: number;
  rejectedRequests: number;
  totalUsers: number;
  studentCount: number;
  technicianCount: number;
  categoryStats: { category: string; count: number }[];
  avgRating: string;
  reviewCount: number;
  trendData?: { date: string; count: number }[];
  slaComplianceRate?: number;
  averageResponseTimeHours?: number;
  totalCost?: number;
  partsConsumedStats?: { name: string; count: number; totalCost: number }[];
}

export interface Part {
  id: string;
  name: string;
  price: number;
  stock: number;
  createdAt: string;
}

export interface RepairPart {
  id: string;
  repairId: string;
  partId: string;
  quantity: number;
  price: number;
  partName?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  repairId: string;
  userId: string;
  content: string;
  createdAt: string;
  userName?: string;
  userRole?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedId?: string;
  isRead: number;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: string;
  authorName?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedApiResponse<T> extends ApiResponse<T> {
  total: number;
  page?: number;
  pageSize?: number;
}

export interface AIConfig {
  id: string;
  name: string;
  provider: 'simulation' | 'openai' | 'deepseek' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
