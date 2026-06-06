import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, API } from '../../lib/api';
import { toast } from 'sonner';
import { AIConfig, ApiResponse } from '../../types';
import { Plus, Edit2, Trash2, RefreshCw, X, Check, Play } from 'lucide-react';

export default function AdminAIConfigsTab({ token }: { token: string | null }) {
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
                    placeholder="如：DeepSeek大模型配置"
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
