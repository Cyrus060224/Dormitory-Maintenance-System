import React, { useState, useEffect, useCallback } from 'react';
import { authFetch, API } from '../../lib/api';
import { RepairPart, ApiResponse } from '../../types';

interface ConsumedPartsListProps {
  repairId: string;
  token: string | null;
  status: string;
}

export default function ConsumedPartsList({ repairId, token, status }: ConsumedPartsListProps) {
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
