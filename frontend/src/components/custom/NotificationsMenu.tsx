import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check } from 'lucide-react';
import { API, authFetch } from '../../lib/api';
import { Notification } from '../../types';
import { toast } from 'sonner';

export default function NotificationsMenu({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(API.NOTIFICATIONS.LIST, token);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: string) => {
    try {
      const res = await authFetch(API.NOTIFICATIONS.MARK_READ(id), token, { method: 'PATCH' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n));
      }
    } catch (e) {
      toast.error('操作失败');
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await authFetch(API.NOTIFICATIONS.MARK_ALL_READ, token, { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
        toast.success('全部标为已读');
      }
    } catch (e) {
      toast.error('操作失败');
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
        className="p-2 rounded-xl hover:bg-muted transition relative focus:outline-none"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-border shadow-xl rounded-2xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="p-3 border-b border-border flex justify-between items-center bg-muted/30">
            <h3 className="font-semibold text-sm">消息通知</h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Check className="w-3 h-3" /> 全部标为已读
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">暂无通知</p>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-3 rounded-xl text-sm flex gap-3 ${n.isRead ? 'opacity-60' : 'bg-primary/5'}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{n.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {!n.isRead && (
                    <button onClick={() => markAsRead(n.id)} className="shrink-0 text-primary hover:text-primary/80 self-center">
                      <span className="w-2 h-2 rounded-full bg-primary block" title="标为已读" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
