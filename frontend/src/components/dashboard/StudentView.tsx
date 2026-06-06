import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { authFetch, API, readApiMessage } from '../../lib/api';
import { toast } from 'sonner';
import { RepairRequest, ApiResponse, PaginatedApiResponse } from '../../types';
import {
  Plus, Star, ChevronRight, RefreshCw, Send, ClipboardList, Sparkles
} from 'lucide-react';
import EvaluationModal from '../custom/EvaluationModal';
import Pagination from '../custom/Pagination';
import RepairComments from '../custom/RepairComments';
import { Badge, SlaBadge } from '../shared/StatusBadge';
import ConsumedPartsList from '../shared/ConsumedPartsList';
import { tCat, tStatus, tPriority, STATUS_COLOR, PRIORITY_COLOR } from '../shared/constants';

export default function StudentView({ token }: { token: string | null }) {
  const { language, t } = useLanguage();
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

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiDiagnosisText, setAiDiagnosisText] = useState('');

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
    } catch { toast.error(language === 'zh' ? '加载失败' : 'Load failed'); }
    finally { setLoading(false); }
  }, [token, currentPage, pageSize, language]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function submitRepair(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dormBuilding || !form.dormRoom || !form.description) {
      toast.error(language === 'zh' ? '请填写所有必填项' : 'Please fill in all required fields'); return;
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
        toast.success(language === 'zh' ? '报修申请提交成功！' : 'Repair request submitted successfully!');
        setForm({ dormBuilding: '', dormRoom: '', category: 'water', description: '', priority: 'normal', imageUrl: '' });
        setAiDiagnosisText('');
        setCurrentPage(1);
        setView('list');
        loadRequests();
      } else {
        toast.error(data.message || await readApiMessage(res, language === 'zh' ? `提交失败 (HTTP ${res.status})` : `Submission failed (HTTP ${res.status})`));
      }
    } catch (err) {
      console.error('Submit repair error:', err);
      toast.error(language === 'zh' ? '网络错误，请稍后重试' : 'Network error, please try again later');
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
        toast.success(language === 'zh' ? '评价提交成功！感谢您的反馈' : 'Evaluation submitted! Thank you for your feedback');
        setEvalModalOpen(false);
        setEvalTarget(null);
        loadRequests();
      } else {
        toast.error(data.message || await readApiMessage(res, language === 'zh' ? '评价提交失败' : 'Failed to submit evaluation'));
      }
    } catch { toast.error(language === 'zh' ? '网络错误' : 'Network error'); }
    finally { setEvalLoading(false); }
  }

  if (view === 'new') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setView('list'); setAiDiagnosisText(''); }} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold text-foreground">{t('requestRepair')}</h2>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6">
          <form onSubmit={submitRepair} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('dormBuilding')} <span className="text-red-500">*</span></label>
                <input value={form.dormBuilding} onChange={(e) => setForm(p => ({ ...p, dormBuilding: e.target.value }))}
                  placeholder={language === 'zh' ? "如：A栋、1号楼" : "e.g., Bldg A, Bldg 1"} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('roomNumber')} <span className="text-red-500">*</span></label>
                <input value={form.dormRoom} onChange={(e) => setForm(p => ({ ...p, dormRoom: e.target.value }))}
                  placeholder="e.g., 301" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('faultCategory')}</label>
                <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition">
                  <option value="water">{t('cat_water')}</option>
                  <option value="electricity">{t('cat_electricity')}</option>
                  <option value="furniture">{t('cat_furniture')}</option>
                  <option value="network">{t('cat_network')}</option>
                  <option value="other">{t('cat_other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('priority')}</label>
                <select value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition">
                  <option value="low">{t('priority_low')}</option>
                  <option value="normal">{t('priority_normal')}</option>
                  <option value="high">{t('priority_high')}</option>
                  <option value="urgent">{t('priority_urgent')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('faultDescription')} <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                rows={4} placeholder={t('describePlaceholder')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">{t('uploadPhoto')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-2">
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
                          toast.error(t('photoTip') || '图片大小不能超过 5MB');
                          return;
                        }
                        const formData = new FormData();
                        formData.append('file', file);

                        setSubmitting(true);
                        setAiAnalyzing(true);
                        setAiDiagnosisText('');
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
                            toast.success(language === 'zh' ? '图片上传成功！' : 'Image uploaded successfully!');

                            // Trigger AI Vision pre-inspection
                            try {
                              const aiFormData = new FormData();
                              aiFormData.append('file', file);
                              const aiRes = await authFetch(API.REPAIRS.ANALYZE_IMAGE, token, {
                                method: 'POST',
                                body: aiFormData,
                              });
                              const aiData = await aiRes.json() as { success: boolean; data?: { category: string; diagnosis: string } };
                              if (aiData.success && aiData.data) {
                                setForm(p => ({ ...p, category: aiData.data.category }));
                                setAiDiagnosisText(aiData.data.diagnosis);
                                toast.success(language === 'zh' ? '🤖 宿宝 AI 视觉分析推荐分类完成' : '🤖 Subao AI Vision analysis recommended category!');
                              }
                            } catch (err) {
                              console.error('AI vision analysis error:', err);
                            }
                          } else {
                            toast.error(data.message || (language === 'zh' ? '图片上传失败' : 'Image upload failed'));
                          }
                        } catch {
                          toast.error(language === 'zh' ? '上传图片时发生网络错误' : 'Network error during image upload');
                        } finally {
                          setSubmitting(false);
                          setAiAnalyzing(false);
                        }
                      }}
                    />
                    <Plus className="w-5 h-5 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground text-center px-1 font-medium">{language === 'zh' ? '添加图片' : 'Add Image'}</span>
                    <span className="text-[10px] text-muted-foreground/60 text-center">{form.imageUrl ? form.imageUrl.split(',').length : 0}/5</span>
                  </label>
                )}
              </div>
            </div>

            {/* AI Diagnosis Animation & Result */}
            {(aiAnalyzing || aiDiagnosisText) && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2 animate-fadeIn">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className={`w-4 h-4 ${aiAnalyzing ? 'animate-spin' : 'animate-bounce-subtle'}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {aiAnalyzing ? t('aiDiagnosis') : (language === 'zh' ? '🤖 宿宝 AI 视觉预检诊断' : '🤖 Subao AI Vision Pre-inspection')}
                  </span>
                </div>
                {aiAnalyzing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-xs text-muted-foreground">{language === 'zh' ? '宿宝正在读取您的故障图片...' : 'Subao is analyzing your fault image...'}</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/90 font-medium leading-relaxed bg-white/50 p-2.5 rounded-lg border border-primary/5">
                    {aiDiagnosisText}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setView('list'); setAiDiagnosisText(''); }}
                className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition">
                {t('cancel')}
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />{submitting ? t('loading') : t('submit')}
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
          <h2 className="text-xl font-bold text-foreground">{language === 'zh' ? '报修详情' : 'Repair Details'}</h2>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{selected.dormBuilding} {selected.dormRoom}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{tCat(selected.category, t)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge label={tStatus(selected.status, t)} colorClass={STATUS_COLOR[selected.status]} />
              <Badge label={tPriority(selected.priority, t)} colorClass={PRIORITY_COLOR[selected.priority]} />
              <SlaBadge slaDueDate={selected.slaDueDate} status={selected.status} />
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">{t('faultDescription')}</p>
            <p className="text-foreground leading-relaxed">{selected.description}</p>
          </div>
          {selected.imageUrl && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">{language === 'zh' ? '报修图片' : 'Repair Photos'}</p>
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
              <p className="text-sm font-medium text-muted-foreground mb-1">{language === 'zh' ? '管理员备注' : 'Admin Note'}</p>
              <p className="text-foreground">{selected.adminNote}</p>
            </div>
          )}
          {selected.assignedToName && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">{language === 'zh' ? '维修人员' : 'Technician'}</p>
              <p className="text-foreground">{selected.assignedToName}</p>
            </div>
          )}
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            {language === 'zh' ? '提交时间：' : 'Submitted At: '}{new Date(selected.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
          </div>

          {/* 评价信息显示 */}
          {selected.rating && selected.rating > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-2">{language === 'zh' ? '服务评价' : 'Service Evaluation'}</p>
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
          <ConsumedPartsList repairId={selected.id} token={token} status={selected.status} />
          <RepairComments repairId={selected.id} token={token} />
        </div>

      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">{t('myRepairs')}</h2>
        <div className="flex gap-2">
          <button onClick={loadRequests} className="p-2 rounded-xl border border-border hover:bg-muted transition hover:scale-105 active:scale-95 duration-200" title={language === 'zh' ? '刷新列表' : 'Refresh List'}>
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setView('new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition">
            <Plus className="w-4 h-4" />{t('requestRepair')}
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
          <p className="text-muted-foreground">{t('noData')}</p>
          <button onClick={() => setView('new')}
            className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition">
            {t('requestRepair')}
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
                    <Badge label={tCat(r.category, t)} colorClass="bg-gray-100 text-gray-700" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">{new Date(r.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
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
                  <Badge label={tStatus(r.status, t)} colorClass={STATUS_COLOR[r.status]} />
                  <Badge label={tPriority(r.priority, t)} colorClass={PRIORITY_COLOR[r.priority]} />
                  <SlaBadge slaDueDate={r.slaDueDate} status={r.status} />
                  {/* 待评价状态显示高亮按钮 */}
                  {r.status === 'pending_evaluation' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEvalTarget(r); setEvalModalOpen(true); }}
                      className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600 transition animate-pulse shadow-lg shadow-yellow-200"
                    >
                      {language === 'zh' ? '去评价' : 'Evaluate'}
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
