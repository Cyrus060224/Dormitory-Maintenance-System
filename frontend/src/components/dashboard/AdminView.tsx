import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../lib/i18n';
import { RepairRequest, User, Stats, ApiResponse, PaginatedApiResponse } from '../../types';
import { toast } from 'sonner';
import {
  Wrench, ClipboardList, BarChart2, Users,
  Star, CheckCircle, Clock,
  RefreshCw, Eye, Shield, Bot
} from 'lucide-react';
import { API, authFetch, readApiMessage } from '../../lib/api';
import Pagination from '../custom/Pagination';
import RepairComments from '../custom/RepairComments';
import AdminPartsTab from './AdminPartsTab';
import AdminAIConfigsTab from './AdminAIConfigsTab';
import { Badge } from '../shared/StatusBadge';
import { SlaBadge } from '../shared/StatusBadge';
import ConsumedPartsList from '../shared/ConsumedPartsList';
import { tCat, tStatus, tPriority, CATEGORY_LABEL, PRIORITY_COLOR, STATUS_COLOR } from '../shared/constants';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';

export default function AdminView({ token }: { token: string | null }) {
  const { language, t } = useLanguage();
  const [tab, setTab] = useState<'repairs' | 'stats' | 'parts' | 'users' | 'ai'>('repairs');
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RepairRequest | null>(null);
  const [assignForm, setAssignForm] = useState({ status: 'approved', assignedTo: '', adminNote: '', priority: 'normal' });
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [skillsTarget, setSkillsTarget] = useState<User | null>(null);
  const [skillsForm, setSkillsForm] = useState<string[]>([]);
  const [skillsSaving, setSkillsSaving] = useState(false);

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
          priority: assignForm.priority || undefined,
        }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success('操作成功');
        setSelected(null);
        setAssignForm({ status: 'approved', assignedTo: '', adminNote: '', priority: 'normal' });
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

  async function saveSkills() {
    if (!skillsTarget) return;
    setSkillsSaving(true);
    try {
      const res = await authFetch(API.USERS.UPDATE_SKILLS(skillsTarget.id), token, {
        method: 'PATCH',
        body: JSON.stringify({ skills: skillsForm.join(',') }),
      });
      const data = await res.json() as ApiResponse<User>;
      if (data.success) {
        toast.success('技能已更新');
        setSkillsModalOpen(false);
        loadUsers();
      } else {
        toast.error(data.message || await readApiMessage(res, '更新技能失败'));
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSkillsSaving(false);
    }
  }

  async function exportCSV() {
    try {
      const res = await authFetch(API.REPAIRS.EXPORT, token);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `repairs_export_${new Date().getTime()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        toast.error('导出失败，请检查权限');
      }
    } catch (e) {
      toast.error('网络错误，导出失败');
    }
  }

  const filteredRepairs = repairs;

  const pieData = stats?.categoryStats?.map(({ category, count }) => ({
    name: tCat(category, t) || category,
    value: count
  })) || [];

  const barData = stats ? [
    { name: t('status_pending'), count: stats.pendingRequests, color: '#f59e0b' },
    { name: t('status_in_progress'), count: stats.inProgressRequests, color: '#8b5cf6' },
    { name: t('status_completed'), count: stats.completedRequests, color: '#10b981' },
    { name: t('status_rejected'), count: stats.rejectedRequests || 0, color: '#ef4444' }
  ] : [];

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6b7280'];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6">
        {([
          ['repairs', t('tabRepairs'), ClipboardList],
          ['stats', t('tabStats'), BarChart2],
          ['parts', t('tabParts'), Wrench],
          ['users', t('tabUsers') || '用户管理', Users],
          ['ai', t('tabAI') || 'AI助手配置', Bot]
        ] as const).map(([key, label, Icon]) => (
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
            <h3 className="font-semibold text-foreground">{t('repairList')}</h3>
            <div className="flex gap-2">
              <button onClick={exportCSV} className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted transition text-sm font-medium flex items-center gap-1.5">
                {t('exportCSV')}
              </button>
              <button onClick={loadRepairs} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title={language === 'zh' ? '刷新列表' : 'Refresh List'}>
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          {/* Filter */}
          <div className="flex gap-2 flex-wrap mb-4">
            {['all', 'pending', 'approved', 'in_progress', 'completed', 'pending_evaluation', 'closed', 'rejected'].map((s) => (
              <button key={s} onClick={() => { setFilterStatus(s); setRepairsPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {s === 'all' ? (language === 'zh' ? '全部' : 'All') : tStatus(s, t)}
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
              <p className="text-muted-foreground">{t('noData')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRepairs.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{r.dormBuilding} {r.dormRoom}</span>
                        <Badge label={tCat(r.category, t)} colorClass="bg-gray-100 text-gray-700" />
                        <Badge label={tPriority(r.priority, t)} colorClass={PRIORITY_COLOR[r.priority]} />
                        {r.adminNote?.startsWith('[🤖 AI智能派单]') && (
                          <Badge label={t('dispatchBadge') || '🤖 智能派单'} colorClass="bg-blue-100 text-blue-800 border-blue-200" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                      {r.studentName && <p className="text-xs text-muted-foreground mt-1">{language === 'zh' ? `学生：${r.studentName}` : `Student: ${r.studentName}`}</p>}
                      {r.assignedToName && <p className="text-xs text-muted-foreground">{language === 'zh' ? `维修员：${r.assignedToName}` : `Technician: ${r.assignedToName}`}</p>}

                      <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
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
                      <Badge label={tStatus(r.status, t)} colorClass={STATUS_COLOR[r.status]} />
                      <SlaBadge slaDueDate={r.slaDueDate} status={r.status} />
                      <button onClick={() => { setSelected(r); setAssignForm({ status: r.status, assignedTo: r.assignedTo || '', adminNote: r.adminNote || '', priority: r.priority }); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Eye className="w-3 h-3" />{language === 'zh' ? '处理' : 'Process'}
                      </button>
                    </div>
                  </div>

                  {/* Inline assign form */}
                  {selected?.id === r.id && (
                    <form onSubmit={handleAssign} className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">{language === 'zh' ? '更新状态' : 'Update Status'}</label>
                          <select value={assignForm.status} onChange={(e) => setAssignForm(p => ({ ...p, status: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="pending">{t('status_pending')}</option>
                            <option value="approved">{t('status_approved')}</option>
                            <option value="in_progress">{t('status_in_progress')}</option>
                            <option value="completed">{t('status_completed')}</option>
                            <option value="closed">{t('status_closed')}</option>
                            <option value="rejected">{t('status_rejected')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">{language === 'zh' ? '分配维修员' : 'Assign Technician'}</label>
                          <select value={assignForm.assignedTo} onChange={(e) => setAssignForm(p => ({ ...p, assignedTo: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="">{language === 'zh' ? '不分配' : 'Unassigned'}</option>
                            {technicians.map((tech) => {
                              const count = tech.activeTasksCount || 0;
                              const label = count === 0 ? (language === 'zh' ? '空闲' : 'Idle') : (language === 'zh' ? `${count}单在办` : `${count} active`);
                              return (
                                <option key={tech.id} value={tech.id}>
                                  {tech.name} ({label})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">{language === 'zh' ? '修改优先级' : 'Edit Priority'}</label>
                          <select value={assignForm.priority} onChange={(e) => setAssignForm(p => ({ ...p, priority: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="low">{t('priority_low')}</option>
                            <option value="normal">{t('priority_normal')}</option>
                            <option value="high">{t('priority_high')}</option>
                            <option value="urgent">{t('priority_urgent')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('adminNote')}</label>
                          <input value={assignForm.adminNote} onChange={(e) => setAssignForm(p => ({ ...p, adminNote: e.target.value }))}
                            placeholder={language === 'zh' ? '可选备注' : 'Optional notes'} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelected(null)}
                          className="flex-1 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition">{t('cancel')}</button>
                        <button type="submit" disabled={assigning}
                          className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                          {assigning ? (language === 'zh' ? '保存中...' : 'Saving...') : (language === 'zh' ? '保存' : 'Save')}
                        </button>
                      </div>
                      <ConsumedPartsList repairId={r.id} token={token} status={r.status} />
                      <RepairComments repairId={r.id} token={token} />
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

      {tab === 'parts' && (
        <AdminPartsTab token={token} />
      )}

      {/* Stats Tab */}

      {tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
            {[
              { label: '总报修数', value: stats.totalRequests, color: 'bg-blue-50 text-blue-700', icon: ClipboardList },
              { label: '待处理', value: stats.pendingRequests, color: 'bg-yellow-50 text-yellow-700', icon: Clock },
              { label: '维修中', value: stats.inProgressRequests, color: 'bg-purple-50 text-purple-700', icon: Wrench },
              { label: '已完成', value: stats.completedRequests, color: 'bg-green-50 text-green-700', icon: CheckCircle },
              { label: '物料开销', value: stats.totalCost !== undefined ? `￥${stats.totalCost.toFixed(2)}` : '￥0.00', color: 'bg-red-50 text-red-700', icon: Wrench },
              { label: 'SLA达标率', value: stats.slaComplianceRate !== undefined ? `${(stats.slaComplianceRate * 100).toFixed(1)}%` : 'N/A', color: 'bg-emerald-50 text-emerald-700', icon: Shield },
              { label: '平均完成耗时', value: stats.averageResponseTimeHours !== undefined ? `${stats.averageResponseTimeHours.toFixed(1)}h` : 'N/A', color: 'bg-indigo-50 text-indigo-700', icon: Clock },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`rounded-2xl p-4 ${color}`}>
                <Icon className="w-5 h-5 mb-2" />
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>


          {stats.trendData && stats.trendData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5 flex flex-col min-h-[300px]">
              <h4 className="font-semibold text-foreground mb-4">近期报修趋势</h4>
              <div className="w-full">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={stats.trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ stroke: '#e5e7eb', strokeWidth: 2 }} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 柱状图：工单状态分布 */}
            <div className="bg-white rounded-2xl shadow-sm border border-border p-5 flex flex-col min-h-[300px]">
              <h4 className="font-semibold text-foreground mb-4">工单状态分布</h4>
              <div className="w-full">
                <ResponsiveContainer width="100%" height={240}>
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
                    <ResponsiveContainer width="100%" height={180}>
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

          {/* 备件消耗排行统计 */}
          {stats.partsConsumedStats && stats.partsConsumedStats.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5 shadow-sm">
              <h4 className="font-semibold text-foreground mb-4 flex items-center gap-1.5">
                📊 备件消耗及材料成本分析 (Top 5)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-medium pb-2">
                      <th className="pb-2">备件名称</th>
                      <th className="pb-2">消耗总数量</th>
                      <th className="pb-2 text-right">消耗总成本</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {stats.partsConsumedStats.map((item) => (
                      <tr key={item.name} className="hover:bg-muted/10">
                        <td className="py-2.5 font-semibold text-foreground">{item.name}</td>
                        <td className="py-2.5 text-muted-foreground">{item.count} 件</td>
                        <td className="py-2.5 text-right font-bold text-primary">￥{item.totalCost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                      {u.role === 'technician' && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          技能：{u.skills ? u.skills.split(',').map(s => CATEGORY_LABEL[s] || s).join(', ') : '未配置'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      label={u.role === 'student' ? '学生' : u.role === 'technician' ? '维修员' : '管理员'}
                      colorClass={u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'technician' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      {u.role === 'technician' && (
                        <button onClick={() => { setSkillsTarget(u); setSkillsForm(u.skills ? u.skills.split(',') : []); setSkillsModalOpen(true); }}
                          className="text-xs text-primary hover:underline">编辑技能</button>
                      )}
                      <button onClick={() => deleteUser(u.id)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline">删除</button>
                    </div>
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

      {/* AI Config Tab */}
      {tab === 'ai' && (
        <AdminAIConfigsTab token={token} />
      )}

      {/* Skills Modal */}
      {skillsModalOpen && skillsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">编辑技能标签 - {skillsTarget.name}</h3>
              <button onClick={() => setSkillsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              {['water', 'electricity', 'furniture', 'network', 'other'].map(cat => (
                <label key={cat} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50 transition">
                  <input type="checkbox" className="w-4 h-4 rounded text-primary focus:ring-primary/50" 
                    checked={skillsForm.includes(cat)}
                    onChange={(e) => {
                      if (e.target.checked) setSkillsForm(prev => [...prev, cat]);
                      else setSkillsForm(prev => prev.filter(s => s !== cat));
                    }}
                  />
                  <span className="text-sm font-medium">{CATEGORY_LABEL[cat] || cat}</span>
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-border flex gap-3">
              <button onClick={() => setSkillsModalOpen(false)} className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition">取消</button>
              <button onClick={saveSkills} disabled={skillsSaving} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                {skillsSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
