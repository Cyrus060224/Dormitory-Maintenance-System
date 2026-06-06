import React, { useState, useEffect, useRef } from 'react';
import { Bot, RefreshCw, X, Send } from 'lucide-react';
import { API, authFetch } from '../../lib/api';
import { ChatMessage } from '../../types';

export default function SubaoChatWidget({ token, role }: { token: string | null; role: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
