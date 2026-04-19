export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'technician' | 'admin';
  studentId?: string;
  dormRoom?: string;
  phone?: string;
  createdAt?: string;
}

export interface RepairRequest {
  id: string;
  studentId?: string;
  dormBuilding: string;
  dormRoom: string;
  category: 'water' | 'electricity' | 'furniture' | 'network' | 'other';
  description: string;
  imageUrl?: string;
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  assignedToName?: string;
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
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
