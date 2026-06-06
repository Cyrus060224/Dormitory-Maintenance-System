import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../lib/i18n';
import { RepairRequest, User, Stats, ApiResponse, PaginatedApiResponse, Part, RepairPart, AIConfig, ChatMessage } from '../types';
import { toast } from 'sonner';

// ─── i18n Type-safe Helpers ──────────────────────────────────────────────────
function tCat(cat: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`cat_${cat}` as keyof typeof translations.zh);
}
function tStatus(status: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`status_${status}` as keyof typeof translations.zh);
}
function tPriority(priority: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`priority_${priority}` as keyof typeof translations.zh);
}

import {
  Wrench, Home, ClipboardList, BarChart2, Users, LogOut,
  Plus, Star, CheckCircle, Clock,
  ChevronRight, RefreshCw, Send, Eye, Shield, Lock, Phone,
  Sparkles, AlertTriangle, Bot, MessageSquare, Trash2, Edit2, Play, Check, X
} from 'lucide-react';
import { API, authFetch, readApiMessage } from '../lib/api';
import EvaluationModal from '../components/custom/EvaluationModal';
import Pagination from '../components/custom/Pagination';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts';
import NotificationsMenu from '../components/custom/NotificationsMenu';
import AnnouncementsBanner from '../components/custom/AnnouncementsBanner';
import RepairComments from '../components/custom/RepairComments';

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

interface ConsumedPartsListProps {
  repairId: string;
  token: string | null;
  status: string;
}

function ConsumedPartsList({ repairId, token, status }: ConsumedPartsListProps) {
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [loading, setLoading] = useState(false);

  const loadParts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(API.PARTS.REPAIR_PARTS(repairId), token);
      const data = await res.json() as ApiResponse<RepairPart[]>;
      if (data.success) {
        setParts(data.data);
      }
    } catch (err) {
      console.error('Failed to load consumed parts:', err);
    } finally {
      setLoading(false);
    }
  }, [repairId, token]);

  useEffect(() => {
    if (['completed', 'pending_evaluation', 'closed'].includes(status)) {
      loadParts();
    } else {
      setParts([]);
    }
  }, [repairId, status, loadParts]);

  if (parts.length === 0) return null;

  const totalCost = parts.reduce((acc, p) => acc + p.quantity * p.price, 0);

  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
        🔧 消耗配件物料明细
      </p>
      <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-2">
        <div className="divide-y divide-border">
          {parts.map((p) => (
            <div key={p.id} className="py-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{p.partName || '已删配件'} x {p.quantity}</span>
              <span className="font-semibold text-foreground">￥{(p.quantity * p.price).toFixed(2)} <span className="text-[10px] text-muted-foreground font-normal">(￥{p.price}/件)</span></span>
            </div>
          ))}
        </div>
        <div className="border-t border-border/60 pt-2 flex justify-between text-xs font-bold text-foreground">
          <span>物料总计</span>
          <span className="text-primary text-sm">￥{totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function AdminPartsTab({ token }: { token: string | null }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [form, setForm] = useState({ name: '', price: '', stock: '' });

  const loadParts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(API.PARTS.LIST, token);
      const data = await res.json() as ApiResponse<Part[]>;
      if (data.success) setParts(data.data);
    } catch {
      toast.error('加载备件失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  const handleOpenAdd = () => {
    setEditingPart(null);
    setForm({ name: '', price: '', stock: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (part: Part) => {
    setEditingPart(part);
    setForm({ name: part.name, price: String(part.price), stock: String(part.stock) });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.stock) {
      toast.error('请填写完整信息');
      return;
    }
    const priceNum = parseFloat(form.price);
    const stockNum = parseInt(form.stock);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('单价必须是有效数字');
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      toast.error('库存数必须是整数');
      return;
    }

    try {
      if (editingPart) {
        const res = await authFetch(API.PARTS.UPDATE(editingPart.id), token, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, price: priceNum, stock: stockNum }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success('更新成功');
          setIsModalOpen(false);
          loadParts();
        } else {
          toast.error(data.message || '更新失败');
        }
      } else {
        const res = await authFetch(API.PARTS.CREATE, token, {
          method: 'POST',
          body: JSON.stringify({ name: form.name, price: priceNum, stock: stockNum }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success('添加成功');
          setIsModalOpen(false);
          loadParts();
        } else {
          toast.error(data.message || '添加失败');
        }
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该备件吗？这不会影响历史消耗记录，但以后将无法选择。')) return;
    try {
      const res = await authFetch(API.PARTS.DELETE(id), token, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('删除成功');
        loadParts();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-foreground">备品备件库存列表</h3>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition hover:scale-105 active:scale-95 duration-200"
        >
          <Plus className="w-4 h-4" /> 添加配件
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : parts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground">
          暂无配件，请先添加备品备件以供报修使用。
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-muted-foreground font-medium">
                  <th className="p-4">名称</th>
                  <th className="p-4">单价</th>
                  <th className="p-4">当前库存</th>
                  <th className="p-4">创建时间</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parts.map((part) => (
                  <tr key={part.id} className="hover:bg-muted/10">
                    <td className="p-4 font-semibold text-foreground">{part.name}</td>
                    <td className="p-4 text-primary font-medium">￥{part.price.toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        part.stock === 0 ? 'bg-red-50 text-red-700 border border-red-100' :
                        part.stock < 5 ? 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse' :
                        'bg-green-50 text-green-700 border border-green-100'
                      }`}>
                        {part.stock} 件
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">{new Date(part.createdAt).toLocaleDateString()}</td>
                    <td className="p-4 text-right space-x-2 text-xs">
                      <button
                        onClick={() => handleOpenEdit(part)}
                        className="text-primary hover:underline font-bold"
                      >
                        编辑/补库
                      </button>
                      <button
                        onClick={() => handleDelete(part.id)}
                        className="text-red-500 hover:underline font-bold"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <h4 className="text-lg font-bold mb-4">{editingPart ? '编辑备品备件' : '添加备品备件'}</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">配件名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="如：LED灯管、水龙头阀芯"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">单价 (元)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">库存数量</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm(p => ({ ...p, stock: e.target.value }))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition"
                >
                  确认
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function AdminAIConfigsTab({ token }: { token: string | null }) {
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    provider: 'simulation' as AIConfig['provider'],
    apiKey: '',
    baseUrl: '',
    model: '',
    systemPrompt: '',
    isActive: false
  });

  const loadConfigs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(API.AI.CONFIG_LIST, token);
      const data = await res.json() as ApiResponse<AIConfig[]>;
      if (data.success) setConfigs(data.data);
    } catch {
      toast.error('加载AI配置失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleProviderChange = (provider: AIConfig['provider']) => {
    let baseUrl = '';
    let model = '';
    let systemPrompt = form.systemPrompt || '你是一个可爱的宿舍生活助手，名字叫\'宿宝\'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。';
    
    if (provider === 'openai') {
      baseUrl = 'https://api.openai.com/v1';
      model = 'gpt-4o-mini';
    } else if (provider === 'deepseek') {
      baseUrl = 'https://api.deepseek.com/v1';
      model = 'deepseek-chat';
    } else if (provider === 'ollama') {
      baseUrl = 'http://localhost:11434';
      model = 'llama3';
    } else if (provider === 'xiaomi') {
      baseUrl = 'https://api.xiaoai.mi.com/v1';
      model = 'xiaomi-model';
    } else if (provider === 'simulation') {
      baseUrl = '';
      model = 'simulation-model';
    }

    setForm(prev => ({
      ...prev,
      provider,
      baseUrl,
      model,
      systemPrompt
    }));
  };

  const handleOpenAdd = () => {
    setEditingConfig(null);
    setForm({
      name: '',
      provider: 'simulation',
      apiKey: '',
      baseUrl: '',
      model: 'simulation-model',
      systemPrompt: '你是一个可爱的宿舍生活助手，名字叫\'宿宝\'。请用温柔和善的语气解答学校宿舍生活、报修规范、维修指引相关的问题。',
      isActive: false
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cfg: AIConfig) => {
    setEditingConfig(cfg);
    setForm({
      name: cfg.name,
      provider: cfg.provider,
      apiKey: cfg.apiKey || '',
      baseUrl: cfg.baseUrl || '',
      model: cfg.model || '',
      systemPrompt: cfg.systemPrompt || '',
      isActive: cfg.isActive === 1
    });
    setIsModalOpen(true);
  };

  const handleTestConnection = async () => {
    if (!form.provider) return;
    setTesting(true);
    try {
      const res = await authFetch(API.AI.CONFIG_TEST, token, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name || 'Test',
          provider: form.provider,
          apiKey: form.apiKey,
          baseUrl: form.baseUrl,
          model: form.model,
          systemPrompt: form.systemPrompt,
          isActive: form.isActive
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || '连接测试成功！');
      } else {
        toast.error(data.detail || '连接测试失败');
      }
    } catch {
      toast.error('网络连接错误');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.provider) {
      toast.error('请填写名称并选择引擎服务商');
      return;
    }

    try {
      const payload = {
        name: form.name,
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl,
        model: form.model,
        systemPrompt: form.systemPrompt,
        isActive: form.isActive
      };

      let res;
      if (editingConfig) {
        res = await authFetch(API.AI.CONFIG_UPDATE(editingConfig.id), token, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        res = await authFetch(API.AI.CONFIG_CREATE, token, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      
      const data = await res.json();
      if (data.success) {
        toast.success(editingConfig ? '保存配置成功' : '创建配置成功');
        setIsModalOpen(false);
        loadConfigs();
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch {
      toast.error('保存配置发生网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该AI配置吗？')) return;
    try {
      const res = await authFetch(API.AI.CONFIG_DELETE(id), token, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('删除成功');
        loadConfigs();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch {
      toast.error('删除配置失败，网络错误');
    }
  };

  const handleSetActive = async (cfg: AIConfig) => {
    try {
      const res = await authFetch(API.AI.CONFIG_UPDATE(cfg.id), token, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已启用引擎: ${cfg.name}`);
        loadConfigs();
      } else {
        toast.error(data.message || '启用失败');
      }
    } catch {
      toast.error('启用引擎发生网络错误');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-foreground">AI 智能助手「宿宝」引擎配置</h3>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition hover:scale-105 active:scale-95 duration-200"
        >
          <Plus className="w-4 h-4" /> 新增 AI 引擎
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground">
          暂无 AI 引擎配置，请先添加配置预设。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <div key={cfg.id} className={`bg-white rounded-2xl border p-5 shadow-sm transition duration-300 hover:shadow-md ${cfg.isActive === 1 ? 'border-primary border-2' : 'border-border'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-foreground text-lg">{cfg.name}</h4>
                    {cfg.isActive === 1 && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 激活中
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">服务商: <span className="font-semibold text-foreground uppercase">{cfg.provider}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(cfg)}
                    className="p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cfg.id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm border-t border-muted/50 pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">模型名称:</span>
                  <span className="font-medium text-foreground">{cfg.model || '未设定'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">接口地址:</span>
                  <span className="font-medium text-foreground truncate max-w-[200px]" title={cfg.baseUrl}>{cfg.baseUrl || '无 (本地/模拟)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API Key:</span>
                  <span className="font-medium text-foreground text-xs">{cfg.apiKey || '无'}</span>
                </div>
              </div>

              {cfg.isActive !== 1 && (
                <div className="mt-4 pt-3 border-t border-muted/50 flex justify-end">
                  <button
                    onClick={() => handleSetActive(cfg)}
                    className="px-3.5 py-1.5 bg-muted hover:bg-primary hover:text-primary-foreground text-foreground rounded-lg text-xs font-semibold transition"
                  >
                    启用该引擎
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="text-lg font-bold text-foreground">
                {editingConfig ? '编辑 AI 引擎配置' : '添加 AI 引擎配置'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-muted rounded-full transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">配置名称</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="如：小米大模型配置"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">引擎服务商</label>
                  <select
                    value={form.provider}
                    onChange={(e) => handleProviderChange(e.target.value as AIConfig['provider'])}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="simulation">模拟对话引擎 (本地开发)</option>
                    <option value="xiaomi">Xiaomi (小米 API)</option>
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="deepseek">DeepSeek (深度求索)</option>
                    <option value="ollama">Ollama (本地部署LLM)</option>
                    <option value="custom">Custom (自定义OpenAI兼容型)</option>
                  </select>
                </div>
              </div>

              {form.provider !== 'simulation' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">接口基础 URL (Base URL)</label>
                      <input
                        type="text"
                        value={form.baseUrl}
                        onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                        placeholder="e.g. https://api.openai.com/v1"
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">模型名称 (Model)</label>
                      <input
                        type="text"
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        placeholder="e.g. gpt-4o-mini"
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">API Key (API密钥)</label>
                    <input
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                      placeholder="如果您不需要修改或无需密钥，可留空"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">角色设定 Prompt (System Instructions)</label>
                <textarea
                  rows={4}
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  placeholder="设定AI智能助手说话的身份、语气和背景知识。"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 text-primary focus:ring-primary border-border rounded transition"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer select-none">
                  立即启用该配置（将会覆盖当前已激活的 AI 引擎）
                </label>
              </div>

              <div className="border-t border-border pt-4 flex justify-between gap-3 text-sm">
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleTestConnection}
                  className="px-4 py-2 border border-border text-foreground rounded-xl font-semibold hover:bg-muted transition flex items-center gap-2 active:scale-95 disabled:opacity-55"
                >
                  {testing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  测试连接
                </button>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-xl font-semibold transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-semibold transition shadow-sm"
                  >
                    保存配置
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Student View ─────────────────────────────────────────────────────────────

function StudentView({ token }: { token: string | null }) {
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

// ─── Technician View ──────────────────────────────────────────────────────────
function TechnicianView({ token }: { token: string | null }) {
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

// ─── Admin View ───────────────────────────────────────────────────────────────
function AdminView({ token }: { token: string | null }) {
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
              <div className="h-[240px] w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
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

function SubaoChatWidget({ token, role }: { token: string | null; role: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: '你好呀！我是宿舍小助手 **「宿宝」** 🤖✨。有什么关于宿舍报修、起居生活或管理系统的问题，都可以随时问我哦！'
        }
      ]);
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const content = (textToSend || input).trim();
    if (!content || loading) return;

    if (!textToSend) setInput('');
    setLoading(true);

    const newMessages = [...messages, { role: 'user' as const, content }];
    setMessages(newMessages);

    try {
      const res = await authFetch(API.AI.CHAT, token, {
        method: 'POST',
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 宿宝暂时遇到了网络阻碍（${data.detail || '接口报错'}）。您可以稍后再试，或者联系管理员。` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ 宿宝无法连接到后台服务器，请检查您的网络。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (confirm('确定要清空与宿宝的历史对话吗？')) {
      setMessages([
        {
          role: 'assistant',
          content: '对话已重置。你好，我是「宿宝」，有什么我可以帮你的吗？'
        }
      ]);
    }
  };

  const chips = role === 'admin'
    ? ['如何导出报修记录？', '如何启用新AI模型？', '修改我的密码']
    : role === 'technician'
      ? ['用电安全指引', '水管漏水应急处理', '修改我的密码']
      : ['宿舍停电怎么办？', '如何提交报修单？', '修改我的密码'];

  const renderMessageContent = (text: string) => {
    if (!text) return null;
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-black/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>');
    html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc mt-1">$1</li>');
    html = html.replace(/^\s*(\d+)\.\s+(.*?)$/gm, '<li class="ml-4 list-decimal mt-1">$2</li>');
    html = html.replace(/\n\n/g, '<div class="h-2"></div>');
    html = html.replace(/\n/g, '<br />');
    
    return <div dangerouslySetInnerHTML={{ __html: html }} className="text-sm leading-relaxed whitespace-pre-wrap" />;
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60] select-none">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 relative group animate-bounce-subtle"
        >
          <Bot className="w-7 h-7" />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500"></span>
          </span>
          <div className="absolute right-16 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap shadow-md">
            问问宿宝 🤖
          </div>
        </button>
      )}

      {isOpen && (
        <div className="w-[360px] sm:w-[380px] h-[500px] bg-white rounded-3xl border border-border/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          <div className="px-5 py-4 bg-gradient-to-r from-primary to-blue-600 text-white flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-sm leading-tight">宿舍助理「宿宝」</h4>
                <p className="text-[10px] text-white/70">在线智能服务中</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleClear}
                className="p-1.5 hover:bg-white/10 rounded-lg transition"
                title="清空对话"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {messages.map((msg, index) => (
              <div key={index} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-4.5 h-4.5" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-white text-foreground border border-border/60 rounded-tl-none'
                  }`}
                >
                  {renderMessageContent(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-8 h-8 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
                  <Bot className="w-4.5 h-4.5" />
                </div>
                <div className="bg-white border border-border/60 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center justify-center">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-2 border-t border-border bg-white overflow-x-auto whitespace-nowrap flex gap-2 no-scrollbar scroll-smooth">
            {chips.map((chip, idx) => (
              <button
                key={idx}
                disabled={loading}
                onClick={() => handleSend(chip)}
                className="inline-block px-3 py-1 bg-muted hover:bg-primary hover:text-white text-xs font-medium rounded-full transition duration-200 border border-border/40 disabled:opacity-50 select-none active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-border bg-white flex gap-2 items-center">
            <input
              type="text"
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="发送给宿宝的问题..."
              className="flex-1 px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm disabled:bg-muted/30"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-primary disabled:bg-muted hover:opacity-90 disabled:text-muted-foreground text-primary-foreground rounded-xl transition flex items-center justify-center active:scale-95 duration-200 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
