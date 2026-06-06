import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { User, ApiResponse } from '../types';
import { toast } from 'sonner';
import {
  Wrench, Home, BarChart2, LogOut,
  RefreshCw
} from 'lucide-react';
import { API, authFetch } from '../lib/api';
import NotificationsMenu from '../components/custom/NotificationsMenu';
import AnnouncementsBanner from '../components/custom/AnnouncementsBanner';
import StudentView from '../components/dashboard/StudentView';
import TechnicianView from '../components/dashboard/TechnicianView';
import AdminView from '../components/dashboard/AdminView';
import SubaoChatWidget from '../components/dashboard/SubaoChatWidget';
import SettingsModal from '../components/dashboard/SettingsModal';
import { Badge } from '../components/shared/StatusBadge';

export default function Index() {
  const { user, token, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [profile, setProfile] = useState<User | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(API.AUTH.ME, token);
      const data = await res.json() as ApiResponse<User>;
      if (data.success) {
        setProfile(data.data);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }, [token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const displayProfile = profile || user;
  const roleLabel = displayProfile.role === 'student' ? t('role_student') : displayProfile.role === 'technician' ? t('role_technician') : t('role_admin');
  const roleColor = displayProfile.role === 'admin' ? 'bg-purple-100 text-purple-700' : displayProfile.role === 'technician' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';

  const showProfile = () => {
    toast(
      <div className="flex flex-col gap-1 text-sm font-medium">
        <p className="font-bold text-foreground text-base border-b border-border/50 pb-1 mb-1">👤 个人资料</p>
        <p className="text-muted-foreground"><span className="text-foreground font-semibold">姓名：</span>{displayProfile.name}</p>
        <p className="text-muted-foreground"><span className="text-foreground font-semibold">身份：</span>{roleLabel}</p>
        <p className="text-muted-foreground"><span className="text-foreground font-semibold">邮箱：</span>{displayProfile.email}</p>
        {displayProfile.studentId && <p className="text-muted-foreground"><span className="text-foreground font-semibold">学号：</span>{displayProfile.studentId}</p>}
        {displayProfile.dormRoom && <p className="text-muted-foreground"><span className="text-foreground font-semibold">宿舍：</span>{displayProfile.dormRoom}</p>}
        {displayProfile.phone && <p className="text-muted-foreground"><span className="text-foreground font-semibold">电话：</span>{displayProfile.phone}</p>}
      </div>,
      {
        duration: 4000,
        className: "bg-white border border-border/80 rounded-2xl shadow-xl p-4",
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div
            onClick={() => window.location.reload()}
            className="flex items-center gap-3 cursor-pointer select-none group"
            title={language === 'zh' ? '刷新工作台' : 'Refresh dashboard'}
          >
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center group-hover:scale-105 active:scale-95 transition">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground leading-tight group-hover:text-primary transition">{t('title')}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition font-medium"
              title={language === 'zh' ? 'Switch to English' : '切换为中文'}
            >
              <span>🌐</span>
              <span className="hidden sm:inline font-medium">{language === 'zh' ? 'EN' : '中文'}</span>
            </button>
            <NotificationsMenu token={token} />
            <div
              onClick={() => setIsSettingsOpen(true)}
              className="hidden sm:flex items-center gap-2 cursor-pointer hover:bg-muted p-1.5 rounded-xl transition duration-200 active:scale-95 select-none"
              title={t('settings')}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shadow-inner">
                <span className="text-primary font-semibold text-sm">{displayProfile.name.charAt(0)}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground leading-tight">{displayProfile.name}</p>
                <Badge label={roleLabel} colorClass={roleColor} />
              </div>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <AnnouncementsBanner token={token} role={displayProfile.role} />
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 mb-6 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">{t('welcome')}</p>
              <h2 className="text-xl font-bold mt-0.5">{displayProfile.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/80 text-sm">{roleLabel}</span>
                {displayProfile.dormRoom && <span className="text-white/60 text-sm">· {displayProfile.dormRoom}</span>}
              </div>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center hover:scale-110 hover:rotate-6 transition duration-300 select-none shadow-lg">
              {displayProfile.role === 'student' ? <Home className="w-7 h-7 text-white animate-bounce-subtle" /> :
               displayProfile.role === 'technician' ? <Wrench className="w-7 h-7 text-white" /> :
               <BarChart2 className="w-7 h-7 text-white" />}
            </div>
          </div>
        </div>

        {/* Role-based view */}
        {user.role === 'student' && <StudentView token={token} />}
        {user.role === 'technician' && <TechnicianView token={token} />}
        {user.role === 'admin' && <AdminView token={token} />}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        token={token}
        initialProfile={displayProfile}
        onProfileUpdated={loadProfile}
      />
      <SubaoChatWidget token={token} role={displayProfile.role} />
    </div>
  );
}
