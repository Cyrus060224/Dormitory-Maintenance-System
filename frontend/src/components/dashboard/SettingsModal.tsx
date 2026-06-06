import React, { useState, useEffect } from 'react';
import { Shield, Lock, X } from 'lucide-react';
import { API, authFetch } from '../../lib/api';
import { toast } from 'sonner';
import { User, ApiResponse } from '../../types';

export default function SettingsModal({
  isOpen,
  onClose,
  token,
  initialProfile,
  onProfileUpdated
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  initialProfile: User | null;
  onProfileUpdated: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    studentId: '',
    dormRoom: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      setProfileForm({
        name: initialProfile.name || '',
        phone: initialProfile.phone || '',
        studentId: initialProfile.studentId || '',
        dormRoom: initialProfile.dormRoom || ''
      });
    }
  }, [initialProfile, isOpen]);

  if (!isOpen || !initialProfile) return null;

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      toast.error('姓名不能为空');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(API.USERS.UPDATE_PROFILE, token, {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      const data = await res.json() as ApiResponse<User>;
      if (data.success) {
        toast.success('资料更新成功！');
        onProfileUpdated();
        onClose();
      } else {
        toast.error(data.message || '更新失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmNewPassword) {
      toast.error('请填写所有密码字段');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度不能少于6位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(API.USERS.CHANGE_PASSWORD, token, {
        method: 'POST',
        body: JSON.stringify(passwordForm),
      });
      const data = await res.json() as ApiResponse<null>;
      if (data.success) {
        toast.success('密码修改成功！请牢记您的新密码');
        setPasswordForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
        onClose();
      } else {
        toast.error(data.message || '修改密码失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex border-b border-border bg-muted/20">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'profile' ? 'border-b-2 border-primary text-primary bg-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-4 h-4" />
            基本资料
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'password' ? 'border-b-2 border-primary text-primary bg-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Lock className="w-4 h-4" />
            修改密码
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'profile' ? (
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">姓名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">电话</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                  placeholder="未填写电话"
                />
              </div>
              {initialProfile.role === 'student' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">学号</label>
                    <input
                      type="text"
                      value={profileForm.studentId}
                      onChange={(e) => setProfileForm(p => ({ ...p, studentId: e.target.value }))}
                      className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                      placeholder="未填写学号"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">宿舍号</label>
                    <input
                      type="text"
                      value={profileForm.dormRoom}
                      onChange={(e) => setProfileForm(p => ({ ...p, dormRoom: e.target.value }))}
                      className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                      placeholder="如：A-101"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">当前密码 <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm(p => ({ ...p, oldPassword: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                  placeholder="请输入当前密码"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">新密码 <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                  placeholder="至少6位"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">确认新密码 <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) => setPasswordForm(p => ({ ...p, confirmNewPassword: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition pr-10"
                  placeholder="再次输入新密码"
                />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? '修改中...' : '确认修改'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
