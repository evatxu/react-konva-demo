import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  FileOutput,
  FileSpreadsheet,
  Layers3,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigationItems = [
  { label: "首页", href: "#" },
  { label: "核心功能", href: "#features" },
  { label: "交付流程", href: "#workflow" },
  { label: "成品展示", href: "#showcase" }
];

const featureItems: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "上传素材",
    description: "上传鸽眼图、外形图与基础资料，自动整理到项目工作区。",
    icon: Upload
  },
  {
    title: "自动校正",
    description: "根据版式模板自动完成图像裁切、文案排版和展示位适配。",
    icon: Sparkles
  },
  {
    title: "Excel 导入",
    description: "批量读取足环号、鸽主、赛绩字段，减少手工回填成本。",
    icon: FileSpreadsheet
  },
  {
    title: "批量生成",
    description: "支持项目级导出与成品归档，适合俱乐部和鸽舍集中交付。",
    icon: Layers3
  }
];

const workflowItems = [
  {
    step: "01",
    title: "导入素材并选择模板",
    description: "建立项目后上传图片与资料，系统自动归类并检测缺失项。"
  },
  {
    step: "02",
    title: "上传表格并批量回填",
    description: "导入 Excel 后自动映射展示字段，适合整棚赛绩统一处理。"
  },
  {
    step: "03",
    title: "微调信息",
    description: "对冠军标识、广告位、文案和方向进行最后校对，确保成品准确。"
  },
  {
    step: "04",
    title: "导出成品",
    description: "按项目一键导出高清海报，支持留档、分发与商业交付。"
  }
];

const credibilityItems = [
  { value: "4 步", label: "完成交付" },
  { value: "Excel", label: "批量回填" },
  { value: "高清", label: "海报导出" }
];

type PosterTheme = "crimson" | "azure" | "amber";

function EyeArtwork({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-28 w-28"
  }[size];

  return (
    <div
      className={cn("relative shrink-0 rounded-full border-[8px] border-white shadow-[0_18px_30px_rgba(15,23,42,0.16)]", sizeClass)}
      style={{
        background:
          "radial-gradient(circle at center, #171717 0 8%, #78350f 8% 16%, #d97706 16% 30%, #7c2d12 30% 44%, #f59e0b 44% 62%, #f7c873 62% 76%, #87411c 76% 100%)"
      }}
    >
      <div className="absolute inset-[16%] rounded-full border border-white/35" />
      <div className="absolute inset-[32%] rounded-full border border-white/20" />
    </div>
  );
}

function PigeonArtwork({ theme = "crimson" }: { theme?: PosterTheme }) {
  const palette = {
    crimson: {
      neck: "#56c6b2",
      body: "#eef2f8",
      wing: "#475569",
      patch: "#111827"
    },
    azure: {
      neck: "#5ea7ff",
      body: "#f2f6fb",
      wing: "#3b82f6",
      patch: "#1e3a8a"
    },
    amber: {
      neck: "#7dd3c7",
      body: "#faf7f2",
      wing: "#64748b",
      patch: "#9a3412"
    }
  }[theme];

  return (
    <svg viewBox="0 0 240 180" className="h-auto w-full" aria-hidden="true">
      <path d="M36 98 12 89l6 20 32 13z" fill="#cbd5e1" />
      <path d="M190 48c7-10 17-14 33-13-7 13-18 21-32 24z" fill="#f97316" />
      <ellipse cx="119" cy="100" rx="64" ry="40" fill={palette.body} />
      <path
        d="M73 104c19-26 74-47 108-34 2 21-10 47-31 56-31 13-69 5-94-22 5-1 10-1 17 0Z"
        fill={palette.wing}
      />
      <path d="M108 92c20-15 45-19 71-13-8 18-22 33-43 39-19 6-40 3-58-8 8-6 18-12 30-18Z" fill={palette.patch} opacity="0.74" />
      <path
        d="M151 55c6-24 26-39 47-36 10 12 11 31 1 44-11 13-30 18-46 12-5-6-5-13-2-20Z"
        fill={palette.neck}
      />
      <circle cx="184" cy="54" r="3.5" fill="#111827" />
      <path d="M146 135c2 9 2 21 0 34" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
      <path d="M166 136c0 8 2 19 6 31" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
      <path d="M157 140h-17" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
      <path d="M176 140h-15" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function PosterMetrics({ accentClass }: { accentClass: string }) {
  return (
    <div className="grid grid-cols-4 gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
      {["足环", "血统", "赛绩", "广告"].map((item) => (
        <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center">
          <div className={cn("mx-auto mb-1 h-1.5 w-8 rounded-full", accentClass)} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function HeroPosterCard() {
  return (
    <div className="relative w-full max-w-[430px] rounded-[34px] border border-white/70 bg-white/92 p-5 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-semibold text-[#d92d20]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1ef]">
            <span className="h-2.5 w-2.5 rounded-full bg-current" />
          </span>
          海报制作
        </div>
        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">模板示意</span>
      </div>

      <div className="mt-5 grid grid-cols-[118px_1fr] items-center gap-4">
        <EyeArtwork size="lg" />
        <PigeonArtwork theme="crimson" />
      </div>

      <div className="mt-4 rounded-[24px] border border-[#ffd7d2] bg-[linear-gradient(135deg,#fff8f7_0%,#fff1ef_100%)] p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#f97066]">Champion Poster</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">冠军海报</h3>
            <p className="mt-2 text-sm text-slate-500">支持鸽眼图、外形图、足环号与赛绩字段组合生成。</p>
          </div>
          <div className="rounded-2xl bg-[#d92d20] px-3 py-2 text-xs font-semibold text-white">2024 赛事模板</div>
        </div>
      </div>

      <div className="mt-4">
        <PosterMetrics accentClass="bg-[#d92d20]" />
      </div>

      <div className="absolute -right-6 top-10 hidden w-44 rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.14)] lg:block">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#155eef]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">智能排版</p>
            <p className="text-xs text-slate-500">版式自动对齐</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowcasePoster({ theme, title, note, variant }: { theme: PosterTheme; title: string; note: string; variant: "classic" | "table" | "profile" }) {
  const themeMap = {
    crimson: {
      accent: "bg-[#d92d20]",
      soft: "bg-[#fff1ef]",
      line: "border-[#ffd7d2]",
      text: "text-[#d92d20]"
    },
    azure: {
      accent: "bg-[#155eef]",
      soft: "bg-[#eff4ff]",
      line: "border-[#d7e5ff]",
      text: "text-[#155eef]"
    },
    amber: {
      accent: "bg-[#d97706]",
      soft: "bg-[#fff5e6]",
      line: "border-[#fde2b6]",
      text: "text-[#d97706]"
    }
  }[theme];

  return (
    <article className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-2 text-sm font-semibold", themeMap.text)}>
          <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full", themeMap.soft)}>
            <span className={cn("h-2.5 w-2.5 rounded-full", themeMap.accent)} />
          </span>
          海报制作
        </div>
        <span className="text-[11px] text-slate-400">成品示例</span>
      </div>

      {variant === "classic" ? (
        <div className="mt-4 grid grid-cols-[80px_1fr] items-center gap-3">
          <EyeArtwork size="md" />
          <PigeonArtwork theme={theme} />
        </div>
      ) : null}

      {variant === "table" ? (
        <div className="mt-4 rounded-[22px] border border-slate-100 bg-slate-50 p-3">
          <div className="grid grid-cols-[68px_1fr] items-center gap-3">
            <EyeArtwork size="sm" />
            <div>
              <PigeonArtwork theme={theme} />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-2 rounded-full bg-slate-200" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {variant === "profile" ? (
        <div className="mt-4 rounded-[22px] border border-slate-100 bg-[linear-gradient(180deg,#fff7ef_0%,#ffffff_64%)] p-4">
          <div className="flex justify-end">
            <EyeArtwork size="sm" />
          </div>
          <div className="-mt-4 px-4">
            <PigeonArtwork theme={theme} />
          </div>
        </div>
      ) : null}

      <div className={cn("mt-4 rounded-[22px] border px-4 py-3", themeMap.line, themeMap.soft)}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{note}</p>
          </div>
          <div className={cn("rounded-2xl px-3 py-2 text-xs font-semibold text-white", themeMap.accent)}>导出高清</div>
        </div>
      </div>

      <div className="mt-4">
        <PosterMetrics accentClass={themeMap.accent} />
      </div>
    </article>
  );
}

function FeatureCard({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <article className="rounded-[28px] border border-white/70 bg-white/92 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#155eef]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_0%_8%,rgba(103,191,255,0.18),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(255,155,97,0.12),transparent_28%),linear-gradient(180deg,#f7fbff_0%,#f5f7fb_100%)]" />
      <div className="absolute inset-x-0 top-[420px] -z-10 h-[880px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.75)_18%,rgba(255,255,255,0.98)_100%)]" />

      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 rounded-full border border-white/70 bg-white/82 px-5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              鸽眼海报
            </Link>

            <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
              {navigationItems.map((item) => (
                <Link key={item.label} href={item.href} className="transition-colors hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:inline-flex">
                云端项目管理
              </span>
              <Link href="/studio" className={cn(buttonVariants({ size: "sm" }), "rounded-full px-5")}>
                进入工作台
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-16 pb-24 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-36 lg:pt-20">
          <div className="max-w-[560px]">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/85 px-4 py-2 text-sm text-slate-500 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <span className="h-8 w-1 rounded-full bg-[#95e9ef]" />
              AI 赛绩视觉编排
            </div>

            <h1 className="mt-8 text-5xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-6xl">
              重新定义赛鸽
              <br />
              海报生成
            </h1>

            <p className="mt-6 max-w-[520px] text-base leading-8 text-slate-500">
              以鸽眼素材和赛绩数据为核心，集中完成上传、校正、排版与导出，面向鸽舍、俱乐部和品牌活动提供统一的海报交付工作流。
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/studio" className={buttonVariants({ size: "lg" })}>
                立即开始制作
              </Link>
              <Link href="#showcase" className={buttonVariants({ variant: "outline", size: "lg" })}>
                查看成品案例
              </Link>
            </div>

            <div className="mt-12 grid max-w-[420px] grid-cols-3 gap-3">
              {credibilityItems.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                  <div className="text-lg font-semibold text-slate-900">{item.value}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="absolute left-8 top-10 hidden h-44 w-44 rounded-full bg-[#dff5ff] blur-3xl lg:block" />
            <div className="absolute bottom-8 right-4 hidden h-52 w-52 rounded-full bg-[#ffe7d6] blur-3xl lg:block" />
            <HeroPosterCard />
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="text-sm font-medium tracking-[0.24em] text-slate-400">核心功能</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">围绕交付效率设计首页结构</h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              从素材采集到海报导出，保持界面简洁、路径清晰，让运营人员和设计执行都能快速上手。
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {featureItems.map((item) => (
              <FeatureCard key={item.title} title={item.title} description={item.description} icon={item.icon} />
            ))}
          </div>
        </section>

        <section id="workflow" className="py-20">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="text-sm font-medium tracking-[0.24em] text-slate-400">四步完成专业交付</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">把重复劳动压缩到一个标准流程</h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              保留人工校对的控制权，同时让项目创建、数据回填和导出归档更稳定。
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-4">
            {workflowItems.map((item, index) => (
              <article key={item.step} className="relative rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">{item.step}</span>
                  {index === 0 ? (
                    <Upload className="h-5 w-5 text-[#155eef]" />
                  ) : null}
                  {index === 1 ? <FileSpreadsheet className="h-5 w-5 text-[#155eef]" /> : null}
                  {index === 2 ? <Clock3 className="h-5 w-5 text-[#155eef]" /> : null}
                  {index === 3 ? <FileOutput className="h-5 w-5 text-[#155eef]" /> : null}
                </div>
                <h3 className="mt-8 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{item.description}</p>
                <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
                  <ShieldCheck className="h-4 w-4" />
                  流程可追踪
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="showcase" className="py-20">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="text-sm font-medium tracking-[0.24em] text-slate-400">成品效果展示</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">不同版式统一收敛到同一套输出标准</h2>
            <p className="mt-4 text-sm leading-7 text-slate-500">
              不同客户和赛事场景下可以切换模板，但信息结构、导出质量和交付节奏保持一致。
            </p>
          </div>

          <div className="mt-14 grid gap-6 xl:grid-cols-3">
            <ShowcasePoster theme="crimson" title="冠军海报模板" note="突出鸽眼与冠军标识，适合赛事传播与朋友圈分发。" variant="classic" />
            <ShowcasePoster theme="azure" title="公告栏占位版" note="适合公棚公告、排名说明与批量套版输出。" variant="table" />
            <ShowcasePoster theme="amber" title="年度展示版" note="更适合品牌宣传、年度回顾与商业广告联合露出。" variant="profile" />
          </div>
        </section>

        <section className="pb-8 pt-8">
          <div className="rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:px-8 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-[620px]">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-400">立即开始</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">让首页直接接住工作台入口</h2>
              <p className="mt-4 text-sm leading-7 text-slate-500">
                首页用于建立认知和展示能力，真正的操作入口继续保留在工作台，减少跳转损耗。
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 lg:mt-0">
              <Link href="/studio" className={buttonVariants({ size: "lg" })}>
                进入工作台
              </Link>
              <Link href="#features" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-slate-600")}>
                查看能力说明
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
