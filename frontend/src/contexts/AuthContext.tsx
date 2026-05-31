import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Decode JWT payload without verification (for reading role/name immediately)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1];
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function userFromToken(token: string): User | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
  return {
    id: payload.userId as string,
    name: (payload.name as string) || '',
    email: payload.email as string,
    role: (payload.role as 'student' | 'technician' | 'admin') || 'student',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // On mount: restore session from localStorage using JWT decode only
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      const decoded = userFromToken(storedToken);
      if (decoded) {
        setUser(decoded);
        setToken(storedToken);
        setIsAuthenticated(true);
      } else {
        // Token is malformed
        localStorage.removeItem('token');
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // login: store token and immediately set user from JWT payload
  // This is synchronous and reliable - no API call needed
  function login(newToken: string): void {
    const decoded = userFromToken(newToken);
    if (!decoded) {
      console.error('[AuthContext] Failed to decode token');
      return;
    }
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(decoded);
    setIsAuthenticated(true);
    console.log('[AuthContext] login() - user set from JWT:', decoded.name, 'role:', decoded.role);
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
