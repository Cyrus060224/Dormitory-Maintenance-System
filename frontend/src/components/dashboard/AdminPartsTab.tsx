import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, API } from '../../lib/api';
import { toast } from 'sonner';
import { Part, ApiResponse } from '../../types';
import { Plus, Edit2, Trash2, RefreshCw, X, Check } from 'lucide-react';

export default function AdminPartsTab({ token }: { token: string | null }) {
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
