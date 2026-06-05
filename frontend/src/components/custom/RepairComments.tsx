import React, { useState, useEffect, useCallback } from 'react';
import { API, authFetch } from '../../lib/api';
import { Comment } from '../../types';
import { toast } from 'sonner';
import { Send, MessageSquare } from 'lucide-react';

export default function RepairComments({ repairId, token }: { repairId: string; token: string | null }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(API.REPAIRS.COMMENTS(repairId), token);
      const data = await res.json();
      if (data.success) {
        setComments(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [repairId, token]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await authFetch(API.REPAIRS.COMMENTS(repairId), token, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setContent('');
        loadComments();
      } else {
        toast.error(data.message || '发表失败');
      }
    } catch (e) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        评论交流 ({comments.length})
      </h4>
      
      {loading ? (
        <p className="text-xs text-muted-foreground">加载中...</p>
      ) : (
        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="bg-muted/30 rounded-xl p-3 text-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-foreground">
                  {c.userName || '用户'}
                  <span className="text-[10px] text-muted-foreground ml-1 bg-white px-1.5 py-0.5 rounded-md border border-border/50">
                    {c.userRole === 'admin' ? '管理员' : c.userRole === 'technician' ? '维修员' : '学生'}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-foreground/90 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无评论</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input 
          value={content} 
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入评论..." 
          className="flex-1 px-3 py-2 rounded-xl border border-border text-sm focus:ring-2 focus:ring-primary/50 outline-none"
        />
        <button 
          type="submit" 
          disabled={submitting || !content.trim()}
          className="px-3 py-2 bg-primary text-white rounded-xl text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          <Send className="w-3.5 h-3.5" /> 发送
        </button>
      </form>
    </div>
  );
}
