import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RepairRequest, User, Stats, ApiResponse, PaginatedApiResponse } from '../types';
import { toast } from 'sonner';
import {
  Wrench, Home, ClipboardList, BarChart2, Users, LogOut,
  Plus, Star, CheckCircle, Clock,
  ChevronRight, RefreshCw, Send, Eye, Shield, Lock, Phone,
  Sparkles, AlertTriangle
} from 'lucide-react';
import { API, authFetch, readApiMessage } from '../lib/api';
import EvaluationModal from '../components/custom/EvaluationModal';
import Pagination from '../components/custom/Pagination';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

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


function SlaBadge({ slaDueDate, status }: { slaDueDate?: string; status: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!slaDueDate || ['completed', 'pending_evaluation', 'closed', 'rejected'].includes(status)) {
      return;
    }

    const calculateTimeLeft = () => {
      const dueTime = new Date(slaDueDate).getTime();
      const nowTime = Date.now();
      setTimeLeft(dueTime - nowTime);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [slaDueDate, status]);

  if (!slaDueDate || ['completed', 'pending_evaluation', 'closed', 'rejected'].includes(status)) {
    return null;
  }

  const isOverdue = timeLeft < 0;
  const absTime = Math.abs(timeLeft);
  const seconds = Math.floor((absTime / 1000) % 60);
  const minutes = Math.floor((absTime / (1000 * 60)) % 60);
  const hours = Math.floor((absTime / (1000 * 60 * 60)));

  let timeString = '';
  if (hours > 0) {
    timeString += `${hours}小时`;
  }
  timeString += `${minutes}分${seconds}秒`;

  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 animate-pulse border border-red-200 shadow-sm">
        <Clock className="w-3 h-3" />
        已超时 {timeString}
      </span>
    );
  }

  const isUrgent = hours < 3;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
      isUrgent 
        ? 'bg-amber-50 text-amber-700 animate-pulse border border-amber-200' 
        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
    } shadow-sm`}>
      <Clock className="w-3 h-3" />
      SLA 剩余: {timeString}
    </span>
  );
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

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 5;

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API.REPAIRS.LIST}?page=${currentPage}&pageSize=${pageSize}`;
      const res = await authFetch(url, token);
      const data = await res.json() as PaginatedApiResponse<RepairRequest[]>;
      if (data.success) {
        setRequests(data.data);
        setTotalCount(data.total ?? data.data.length);
      }
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [token, currentPage, pageSize]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function submitRepair(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dormBuilding || !form.dormRoom || !form.description) {
      toast.error('请填写所有必填项'); return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(API.REPAIRS.CREATE, token, {
        method: 'POST',
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
        setCurrentPage(1);
        setView('list');
        loadRequests();
      } else {
        toast.error(data.message || await readApiMessage(res, `提交失败 (HTTP ${res.status})`));
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
      const res = await authFetch(API.REPAIRS.EVALUATE(evalTarget.id), token, {
        method: 'POST',
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
        toast.error(data.message || await readApiMessage(res, '评价提交失败'));
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
              <label className="block text-sm font-medium text-foreground mb-1.5">问题描述 <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                rows={4} placeholder="请详细描述问题，例如：宿舍卫生间马桶堵塞了，一直在反水，地面积水很严重，人都滑倒了。"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">报修图片（最多5张，可选）</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 渲染已有图片的缩略图 */}
                {form.imageUrl ? form.imageUrl.split(',').map((imgUrl, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-border group bg-muted flex items-center justify-center">
                    <img
                      src={imgUrl.startsWith('http') || imgUrl.startsWith('data:') ? imgUrl : `${API.BASE}${imgUrl}`}
                      alt={`预览图片 ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const urls = form.imageUrl.split(',');
                        urls.splice(idx, 1);
                        setForm(p => ({ ...p, imageUrl: urls.join(',') }));
                      }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow opacity-90 hover:opacity-100"
                    >
                      <Plus className="w-3.5 h-3.5 rotate-45" />
                    </button>
                  </div>
                )) : null}

                {/* 如果上传的图片小于 5 张，显示上传按钮 */}
                {(!form.imageUrl || form.imageUrl.split(',').length < 5) && (
                  <label className="border-2 border-dashed border-border hover:border-primary/60 rounded-xl flex flex-col items-center justify-center cursor-pointer transition bg-background hover:bg-muted/10 aspect-square min-h-[96px]">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error('图片大小不能超过 5MB');
                          return;
                        }
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        setSubmitting(true);
                        try {
                          const res = await authFetch(API.UPLOAD, token, {
                            method: 'POST',
                            body: formData,
                          });
                          const data = await res.json() as { success: boolean; url: string; message?: string };
                          if (data.success) {
                            const currentUrls = form.imageUrl ? form.imageUrl.split(',') : [];
                            currentUrls.push(data.url);
                            setForm(p => ({ ...p, imageUrl: currentUrls.join(',') }));
                            toast.success('图片上传成功！');
                          } else {
                            toast.error(data.message || '图片上传失败');
                          }
                        } catch {
                          toast.error('上传图片时发生网络错误');
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                    />
                    <Plus className="w-5 h-5 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground text-center px-1 font-medium">添加图片</span>
                    <span className="text-[10px] text-muted-foreground/60 text-center">{form.imageUrl ? form.imageUrl.split(',').length : 0}/5</span>
                  </label>
                )}
              </div>
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
              <SlaBadge slaDueDate={selected.slaDueDate} status={selected.status} />
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">问题描述</p>
            <p className="text-foreground leading-relaxed">{selected.description}</p>
          </div>
          {selected.imageUrl && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">报修图片</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selected.imageUrl.split(',').map((imgUrl, idx) => (
                  <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center cursor-zoom-in">
                    <img
                      src={imgUrl.startsWith('http') || imgUrl.startsWith('data:') ? imgUrl : `${API.BASE}${imgUrl}`}
                      alt={`报修图片 ${idx + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                      onClick={() => window.open(imgUrl.startsWith('http') || imgUrl.startsWith('data:') ? imgUrl : `${API.BASE}${imgUrl}`, '_blank')}
                    />
                  </div>
                ))}
              </div>
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
          <button onClick={loadRequests} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title="刷新列表">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
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
                  <SlaBadge slaDueDate={r.slaDueDate} status={r.status} />
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
          <Pagination
            currentPage={currentPage}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
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
      const res = await authFetch(API.REPAIRS.LIST, token);
      const data = await res.json() as ApiResponse<RepairRequest[]>;
      if (data.success) setTasks(data.data);
      else toast.error(data.message || '加载失败');
    } catch { toast.error('加载失败，请确认后端服务已启动'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function updateTask(taskId: string, status: string) {
    setUpdating(true);
    try {
      const res = await authFetch(API.REPAIRS.UPDATE_STATUS(taskId), token, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNote: workNote || undefined }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('任务状态已更新');
        setSelected(null);
        setWorkNote('');
        loadTasks();
      } else {
        toast.error(data.message || await readApiMessage(res, '更新失败'));
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
        <button onClick={loadTasks} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title="刷新列表">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
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
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge label={STATUS_LABEL[t.status]} colorClass={STATUS_COLOR[t.status]} />
                  <SlaBadge slaDueDate={t.slaDueDate} status={t.status} />
                </div>
              </div>
              {t.adminNote && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">管理员备注：{t.adminNote}</p>
                </div>
              )}
              {t.workNote && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">维修记录：{t.workNote}</p>
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

  // Repairs Pagination State
  const [repairsPage, setRepairsPage] = useState(1);
  const [totalRepairs, setTotalRepairs] = useState(0);
  const repairsPageSize = 8;

  // Users Pagination State
  const [usersPage, setUsersPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPageSize = 8;

  const loadRepairs = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API.REPAIRS.LIST}?page=${repairsPage}&pageSize=${repairsPageSize}&status=${filterStatus}`;
      const res = await authFetch(url, token);
      const data = await res.json() as PaginatedApiResponse<RepairRequest[]>;
      if (data.success) {
        setRepairs(data.data);
        setTotalRepairs(data.total ?? data.data.length);
      }
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [token, repairsPage, repairsPageSize, filterStatus]);

  const loadUsers = useCallback(async () => {
    try {
      const url = `${API.USERS.LIST}?page=${usersPage}&pageSize=${usersPageSize}`;
      const [uRes, tRes] = await Promise.all([
        authFetch(url, token),
        authFetch(API.USERS.TECHNICIANS, token),
      ]);
      const uData = await uRes.json() as PaginatedApiResponse<User[]>;
      const tData = await tRes.json() as ApiResponse<User[]>;
      if (uData.success) {
        setUsers(uData.data);
        setTotalUsers(uData.total ?? uData.data.length);
      }
      if (tData.success) setTechnicians(tData.data);
    } catch { toast.error('加载用户失败'); }
  }, [token, usersPage, usersPageSize]);

  const loadStats = useCallback(async () => {
    try {
      const res = await authFetch(API.STATS.GET, token);
      const data = await res.json() as ApiResponse<Stats>;
      if (data.success) setStats(data.data);
      else toast.error(data.message || '加载统计失败');
    } catch { toast.error('加载统计失败，请检查管理员权限'); }
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
      const res = await authFetch(API.REPAIRS.UPDATE_STATUS(selected.id), token, {
        method: 'PATCH',
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
        toast.error(data.message || await readApiMessage(res, '操作失败'));
      }
    } catch { toast.error('网络错误'); }
    finally { setAssigning(false); }
  }

  async function deleteUser(userId: string) {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
      const res = await authFetch(API.USERS.UPDATE(userId), token, {
        method: 'DELETE',
      });
      const data = await res.json() as ApiResponse<null>;
      if (data.success) { toast.success('用户已删除'); loadUsers(); }
      else toast.error(data.message || await readApiMessage(res, '删除失败'));
    } catch { toast.error('网络错误'); }
  }

  const filteredRepairs = repairs;

  const pieData = stats?.categoryStats?.map(({ category, count }) => ({
    name: CATEGORY_LABEL[category] || category,
    value: count
  })) || [];

  const barData = stats ? [
    { name: '待处理', count: stats.pendingRequests, color: '#f59e0b' },
    { name: '维修中', count: stats.inProgressRequests, color: '#8b5cf6' },
    { name: '已完成', count: stats.completedRequests, color: '#10b981' },
    { name: '已拒绝', count: stats.rejectedRequests || 0, color: '#ef4444' }
  ] : [];

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6b7280'];

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
            <button onClick={loadRepairs} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title="刷新列表">
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {/* Filter */}
          <div className="flex gap-2 flex-wrap mb-4">
            {['all', 'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'].map((s) => (
              <button key={s} onClick={() => { setFilterStatus(s); setRepairsPage(1); }}
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
                      {/* AI 智能质检预警 */}
                      {user?.role === 'admin' && r.status === 'pending' && (r.aiCategory || r.aiPriority) && (r.category !== r.aiCategory || r.priority !== r.aiPriority) && (
                        <div className="mt-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-start gap-1.5 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-amber-900 block mb-0.5">AI 智能质检审核建议</span>
                            {r.category !== r.aiCategory && (
                              <span className="block">• 分类不匹配：学生选择“{CATEGORY_LABEL[r.category] || r.category}”，AI 评估最契合“{CATEGORY_LABEL[r.aiCategory!] || r.aiCategory}”</span>
                            )}
                            {r.priority !== r.aiPriority && (
                              <span className="block">• 优先级不匹配：学生自主选择“{PRIORITY_LABEL[r.priority] || r.priority}”，AI 智能建议设为“{PRIORITY_LABEL[r.aiPriority!] || r.aiPriority}”{r.priority === 'urgent' || r.priority === 'high' ? '（疑似主观评级偏高）' : ''}</span>
                            )}
                          </div>
                        </div>
                      )}
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
                      <SlaBadge slaDueDate={r.slaDueDate} status={r.status} />
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
                            {technicians.map((t) => {
                              const count = t.activeTasksCount || 0;
                              const label = count === 0 ? '空闲' : `${count}单在办`;
                              return (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({label})
                                </option>
                              );
                            })}
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
              <Pagination
                currentPage={repairsPage}
                totalCount={totalRepairs}
                pageSize={repairsPageSize}
                onPageChange={setRepairsPage}
              />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 柱状图：工单状态分布 */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5 flex flex-col min-h-[300px]">
              <h4 className="font-semibold text-foreground mb-4">工单状态分布</h4>
              <div className="h-[240px] w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f3f4f6', opacity: 0.5 }} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 饼图：报修类型分布 */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5 flex flex-col min-h-[300px]">
              <h4 className="font-semibold text-foreground mb-4">报修类型占比</h4>
              {pieData.length > 0 ? (
                <div className="h-[240px] w-full flex-1 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="h-[180px] w-[180px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 w-full pl-0 sm:pl-2">
                    {pieData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between text-xs w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-muted-foreground font-medium truncate">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-semibold text-foreground flex-shrink-0">
                          <span>{entry.value}</span>
                          <span className="text-muted-foreground/50 font-normal">({stats.totalRequests > 0 ? ((entry.value / stats.totalRequests) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">暂无类型统计数据</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 用户统计卡片 */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
              <h4 className="font-semibold text-foreground mb-4">用户统计</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '总用户数', value: stats.totalUsers, color: 'text-primary' },
                  { label: '注册学生', value: stats.studentCount, color: 'text-foreground' },
                  { label: '维修师傅', value: stats.technicianCount, color: 'text-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 评分卡片 */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5 flex flex-col justify-between">
              <h4 className="font-semibold text-foreground mb-2">平均服务评分</h4>
              <div className="flex items-center gap-4 py-2">
                <span className="text-4xl font-extrabold text-foreground tracking-tight">{stats.avgRating}</span>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-5 h-5 ${s <= Math.round(Number(stats.avgRating)) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium">基于已有工单评价</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">用户列表 ({totalUsers})</h3>
            <button onClick={loadUsers} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title="刷新列表">
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
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
            <Pagination
              currentPage={usersPage}
              totalCount={totalUsers}
              pageSize={usersPageSize}
              onPageChange={setUsersPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Index() {
  const { user, token, logout } = useAuth();
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
  const roleLabel = displayProfile.role === 'student' ? '学生' : displayProfile.role === 'technician' ? '维修人员' : '管理员';
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
            title="刷新工作台"
          >
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center group-hover:scale-105 active:scale-95 transition">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground leading-tight group-hover:text-primary transition">智能宿舍报修平台</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">在线报修 · 实时追踪</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="hidden sm:flex items-center gap-2 cursor-pointer hover:bg-muted p-1.5 rounded-xl transition duration-200 active:scale-95 select-none"
              title="个人设置"
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
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 mb-6 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">欢迎回来</p>
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
    </div>
  );
}

function SettingsModal({
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
