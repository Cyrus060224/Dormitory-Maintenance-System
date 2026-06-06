import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { authFetch, API, readApiMessage } from '../../lib/api';
import { toast } from 'sonner';
import { RepairRequest, Part, ApiResponse } from '../../types';
import {
  Wrench, Star, RefreshCw, Clock, CheckCircle, BarChart2
} from 'lucide-react';
import RepairComments from '../custom/RepairComments';
import { Badge, SlaBadge } from '../shared/StatusBadge';
import ConsumedPartsList from '../shared/ConsumedPartsList';
import { tCat, tStatus, tPriority, STATUS_COLOR, PRIORITY_COLOR } from '../shared/constants';

export default function TechnicianView({ token }: { token: string | null }) {
  const { language, t } = useLanguage();
  const [tasks, setTasks] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RepairRequest | null>(null);
  const [workNote, setWorkNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [tab, setTab] = useState<'tasks' | 'stats'>('tasks');

  // parts state
  const [inventoryParts, setInventoryParts] = useState<Part[]>([]);
  const [selectedParts, setSelectedParts] = useState<{ [partId: string]: number }>({});

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(API.REPAIRS.LIST, token);
      const data = await res.json() as ApiResponse<RepairRequest[]>;
      if (data.success) setTasks(data.data);
      else toast.error(data.message || (language === 'zh' ? '加载失败' : 'Load failed'));
    } catch { toast.error(language === 'zh' ? '加载失败，请确认后端服务已启动' : 'Load failed, make sure backend service is running'); }
    finally { setLoading(false); }
  }, [token, language]);

  const loadInventoryParts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(API.PARTS.LIST, token);
      const data = await res.json() as ApiResponse<Part[]>;
      if (data.success) setInventoryParts(data.data);
    } catch (err) {
      console.error('Failed to load inventory parts:', err);
    }
  }, [token]);

  useEffect(() => {
    loadTasks();
    loadInventoryParts();
  }, [loadTasks, loadInventoryParts]);

  async function updateTask(taskId: string, status: string) {
    if (status === 'completed' && (!workNote || workNote.trim().length < 5)) {
      toast.error(language === 'zh' ? '完成维修时必须填写至少5个字的维修记录' : 'You must enter at least 5 characters of work note to complete repair');
      return;
    }
    setUpdating(true);
    try {
      const partsUsed = Object.entries(selectedParts)
        .filter(([_, qty]) => qty > 0)
        .map(([partId, qty]) => ({ partId, quantity: qty }));

      const res = await authFetch(API.REPAIRS.UPDATE_STATUS(taskId), token, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          workNote: workNote || undefined,
          partsUsed: partsUsed.length > 0 ? partsUsed : undefined
        }),
      });
      const data = await res.json() as ApiResponse<RepairRequest>;
      if (data.success) {
        toast.success(language === 'zh' ? '任务状态已更新' : 'Task status updated');
        setSelected(null);
        setWorkNote('');
        setSelectedParts({});
        loadTasks();
        loadInventoryParts();
      } else {
        toast.error(data.message || await readApiMessage(res, language === 'zh' ? '更新失败' : 'Failed to update'));
      }
    } catch { toast.error(language === 'zh' ? '网络错误' : 'Network error'); }
    finally { setUpdating(false); }
  }


  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'approved');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed' || t.status === 'pending_evaluation' || t.status === 'closed');

  const ratedTasks = completed.filter(t => t.rating && t.rating > 0);
  const avgRating = ratedTasks.length > 0 ? (ratedTasks.reduce((acc, t) => acc + (t.rating || 0), 0) / ratedTasks.length).toFixed(1) : '暂无';

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6">
        {([['tasks', t('tabTasks'), Wrench], ['stats', t('tabMyPerformance'), BarChart2]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as 'tasks' | 'stats')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{t('tabTasks')}</h3>
            <button onClick={loadTasks} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title={language === 'zh' ? '刷新列表' : 'Refresh List'}>
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: t('status_pending'), count: pending.length, color: 'bg-yellow-50 text-yellow-700', icon: Clock },
              { label: t('status_in_progress'), count: inProgress.length, color: 'bg-purple-50 text-purple-700', icon: Wrench },
              { label: t('status_completed'), count: completed.length, color: 'bg-green-50 text-green-700', icon: CheckCircle },
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
          <p className="text-muted-foreground">{language === 'zh' ? '暂无分配任务' : 'No assigned tasks'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{task.dormBuilding} {task.dormRoom}</span>
                    <Badge label={tCat(task.category || 'other', t)} colorClass="bg-gray-100 text-gray-700" />
                    {task.priority && <Badge label={tPriority(task.priority, t)} colorClass={PRIORITY_COLOR[task.priority]} />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                  {task.studentName && <p className="text-xs text-muted-foreground mt-1">{language === 'zh' ? `学生：${task.studentName}` : `Student: ${task.studentName}`}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge label={tStatus(task.status, t)} colorClass={STATUS_COLOR[task.status]} />
                  <SlaBadge slaDueDate={task.slaDueDate} status={task.status} />
                </div>
              </div>
              {task.adminNote && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">管理员备注：{task.adminNote}</p>
                </div>
              )}
              {task.workNote && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">维修记录：{task.workNote}</p>
                </div>
              )}
              {/* 评价信息显示（只读） */}
              {task.rating && task.rating > 0 && (
                <div className="mt-3 pt-3 border-t border-border bg-yellow-50/50 -mx-4 px-4 pb-1 rounded-b-2xl">
                  <p className="text-xs font-medium text-foreground mb-1">⭐ 学生评价</p>
                  <div className="flex items-center gap-1 mb-1">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className={`w-4 h-4 ${s <= task.rating! ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  {task.feedbackTags && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {task.feedbackTags.split(',').map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                  {task.feedbackText && (
                    <p className="text-xs text-muted-foreground">"{task.feedbackText}"</p>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border">
                {selected?.id === task.id ? (
                  <div className="space-y-3">
                    {task.status !== 'completed' && task.status !== 'rejected' && task.status !== 'pending_evaluation' && task.status !== 'closed' && (
                      <>
                        <textarea value={workNote} onChange={(e) => setWorkNote(e.target.value)}
                          rows={2} placeholder="填写维修记录（必填，至少5个字）"
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none" />

                        {/* 备件选择器 */}
                        <div className="bg-muted/30 border border-border rounded-xl p-3">
                          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                            <Wrench className="w-3.5 h-3.5 text-primary" />
                            登记消耗配件物料（完工时生效，可选）
                          </p>
                          {inventoryParts.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-2">无库存配件备件可用</p>
                          ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                              {inventoryParts.map((part) => {
                                const currentQty = selectedParts[part.id] || 0;
                                return (
                                  <div key={part.id} className="flex items-center justify-between text-xs">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{part.name}</span>
                                      <span className="text-[10px] text-muted-foreground">单价: ￥{part.price.toFixed(2)} | 库存: {part.stock}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (currentQty > 0) {
                                            setSelectedParts(p => ({ ...p, [part.id]: currentQty - 1 }));
                                          }
                                        }}
                                        disabled={currentQty === 0}
                                        className="w-5 h-5 rounded border border-border flex items-center justify-center bg-white hover:bg-muted font-bold disabled:opacity-50 select-none"
                                      >
                                        -
                                      </button>
                                      <span className="w-5 text-center font-bold text-foreground">{currentQty}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (currentQty < part.stock) {
                                            setSelectedParts(p => ({ ...p, [part.id]: currentQty + 1 }));
                                          } else {
                                            toast.error(`不能超过库存剩余数量 (${part.stock})`);
                                          }
                                        }}
                                        disabled={part.stock === 0}
                                        className="w-5 h-5 rounded border border-border flex items-center justify-center bg-white hover:bg-muted font-bold disabled:opacity-50 select-none"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => { setSelected(null); setWorkNote(''); setSelectedParts({}); }}
                            className="flex-1 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition">{t('cancel')}</button>
                          {(task.status === 'pending' || task.status === 'approved') && (
                            <button onClick={() => updateTask(task.id, 'in_progress')} disabled={updating}
                              className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                              {updating ? '...' : (language === 'zh' ? '开始维修' : 'Start Repair')}
                            </button>
                          )}
                          <button onClick={() => updateTask(task.id, 'completed')} disabled={updating}
                            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                            {updating ? '...' : t('completeRepair')}
                          </button>
                        </div>
                      </>
                    )}
                    <ConsumedPartsList repairId={task.id} token={token} status={task.status} />
                    <RepairComments repairId={task.id} token={token} />
                    <button onClick={() => { setSelected(null); setWorkNote(''); setSelectedParts({}); }}
                      className="w-full py-2 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition mt-2">
                      {language === 'zh' ? '收起' : 'Collapse'}
                    </button>
                  </div>

                ) : (
                  <button onClick={() => setSelected(task)}
                    className="w-full py-2 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition">
                    {task.status !== 'completed' && task.status !== 'rejected' && task.status !== 'pending_evaluation' && task.status !== 'closed' ? (language === 'zh' ? '更新状态 / 讨论' : 'Update Status / Discuss') : (language === 'zh' ? '查看讨论' : 'View Discussion')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">{language === 'zh' ? '绩效概览' : 'Performance Overview'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 text-blue-700 rounded-2xl p-4 flex flex-col">
                <span className="text-xs font-medium mb-1">{language === 'zh' ? '总任务数' : 'Total Tasks'}</span>
                <span className="text-3xl font-bold">{tasks.length}</span>
              </div>
              <div className="bg-green-50 text-green-700 rounded-2xl p-4 flex flex-col">
                <span className="text-xs font-medium mb-1">{language === 'zh' ? '已完成任务' : 'Completed Tasks'}</span>
                <span className="text-3xl font-bold">{completed.length}</span>
              </div>
              <div className="bg-yellow-50 text-yellow-700 rounded-2xl p-4 flex flex-col">
                <span className="text-xs font-medium mb-1">{language === 'zh' ? '待处理任务' : 'Pending Tasks'}</span>
                <span className="text-3xl font-bold">{pending.length}</span>
              </div>
              <div className="bg-purple-50 text-purple-700 rounded-2xl p-4 flex flex-col">
                <span className="text-xs font-medium mb-1">{language === 'zh' ? '进行中任务' : 'In Progress Tasks'}</span>
                <span className="text-3xl font-bold">{inProgress.length}</span>
              </div>
            </div>

            <div className="bg-muted/30 rounded-2xl p-6 border border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{language === 'zh' ? '平均服务评分' : 'Average Service Rating'}</p>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-extrabold text-foreground">{avgRating === '暂无' && language !== 'zh' ? 'None' : avgRating}</span>
                  <span className="text-sm text-muted-foreground mb-1.5">/ 5.0</span>
                </div>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-8 h-8 ${avgRating !== '暂无' && s <= Math.round(Number(avgRating)) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">{language === 'zh' ? '以上数据根据您分配的维修任务本地计算得出。' : 'The above data is calculated locally based on your assigned tasks.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
