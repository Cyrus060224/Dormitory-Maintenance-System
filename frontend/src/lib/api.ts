const isDev = import.meta.env.DEV;

const API_BASE_URL = isDev ? '' : (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000');

export const API = {
  BASE: API_BASE_URL,
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
  },
  REVIEWS: {
    CREATE: `${API_BASE_URL}/api/reviews`,
  },
  USERS: {
    LIST: `${API_BASE_URL}/api/users`,
    TECHNICIANS: `${API_BASE_URL}/api/users/technicians`,
    UPDATE: (id: string) => `${API_BASE_URL}/api/users/${id}`,
  },
  STATS: {
    GET: `${API_BASE_URL}/api/stats`,
  },
};

export async function apiRequest(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(token || ''),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('TOKEN_EXPIRED');
  }
  return res;
}
