import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Index from './pages/Index';
import Login from './components/custom/Login';
import Signup from './components/custom/Signup';
import LandingPage from './pages/LandingPage';

import { LanguageProvider } from './contexts/LanguageContext';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      {/* 落地页 - 默认路由（未登录用户可见） */}
      <Route
        path="/"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />}
      />
      {/* 登录页 */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      {/* 注册页 */}
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Signup />}
      />
      {/* 控制台（已登录用户专属） */}
      <Route
        path="/dashboard"
        element={isAuthenticated ? <Index /> : <Navigate to="/login" replace />}
      />
      {/* 兼容旧路径 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <LanguageProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </LanguageProvider>
      </AuthProvider>
    </HashRouter>
  );
}
