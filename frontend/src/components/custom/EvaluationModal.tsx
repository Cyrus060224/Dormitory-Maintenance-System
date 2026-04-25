import React, { useState } from 'react';
import { Star, Send, X } from 'lucide-react';
import { toast } from 'sonner';

/** 快捷评价标签列表 */
const FEEDBACK_TAGS = [
  { label: '响应迅速', emoji: '⚡' },
  { label: '技术专业', emoji: '🔧' },
  { label: '态度友好', emoji: '😊' },
  { label: '现场整洁', emoji: '🧹' },
  { label: '问题解决', emoji: '✅' },
  { label: '现场未清理', emoji: '😤' },
];

interface EvaluationModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, tags: string[], text: string) => Promise<void>;
  loading: boolean;
}

export default function EvaluationModal({ open, onClose, onSubmit, loading }: EvaluationModalProps) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');

  /** 切换标签选择（多选） */
  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  /** 提交评价 */
  async function handleSubmit() {
    if (rating < 1) {
      toast.error('请选择评分');
      return;
    }
    await onSubmit(rating, selectedTags, feedbackText);
    // 重置表单
    setRating(5);
    setHoverRating(0);
    setSelectedTags([]);
    setFeedbackText('');
  }

  /** 关闭时重置 */
  function handleClose() {
    setRating(5);
    setHoverRating(0);
    setSelectedTags([]);
    setFeedbackText('');
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">服务评价</h3>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-muted transition"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 星级评分 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              满意度评分 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-125"
                >
                  <Star
                    className={`w-9 h-9 ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-current'
                        : 'text-gray-200'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                {['', '很差', '较差', '一般', '满意', '非常满意'][hoverRating || rating]}
              </span>
            </div>
          </div>

          {/* 快捷标签 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              快捷标签 <span className="text-xs text-muted-foreground font-normal">（可多选）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag.label);
                return (
                  <button
                    key={tag.label}
                    type="button"
                    onClick={() => toggleTag(tag.label)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    <span>{tag.emoji}</span>
                    <span>{tag.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 评语输入 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              详细评语 <span className="text-xs text-muted-foreground font-normal">（选填）</span>
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="请分享您的服务体验..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition resize-none"
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {feedbackText.length}/500
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-gray-50/50">
          <button
            onClick={handleClose}
            className="flex-1 py-3 border border-border rounded-xl font-medium text-foreground hover:bg-muted transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            提交评价
          </button>
        </div>
      </div>
    </div>
  );
}
