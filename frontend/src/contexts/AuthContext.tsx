import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { API_BASE_URL } from '../config/constants';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Decode JWT payload without verification (for reading role/name immediately)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      fetchUser(storedToken);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  async function fetchUser(t: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json() as { success: boolean; data: User };
      if (data.success && data.data) {
        // Only update user if we got valid data back
        setUser(data.data);
        setToken(t);
        setIsAuthenticated(true);
      } else {
        // /api/auth/me failed - only clear auth if this is initial load (not during login)
        localStorage.removeItem('token');
        setIsAuthenticated(false);
      }
    } catch {
      // Network error on initial load - clear auth
      localStorage.removeItem('token');
      setIsAuthenticated(false);
    }
  }

  // login: stores token, immediately sets user from JWT payload (authoritative source)
  // then tries to fetch full user info from API (optional enrichment)
  async function login(newToken: string): Promise<void> {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    // Immediately decode JWT to get role/name - this is the authoritative source
    const payload = decodeJwtPayload(newToken);
    if (payload) {
      const jwtUser: User = {
        id: payload.userId as string,
        name: (payload.name as string) || '',
        email: payload.email as string,
        role: (payload.role as 'student' | 'technician' | 'admin') || 'student',
      };
      setUser(jwtUser);
      setIsAuthenticated(true);
      // Try to enrich with full user data from API, but don't override role from JWT
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        const data = await res.json() as { success: boolean; data: User };
        if (data.success && data.data) {
          // Merge: use DB data but keep JWT role as fallback if DB role is missing
          setUser({
            ...data.data,
            role: data.data.role || jwtUser.role,
          });
        }
        // If API fails, keep the JWT-decoded user (already set above)
      } catch {
        // API call failed, keep JWT-decoded user - do NOT clear auth
      }
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
