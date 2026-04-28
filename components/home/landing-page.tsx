"use client";

import Link from "next/link";
import { ArrowRight, Boxes, CreditCard, FolderKanban, Loader2, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthModal } from "@/components/auth/auth-modal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiClient } from "@/lib/api/client";
import type { TemplateRecord, UserSessionPayload } from "@/lib/api/contracts";
import type { ProductOption } from "@/lib/pigeon-studio";
import { cn } from "@/lib/utils";

type TemplateCard = TemplateRecord & { locked: boolean };

const apiGroups = [
  {
    title: "认证与会话",
    items: ["POST /api/auth/login", "GET /api/auth/session", "POST /api/auth/logout"]
  },
  {
    title: "模板与权益",
    items: ["GET /api/templates", "GET /api/products", "GET /api/account/entitlements"]
  },
  {
    title: "项目与生产",
    items: ["GET/POST /api/projects", "POST /api/projects/:projectId/uploads", "PATCH /api/projects/:projectId/items/:itemId"]
  },
  {
    title: "导出与订单",
    items: ["POST /api/projects/:projectId/exports", "GET/POST /api/orders", "POST /api/orders/:orderId/pay"]
  }
];

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [session, setSession] = useState<UserSessionPayload | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPageData = async (initialSession?: UserSessionPayload | null) => {
    setLoading(true);
    try {
      const [templateData, productData] = await Promise.all([apiClient.templates.list(), apiClient.products.list()]);
      setTemplates(templateData);
      setProducts(productData);

      if (initialSession) {
        setSession(initialSession);
      } else {
        try {
          const sessionData = await apiClient.auth.session();
          setSession(sessionData);
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 401) {
            throw error;
          }
          setSession(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } finally {
      setSession(null);
    }
  };

  return (
    <>
      <main className="relative overflow-hidden px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_10%_10%,rgba(84,189,255,0.18),transparent_26%),radial-gradient(circle_at_90%_0%,rgba(255,176,106,0.18),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)]" />
        <div className="mx-auto max-w-[1180px]">
          <header className="sticky top-4 z-30 rounded-full border border-white/70 bg-white/88 px-5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/" className="flex items-center gap-3 text-lg font-semibold text-slate-900">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1764ff] text-white">
                  <Sparkles className="h-5 w-5" />
                </span>
                鸽眼海报
              </Link>

              <div className="flex flex-wrap items-center gap-3">
                {session ? (
                  <>
                    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                      {session.user.name} · {session.projectCount} 个项目
                    </div>
                    <Link href="/studio" className={cn(buttonVariants({ size: "sm" }), "rounded-full px-5")}>
                      进入工作台
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      退出
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setAuthOpen(true)}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-5")}
                    >
                      登录 / 注册
                    </button>
                    <Link href="/studio" className={cn(buttonVariants({ size: "sm" }), "rounded-full px-5")}>
                      先看工作台
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>

          <section className="grid gap-10 pb-20 pt-16 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-500 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
                <ShieldCheck className="h-4 w-4 text-[#1764ff]" />
                首页已接入真实接口数据
              </div>
              <div className="space-y-4">
                <h1 className="text-5xl font-semibold tracking-[-0.05em] text-slate-900 sm:text-6xl">
                  先把接口接起来
                  <br />
                  再让页面真正可用
                </h1>
                <p className="max-w-[620px] text-base leading-8 text-slate-500">
                  这次前端不再只展示静态能力说明，首页已经接入模板、商品和用户会话。工作台则以登录态为入口，继续承接项目、上传、编辑、导出和支付流程。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setAuthOpen(true)} className={buttonVariants({ size: "lg" })}>
                  立即登录
                </button>
                <Link href="/studio" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  查看工作台
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                  <div className="text-3xl font-semibold text-slate-900">{loading ? "-" : templates.length}</div>
                  <div className="mt-2 text-sm text-slate-500">模板接口</div>
                </div>
                <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                  <div className="text-3xl font-semibold text-slate-900">{loading ? "-" : products.length}</div>
                  <div className="mt-2 text-sm text-slate-500">商品接口</div>
                </div>
                <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                  <div className="text-3xl font-semibold text-slate-900">{session ? session.projectCount : 0}</div>
                  <div className="mt-2 text-sm text-slate-500">我的项目数</div>
                </div>
              </div>
            </div>

            <div className="rounded-[36px] border border-white/80 bg-white/92 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.10)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[#1764ff]">前端对接状态</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">接口清单已落页</div>
                </div>
                <div className="rounded-full bg-[#e9f2ff] px-4 py-2 text-sm font-medium text-[#1764ff]">API First</div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {apiGroups.map((group) => (
                  <div key={group.title} className="rounded-[24px] bg-[#f7f9fc] p-4">
                    <div className="text-base font-semibold text-slate-900">{group.title}</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-500">
                      {group.items.map((item) => (
                        <div key={item} className="rounded-[16px] bg-white px-3 py-2">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-medium tracking-[0.22em] text-slate-400">模板接口</div>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">模板列表来自 `GET /api/templates`</h2>
              </div>
              <Link href="/studio" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-slate-600")}>
                去工作台选择模板
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {loading ? (
                <div className="md:col-span-2 xl:col-span-4 flex min-h-[180px] items-center justify-center rounded-[28px] border border-slate-200 bg-white text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在加载模板信息
                </div>
              ) : null}
              {!loading &&
                templates.map((template) => (
                  <Card key={template.id} className="border-slate-200 bg-white/94">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-lg text-slate-900">{template.name}</CardTitle>
                        <Badge variant={template.tier === "free" ? "secondary" : "accent"}>
                          {template.tier === "free" ? "免费" : "付费"}
                        </Badge>
                      </div>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="h-28 rounded-[22px] border border-white/80"
                        style={{
                          background: `linear-gradient(135deg, ${template.backgroundFrom} 0%, ${template.backgroundTo} 100%)`
                        }}
                      />
                      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                        <span>{template.id}</span>
                        <span>{template.locked ? "当前账号未解锁" : "可选择"}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </section>

          <section className="py-10">
            <div>
              <div className="text-sm font-medium tracking-[0.22em] text-slate-400">商品接口</div>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">商品与权益由 `GET /api/products` 驱动</h2>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {products.map((product) => (
                <Card key={product.id} className="border-slate-200 bg-white/94">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1764ff]">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-slate-900">{product.name}</CardTitle>
                        <CardDescription>{product.priceLabel}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm leading-6 text-slate-500">
                    <div>{product.description}</div>
                    <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3 text-slate-600">
                      {product.kind === "pack"
                        ? `增加 ${product.credits ?? 0} 次导出额度`
                        : `开通 ${product.days ?? 30} 天月付权益`}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="py-10">
            <div className="grid gap-5 md:grid-cols-3">
              <Card className="border-slate-200 bg-white/94">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1764ff]">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <CardTitle>项目管理</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-500">
                  通过 `GET/POST /api/projects` 与项目详情接口，前端现在可以真正创建、选择、删除和编辑项目。
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white/94">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1764ff]">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <CardTitle>素材与记录</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-500">
                  图片、压缩包、CSV 表格和记录修改都由工作台统一走项目接口，不再停留在本地 mock 状态。
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white/94">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1764ff]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <CardTitle>导出与支付</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-500">
                  导出先走 API 扣减权益并生成工单，再在前端完成海报文件下载，支付则对接订单与权益刷新接口。
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={async ({ mode, session: nextSession }) => {
          if (mode === "user-login") {
            if (nextSession) {
              setSession(nextSession);
            }
            await loadPageData(nextSession ?? null);
          }
        }}
      />
    </>
  );
}
