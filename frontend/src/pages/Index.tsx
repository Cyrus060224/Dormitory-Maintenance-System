import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RepairRequest, User, Stats, ApiResponse } from '../types';
import { toast } from 'sonner';
import {
  Wrench, Home, ClipboardList, BarChart2, Users, LogOut,
  Plus, Star, CheckCircle, Clock,
  ChevronRight, RefreshCw, Send, Eye
} from 'lucide-react';
import { API, getAuthHeaders } from '../lib/api';
import EvaluationModal from '../components/custom/EvaluationModal';

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending: '待处理', approved: '已审核', in_progress: '维修中',
  completed: '已完成', pending_evaluation: '待评价', closed: '已结案', rejected: '已拒绝',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-800',
  approved: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  pending_evaluation: 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-300',
  closed: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
};
const CATEGORY_LABEL: Record<string, string> = {
  water: '水管/水电', electricity: '电路/电器', furniture: '家具/设施',
  network: '网络/通信', other: '其他',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: '低', normal: '普通', high: '高', urgent: '紧急',
};
const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>;
}

// ─── Student View ─────────────────────────────────────────────────────────────
function StudentView({ token }: { token: string | null }) {
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const [selected, setSelected] = useState<RepairRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalTarget, setEvalTarget] = useState<RepairRequest | null>(null);
  const [form, setForm] = useState({
    dormBuilding: '', dormRoom: '', category: 'water',
    description: '', priority: 'normal', imageUrl: '',
  });

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.REPAIRS.LIST, { headers: getAuthHeaders(token) });
      const data = await res.json() as ApiResponse<RepairRequest[]>;
      if (data.success) setRequests(data.data);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function submitRepair(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dormBuilding || !form.dormRoom || !form.description) {
      toast.error('请填写所有必填项'); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(API.REPAIRS.CREATE, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          dormBuilding: form.dormBuilding,
          dormRoom: form.dormRoom,
          category: form.category,
          description: form.description,
          priority: form.priority,
          imageUrl: form.imageUrl || undefined,
        }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('报修申请提交成功！');
        setForm({ dormBuilding: '', dormRoom: '', category: 'water', description: '', priority: 'normal', imageUrl: '' });
        setView('list');
        loadRequests();
      } else {
        toast.error(data.message || `提交失败 (HTTP ${res.status})`);
      }
    } catch (err) { 
      console.error('Submit repair error:', err);
      toast.error('网络错误，请稍后重试'); 
    }
    finally { setSubmitting(false); }
  }

  /** 提交评价（通过新接口） */
  async function handleEvaluate(rating: number, tags: string[], text: string) {
    if (!evalTarget) return;
    setEvalLoading(true);
    try {
      const res = await fetch(API.REPAIRS.EVALUATE(evalTarget.id), {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          rating,
          feedbackTags: tags.join(','),
          feedbackText: text || undefined,
        }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('评价提交成功！感谢您的反馈');
        setEvalModalOpen(false);
        setEvalTarget(null);
        loadRequests();
      } else {
        toast.error(data.message || '评价提交失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setEvalLoading(false); }
  }

  if (view === 'new') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold text-foreground">提交报修申请</h2>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
          <form onSubmit={submitRepair} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">宿舍楼 <span className="text-red-500">*</span></label>
                <input value={form.dormBuilding} onChange={(e) => setForm(p => ({ ...p, dormBuilding: e.target.value }))}
                  placeholder="如：A栋、1号楼" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">房间号 <span className="text-red-500">*</span></label>
                <input value={form.dormRoom} onChange={(e) => setForm(p => ({ ...p, dormRoom: e.target.value }))}
                  placeholder="如：301" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">报修类型</label>
                <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition">
                  <option value="water">水管/水电</option>
                  <option value="electricity">电路/电器</option>
                  <option value="furniture">家具/设施</option>
                  <option value="network">网络/通信</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">优先级</label>
                <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition">
                  <option value="low">低</option>
                  <option value="normal">普通</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">问题描述 <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                rows={4} placeholder="请详细描述问题，至少5个字"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">图片链接（可选）</label>
              <input value={form.imageUrl} onChange={(e) => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                placeholder="粘贴图片URL" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setView('list')}
                className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition">
                取消
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />{submitting ? '提交中...' : '提交申请'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold text-foreground">报修详情</h2>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{selected.dormBuilding} {selected.dormRoom}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{CATEGORY_LABEL[selected.category]}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge label={STATUS_LABEL[selected.status]} colorClass={STATUS_COLOR[selected.status]} />
              <Badge label={PRIORITY_LABEL[selected.priority]} colorClass={PRIORITY_COLOR[selected.priority]} />
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">问题描述</p>
            <p className="text-foreground leading-relaxed">{selected.description}</p>
          </div>
          {selected.imageUrl && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">图片</p>
              <img src={selected.imageUrl} alt="报修图片" className="rounded-xl max-h-48 object-cover" />
            </div>
          )}
          {selected.adminNote && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">管理员备注</p>
              <p className="text-foreground">{selected.adminNote}</p>
            </div>
          )}
          {selected.assignedToName && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">维修人员</p>
              <p className="text-foreground">{selected.assignedToName}</p>
            </div>
          )}
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            提交时间：{new Date(selected.createdAt).toLocaleString('zh-CN')}
          </div>

          {/* 评价信息显示 */}
          {selected.rating && selected.rating > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-2">服务评价</p>
              <div className="flex items-center gap-1 mb-2">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={`w-5 h-5 ${s <= selected.rating! ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                ))}
              </div>
              {selected.feedbackTags && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selected.feedbackTags.split(',').map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">{tag}</span>
                  ))}
                </div>
              )}
              {selected.feedbackText && (
                <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">{selected.feedbackText}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">我的报修</h2>
        <div className="flex gap-2">
          <button onClick={loadRequests} className="p-2 rounded-xl border border-border hover:bg-muted transition">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => setView('new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition">
            <Plus className="w-4 h-4" />提交报修
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">暂无报修记录</p>
          <button onClick={() => setView('new')}
            className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition">
            立即报修
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => { setSelected(r); setView('detail'); }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{r.dormBuilding} {r.dormRoom}</span>
                    <Badge label={CATEGORY_LABEL[r.category]} colorClass="bg-gray-100 text-gray-700" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">{new Date(r.createdAt).toLocaleDateString('zh-CN')}</p>
                  {/* 已评价工单显示星级 */}
                  {r.rating && r.rating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className={`w-3 h-3 ${s <= r.rating! ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge label={STATUS_LABEL[r.status]} colorClass={STATUS_COLOR[r.status]} />
                  <Badge label={PRIORITY_LABEL[r.priority]} colorClass={PRIORITY_COLOR[r.priority]} />
                  {/* 待评价状态显示高亮按钮 */}
                  {r.status === 'pending_evaluation' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEvalTarget(r); setEvalModalOpen(true); }}
                      className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600 transition animate-pulse shadow-lg shadow-yellow-200"
                    >
                      去评价
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 评价弹窗 */}
      <EvaluationModal
        open={evalModalOpen}
        onClose={() => { setEvalModalOpen(false); setEvalTarget(null); }}
        onSubmit={handleEvaluate}
        loading={evalLoading}
      />
    </div>
  );
}

// ─── Technician View ──────────────────────────────────────────────────────────
function TechnicianView({ token }: { token: string | null }) {
  const [tasks, setTasks] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RepairRequest | null>(null);
  const [workNote, setWorkNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.REPAIRS.LIST, { headers: getAuthHeaders(token) });
      const data = await res.json() as ApiResponse<RepairRequest[]>;
      if (data.success) setTasks(data.data);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function updateTask(taskId: string, status: string) {
    setUpdating(true);
    try {
      const res = await fetch(API.REPAIRS.UPDATE_STATUS(taskId), {
        method: 'PATCH',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status, adminNote: workNote || undefined }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('任务状态已更新');
        setSelected(null);
        setWorkNote('');
        loadTasks();
      } else {
        toast.error(data.message || '更新失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setUpdating(false); }
  }

  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'approved');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed' || t.status === 'pending_evaluation' || t.status === 'closed');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">我的维修任务</h2>
        <button onClick={loadTasks} className="p-2 rounded-xl border border-border hover:bg-muted transition">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: '待处理', count: pending.length, color: 'bg-yellow-50 text-yellow-700', icon: Clock },
          { label: '进行中', count: inProgress.length, color: 'bg-purple-50 text-purple-700', icon: Wrench },
          { label: '已完成', count: completed.length, color: 'bg-green-50 text-green-700', icon: CheckCircle },
        ].map(({ label, count, color, icon: Icon }) => (
          <div key={label} className={`rounded-2xl p-4 ${color} flex flex-col items-center`}>
            <Icon className="w-5 h-5 mb-1" />
            <span className="text-2xl font-bold">{count}</span>
            <span className="text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wrench className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">暂无分配任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{t.dormBuilding} {t.dormRoom}</span>
                    <Badge label={CATEGORY_LABEL[t.category || 'other']} colorClass="bg-gray-100 text-gray-700" />
                    {t.priority && <Badge label={PRIORITY_LABEL[t.priority]} colorClass={PRIORITY_COLOR[t.priority]} />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                  {t.studentName && <p className="text-xs text-muted-foreground mt-1">学生：{t.studentName}</p>}
                </div>
                <Badge label={STATUS_LABEL[t.status]} colorClass={STATUS_COLOR[t.status]} />
              </div>
              {t.adminNote && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">管理员备注：{t.adminNote}</p>
                </div>
              )}
              {/* 评价信息显示（只读） */}
              {t.rating && t.rating > 0 && (
                <div className="mt-3 pt-3 border-t border-border bg-yellow-50/50 -mx-4 px-4 pb-1 rounded-b-2xl">
                  <p className="text-xs font-medium text-foreground mb-1">⭐ 学生评价</p>
                  <div className="flex items-center gap-1 mb-1">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className={`w-4 h-4 ${s <= t.rating! ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  {t.feedbackTags && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {t.feedbackTags.split(',').map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                  {t.feedbackText && (
                    <p className="text-xs text-muted-foreground">"{t.feedbackText}"</p>
                  )}
                </div>
              )}
              {t.status !== 'completed' && t.status !== 'rejected' && t.status !== 'pending_evaluation' && t.status !== 'closed' && (
                <div className="mt-3 pt-3 border-t border-border">
                  {selected?.id === t.id ? (
                    <div className="space-y-3">
                      <textarea value={workNote} onChange={(e) => setWorkNote(e.target.value)}
                        rows={2} placeholder="填写维修记录（可选）"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => { setSelected(null); setWorkNote(''); }}
                          className="flex-1 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition">取消</button>
                        {(t.status === 'pending' || t.status === 'approved') && (
                          <button onClick={() => updateTask(t.id, 'in_progress')} disabled={updating}
                            className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                            {updating ? '...' : '开始维修'}
                          </button>
                        )}
                        <button onClick={() => updateTask(t.id, 'completed')} disabled={updating}
                          className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                          {updating ? '...' : '完成维修'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setSelected(t)}
                      className="w-full py-2 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition">
                      更新状态
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin View ───────────────────────────────────────────────────────────────
function AdminView({ token }: { token: string | null }) {
  const [tab, setTab] = useState<'repairs' | 'stats' | 'users'>('repairs');
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RepairRequest | null>(null);
  const [assignForm, setAssignForm] = useState({ status: 'approved', assignedTo: '', adminNote: '' });
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const loadRepairs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.REPAIRS.LIST, { headers: getAuthHeaders(token) });
      const data = await res.json() as ApiResponse<RepairRequest[]>;
      if (data.success) setRepairs(data.data);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [token]);

  const loadUsers = useCallback(async () => {
    try {
      const [uRes, tRes] = await Promise.all([
        fetch(API.USERS.LIST, { headers: getAuthHeaders(token) }),
        fetch(API.USERS.TECHNICIANS, { headers: getAuthHeaders(token) }),
      ]);
      const uData = await uRes.json() as ApiResponse<User[]>;
      const tData = await tRes.json() as ApiResponse<User[]>;
      if (uData.success) setUsers(uData.data);
      if (tData.success) setTechnicians(tData.data);
    } catch { toast.error('加载用户失败'); }
  }, [token]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(API.STATS.GET, { headers: getAuthHeaders(token) });
      const data = await res.json() as ApiResponse<Stats>;
      if (data.success) setStats(data.data);
    } catch { toast.error('加载统计失败'); }
  }, [token]);

  useEffect(() => {
    loadRepairs();
    loadUsers();
    loadStats();
  }, [loadRepairs, loadUsers, loadStats]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAssigning(true);
    try {
      const res = await fetch(API.REPAIRS.UPDATE_STATUS(selected.id), {
        method: 'PATCH',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          status: assignForm.status,
          assignedTo: assignForm.assignedTo || undefined,
          adminNote: assignForm.adminNote || undefined,
        }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('操作成功');
        setSelected(null);
        setAssignForm({ status: 'approved', assignedTo: '', adminNote: '' });
        loadRepairs();
        loadStats();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setAssigning(false); }
  }

  async function deleteUser(userId: string) {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
      const res = await fetch(API.USERS.UPDATE(userId), {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      const data = await res.json() as ApiResponse<null>;
      if (data.success) { toast.success('用户已删除'); loadUsers(); }
      else toast.error(data.message || '删除失败');
    } catch { toast.error('网络错误'); }
  }

  const filteredRepairs = filterStatus === 'all' ? repairs : repairs.filter(r => r.status === filterStatus);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6">
        {([['repairs', '报修管理', ClipboardList], ['stats', '数据统计', BarChart2], ['users', '用户管理', Users]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Repairs Tab */}
      {tab === 'repairs' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">报修申请列表</h3>
            <button onClick={loadRepairs} className="p-2 rounded-xl border border-border hover:bg-muted transition">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {/* Filter */}
          <div className="flex gap-2 flex-wrap mb-4">
            {['all', 'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {s === 'all' ? '全部' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : filteredRepairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">暂无报修记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRepairs.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{r.dormBuilding} {r.dormRoom}</span>
                        <Badge label={CATEGORY_LABEL[r.category]} colorClass="bg-gray-100 text-gray-700" />
                        <Badge label={PRIORITY_LABEL[r.priority]} colorClass={PRIORITY_COLOR[r.priority]} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                      {r.studentName && <p className="text-xs text-muted-foreground mt-1">学生：{r.studentName}</p>}
                      {r.assignedToName && <p className="text-xs text-muted-foreground">维修员：{r.assignedToName}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString('zh-CN')}</p>
                      {/* 评价信息显示 */}
                      {r.rating && r.rating > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex items-center gap-0.5">
                            {[1,2,3,4,5].map((s) => (
                              <Star key={s} className={`w-3 h-3 ${s <= r.rating! ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-yellow-600 font-medium">{r.rating}/5</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge label={STATUS_LABEL[r.status]} colorClass={STATUS_COLOR[r.status]} />
                      <button onClick={() => { setSelected(r); setAssignForm({ status: r.status, assignedTo: r.assignedTo || '', adminNote: r.adminNote || '' }); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="w-3 h-3" />处理
                      </button>
                    </div>
                  </div>

                  {/* Inline assign form */}
                  {selected?.id === r.id && (
                    <form onSubmit={handleAssign} className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">更新状态</label>
                          <select value={assignForm.status} onChange={(e) => setAssignForm(p => ({ ...p, status: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="pending">待审核</option>
                            <option value="approved">已审核</option>
                            <option value="in_progress">维修中</option>
                            <option value="completed">已完成（待评价）</option>
                            <option value="closed">已结案</option>
                            <option value="rejected">已拒绝</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">分配维修员</label>
                          <select value={assignForm.assignedTo} onChange={(e) => setAssignForm(p => ({ ...p, assignedTo: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="">不分配</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">管理员备注</label>
                        <input value={assignForm.adminNote} onChange={(e) => setAssignForm(p => ({ ...p, adminNote: e.target.value }))}
                          placeholder="可选备注" className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelected(null)}
                          className="flex-1 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition">取消</button>
                        <button type="submit" disabled={assigning}
                          className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                          {assigning ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '总报修数', value: stats.totalRequests, color: 'bg-blue-50 text-blue-700', icon: ClipboardList },
              { label: '待处理', value: stats.pendingRequests, color: 'bg-yellow-50 text-yellow-700', icon: Clock },
              { label: '维修中', value: stats.inProgressRequests, color: 'bg-purple-50 text-purple-700', icon: Wrench },
              { label: '已完成', value: stats.completedRequests, color: 'bg-green-50 text-green-700', icon: CheckCircle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`rounded-2xl p-4 ${color}`}>
                <Icon className="w-5 h-5 mb-2" />
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
              <h4 className="font-semibold text-foreground mb-4">用户统计</h4>
              <div className="space-y-3">
                {[
                  { label: '总用户数', value: stats.totalUsers },
                  { label: '学生', value: stats.studentCount },
                  { label: '维修人员', value: stats.technicianCount },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
              <h4 className="font-semibold text-foreground mb-4">报修类型分布</h4>
              <div className="space-y-2">
                {stats.categoryStats.map(({ category, count }) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{CATEGORY_LABEL[category] || category}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full"
                          style={{ width: `${stats.totalRequests > 0 ? (count / stats.totalRequests) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-medium text-foreground w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
            <h4 className="font-semibold text-foreground mb-2">平均服务评分</h4>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold text-foreground">{stats.avgRating}</span>
              <div className="flex gap-1">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={`w-5 h-5 ${s <= Math.round(Number(stats.avgRating)) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                ))}
              </div>
              <span className="text-muted-foreground text-sm">/ 5.0</span>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">用户列表 ({users.length})</h3>
            <button onClick={loadUsers} className="p-2 rounded-xl border border-border hover:bg-muted transition">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-semibold text-sm">{u.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      {u.studentId && <p className="text-xs text-muted-foreground">学号：{u.studentId}</p>}
                      {u.dormRoom && <p className="text-xs text-muted-foreground">宿舍：{u.dormRoom}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      label={u.role === 'student' ? '学生' : u.role === 'technician' ? '维修员' : '管理员'}
                      colorClass={u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'technician' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}
                    />
                    <button onClick={() => deleteUser(u.id)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline">删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const { user, token, logout } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const roleLabel = user.role === 'student' ? '学生' : user.role === 'technician' ? '维修人员' : '管理员';
  const roleColor = user.role === 'admin' ? 'bg-purple-100 text-purple-700' : user.role === 'technician' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground leading-tight">宿舍报修系统</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">在线报修 · 实时追踪</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold text-sm">{user.name.charAt(0)}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground leading-tight">{user.name}</p>
                <Badge label={roleLabel} colorClass={roleColor} />
              </div>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">欢迎回来</p>
              <h2 className="text-xl font-bold mt-0.5">{user.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/80 text-sm">{roleLabel}</span>
                {user.dormRoom && <span className="text-white/60 text-sm">· {user.dormRoom}</span>}
              </div>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              {user.role === 'student' ? <Home className="w-7 h-7 text-white" /> :
               user.role === 'technician' ? <Wrench className="w-7 h-7 text-white" /> :
               <BarChart2 className="w-7 h-7 text-white" />}
            </div>
          </div>
        </div>

        {/* Role-based view */}
        {user.role === 'student' && <StudentView token={token} />}
        {user.role === 'technician' && <TechnicianView token={token} />}
        {user.role === 'admin' && <AdminView token={token} />}
      </main>
    </div>
  );
}
