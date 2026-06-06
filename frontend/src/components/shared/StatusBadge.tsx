import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>;
}

export function SlaBadge({ slaDueDate, status }: { slaDueDate?: string; status: string }) {
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
