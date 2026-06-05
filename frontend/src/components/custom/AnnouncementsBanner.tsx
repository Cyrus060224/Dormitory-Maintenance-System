import React, { useState, useEffect, useCallback } from 'react';
import { API, authFetch } from '../../lib/api';
import { Announcement } from '../../types';
import { toast } from 'sonner';
import { Megaphone, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AnnouncementsBanner({ token, role }: { token: string | null; role: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const loadAnnouncements = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(API.ANNOUNCEMENTS.LIST, token);
      const data = await res.json();
      if (data.success) {
        setAnnouncements(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % announcements.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [announcements.length]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch(API.ANNOUNCEMENTS.CREATE, token, {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('发布成功');
        setNewTitle('');
        setNewContent('');
        setShowModal(false);
        loadAnnouncements();
      } else {
        toast.error(data.message || '发布失败');
      }
    } catch (e) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条公告吗？')) return;
    try {
      const res = await authFetch(API.ANNOUNCEMENTS.DELETE(id), token, { method: 'DELETE' });
      if (res.ok) {
        toast.success('删除成功');
        if (currentIndex >= announcements.length - 1) {
            setCurrentIndex(Math.max(0, announcements.length - 2));
        }
        loadAnnouncements();
      }
    } catch (e) {
      toast.error('删除失败');
    }
  };

  if (announcements.length === 0 && role !== 'admin') return null;

  return (
    <div className="mb-6">
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 text-orange-600" />
          </div>
          {announcements.length > 0 ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-900 truncate">
                {announcements[currentIndex]?.title}
              </p>
              <p className="text-xs text-orange-700 truncate mt-0.5">
                {announcements[currentIndex]?.content}
              </p>
            </div>
          ) : (
            <p className="text-sm text-orange-700">暂无公告</p>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {announcements.length > 1 && (
            <div className="flex gap-1 mr-2 hidden sm:flex">
              <button 
                onClick={() => setCurrentIndex((prev) => (prev - 1 + announcements.length) % announcements.length)}
                className="p-1 rounded-full hover:bg-orange-100 text-orange-600 focus:outline-none"
              ><ChevronLeft className="w-4 h-4" /></button>
              <button 
                onClick={() => setCurrentIndex((prev) => (prev + 1) % announcements.length)}
                className="p-1 rounded-full hover:bg-orange-100 text-orange-600 focus:outline-none"
              ><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          {role === 'admin' && (
            <>
              {announcements.length > 0 && (
                <button onClick={() => handleDelete(announcements[currentIndex].id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="删除公告">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition">
                <Plus className="w-3 h-3" /> 发布公告
              </button>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">发布新公告</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题</label>
                <input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border focus:ring-2 focus:ring-primary/50 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">内容</label>
                <textarea required rows={4} value={newContent} onChange={e => setNewContent(e.target.value)} className="w-full px-3 py-2 rounded-xl border focus:ring-2 focus:ring-primary/50 outline-none resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl border text-sm hover:bg-muted">取消</button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-white text-sm hover:opacity-90">发布</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
