const isDev = import.meta.env.DEV;

const API_BASE_URL = isDev ? '' : (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000');

export const API = {
  BASE: API_BASE_URL,
  UPLOAD: `${API_BASE_URL}/api/upload`,
  AUTH: {
    LOGIN: `${API_BASE_URL}/api/login`,
    SIGNUP: `${API_BASE_URL}/api/register`,
    ME: `${API_BASE_URL}/api/users/me`,
  },
  REPAIRS: {
    LIST: `${API_BASE_URL}/api/repairs`,
    CREATE: `${API_BASE_URL}/api/repairs`,
    UPDATE_STATUS: (id: string) => `${API_BASE_URL}/api/repairs/${id}/status`,
    EVALUATE: (id: string) => `${API_BASE_URL}/api/repairs/${id}/evaluate`,
    ANALYZE: `${API_BASE_URL}/api/repairs/analyze`,
    ANALYZE_IMAGE: `${API_BASE_URL}/api/repairs/analyze-image`,
    EXPORT: `${API_BASE_URL}/api/repairs/export`,
    COMMENTS: (id: string) => `${API_BASE_URL}/api/repairs/${id}/comments`,
  },
  REVIEWS: {
    CREATE: `${API_BASE_URL}/api/reviews`,
  },
  NOTIFICATIONS: {
    LIST: `${API_BASE_URL}/api/notifications`,
    MARK_READ: (id: string) => `${API_BASE_URL}/api/notifications/${id}/read`,
    MARK_ALL_READ: `${API_BASE_URL}/api/notifications/read-all`,
  },
  ANNOUNCEMENTS: {
    LIST: `${API_BASE_URL}/api/announcements`,
    CREATE: `${API_BASE_URL}/api/announcements`,
    DELETE: (id: string) => `${API_BASE_URL}/api/announcements/${id}`,
  },
  USERS: {
    LIST: `${API_BASE_URL}/api/users`,
    TECHNICIANS: `${API_BASE_URL}/api/users/technicians`,
    UPDATE: (id: string) => `${API_BASE_URL}/api/users/${id}`,
    UPDATE_PROFILE: `${API_BASE_URL}/api/users/profile`,
    CHANGE_PASSWORD: `${API_BASE_URL}/api/users/change-password`,
    UPDATE_SKILLS: (id: string) => `${API_BASE_URL}/api/users/${id}/skills`,
    CREATE_ADMIN: `${API_BASE_URL}/api/users/create-admin`,
    CREATE_TECHNICIAN: `${API_BASE_URL}/api/users/create-technician`,
  },
  STATS: {
    GET: `${API_BASE_URL}/api/stats`,
  },
  PARTS: {
    LIST: `${API_BASE_URL}/api/parts`,
    CREATE: `${API_BASE_URL}/api/parts`,
    UPDATE: (id: string) => `${API_BASE_URL}/api/parts/${id}`,
    DELETE: (id: string) => `${API_BASE_URL}/api/parts/${id}`,
    REPAIR_PARTS: (repairId: string) => `${API_BASE_URL}/api/repairs/${repairId}/parts`,
  },
  AI: {
    CONFIG_LIST: `${API_BASE_URL}/api/admin/ai-configs`,
    CONFIG_CREATE: `${API_BASE_URL}/api/admin/ai-configs`,
    CONFIG_UPDATE: (id: string) => `${API_BASE_URL}/api/admin/ai-configs/${id}`,
    CONFIG_DELETE: (id: string) => `${API_BASE_URL}/api/admin/ai-configs/${id}`,
    CONFIG_TEST: `${API_BASE_URL}/api/admin/ai-configs/test`,
    CHAT: `${API_BASE_URL}/api/chat`,
  },
};

export async function apiRequest(url: string, options?: RequestInit): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    ...options?.headers,
  } as Record<string, string>;

  if (options?.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}

export function getAuthHeaders(token: string | null): HeadersInit {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

/**
 * 带鉴权的 fetch 封装
 * - 自动注入 Authorization header
 * - 检测 401 响应，触发自动登出
 */
export async function authFetch(url: string, token: string | null, options?: RequestInit): Promise<Response> {
  const headers = {
    ...getAuthHeaders(token || ''),
    ...options?.headers,
  } as Record<string, string>;

  if (options?.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('TOKEN_EXPIRED');
  }
  return res;
}

export async function readApiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { message?: string; detail?: string };
    return data.message || data.detail || fallback;
  } catch {
    return fallback;
  }
}
