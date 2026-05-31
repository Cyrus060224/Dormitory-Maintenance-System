import { Link } from 'react-router-dom';
import { Wrench, Star, Clock, Shield, ArrowRight, ChevronRight, CheckCircle } from 'lucide-react';

/**
 * 落地页（Landing Page）
 * 极简专业风设计，严格复用现有 Tailwind 主题色和字体规范
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-blue-50">
      {/* ─── 顶部导航栏 ─────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-border/50 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground hidden sm:block">智能宿舍报修平台</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            登录
          </Link>
          <Link
            to="/login"
            className="px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition shadow-sm"
          >
            进入系统
          </Link>
        </div>
      </nav>

      {/* ─── Hero 区域 ─────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* 左侧：Hero Text */}
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground leading-tight tracking-tight">
              化繁为简，
              <br />
              <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
                极速响应
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-md">
              专为现代化校园打造。状态实时追踪，服务评价闭环，让后勤维保流程清晰可见。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition shadow-lg shadow-primary/25 text-base"
              >
                进入工作台
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-1 px-6 py-3.5 border border-border bg-white text-foreground rounded-xl font-medium hover:bg-muted transition text-base"
              >
                了解更多
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 右侧：虚拟工单状态卡片 */}
          <div className="relative flex justify-center md:justify-end">
            {/* 背景装饰 */}
            <div className="absolute -top-8 -right-8 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-blue-100/50 rounded-full blur-2xl" />

            {/* 工单卡片 */}
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-lg border border-border/50 p-6 space-y-5">
              {/* 卡片头部 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">工单号</p>
                  <p className="text-sm font-bold text-foreground">#1024</p>
                </div>
                <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-lg text-xs font-semibold">已结案</span>
              </div>

              {/* 工单详情 */}
              <div className="p-3 bg-gray-50 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">位置</span>
                  <span className="font-medium text-foreground">502 宿舍</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">类型</span>
                  <span className="font-medium text-foreground">照明维修</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">优先级</span>
                  <span className="font-medium text-orange-600">普通</span>
                </div>
              </div>

              {/* 进度条 */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3">进度流转</p>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-green-600">已提交</span>
                  </div>
                  <div className="flex-1 h-px bg-green-200 mx-1" />
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-green-600">维修中</span>
                  </div>
                  <div className="flex-1 h-px bg-green-200 mx-1" />
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-green-600">已结案</span>
                  </div>
                </div>
              </div>

              {/* 评价展示 */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-4 h-4 ${s <= 4 ? 'text-yellow-400 fill-current' : 'text-gray-200'}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">"响应迅速，技术专业，态度友好"</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── 特性展示区 ────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">高效闭环，全流程掌控</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">从提交报修到服务评价，每一步都清晰透明</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Clock className="w-6 h-6" />}
            title="实时状态追踪"
            desc="工单状态实时更新，学生、维修员、管理员多端同步，进度一目了然"
          />
          <FeatureCard
            icon={<Star className="w-6 h-6" />}
            title="服务评价闭环"
            desc="维修完成后可对服务进行评分和反馈，促进服务质量持续提升"
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="角色权限管理"
            desc="学生报修、维修员接单、管理员审核，各司其职，流程规范"
          />
        </div>
      </section>

      {/* ─── 底部 CTA ──────────────────────────────────────── */}
      <section className="border-t border-border bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-12 text-center">
          <h3 className="text-2xl font-bold text-foreground mb-3">准备好提升报修体验了吗？</h3>
          <p className="text-muted-foreground mb-6">即刻登录，开启高效维保之旅</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition shadow-lg shadow-primary/25"
          >
            立即登录
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-xs text-muted-foreground mt-8">© 2026 智能宿舍报修平台 · 校园后勤管理系统</p>
        </div>
      </section>
    </div>
  );
}

/** 特性卡片组件 */
function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-6 hover:shadow-md transition">
      <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
