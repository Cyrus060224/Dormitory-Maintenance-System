import { translations } from '../../lib/i18n';

// ─── i18n Type-safe Helpers ──────────────────────────────────────────────────
export function tCat(cat: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`cat_${cat}` as keyof typeof translations.zh);
}
export function tStatus(status: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`status_${status}` as keyof typeof translations.zh);
}
export function tPriority(priority: string, t: (key: keyof typeof translations.zh) => string): string {
  return t(`priority_${priority}` as keyof typeof translations.zh);
}

// ─── Status helpers ───────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  pending: '待处理', approved: '已审核', in_progress: '维修中',
  completed: '已完成', pending_evaluation: '待评价', closed: '已结案', rejected: '已拒绝',
};
export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-800',
  approved: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  pending_evaluation: 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-300',
  closed: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
};
export const CATEGORY_LABEL: Record<string, string> = {
  water: '水管/水电', electricity: '电路/电器', furniture: '家具/设施',
  network: '网络/通信', other: '其他',
};
export const PRIORITY_LABEL: Record<string, string> = {
  low: '低', normal: '普通', high: '高', urgent: '紧急',
};
export const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};
