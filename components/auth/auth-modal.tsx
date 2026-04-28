"use client";

import { Loader2, LockKeyhole, Shield, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";

import { ModalShell } from "@/components/shared/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClientError, apiClient } from "@/lib/api/client";
import type { AdminSessionPayload, UserSessionPayload } from "@/lib/api/contracts";

type AuthMode = "user-login" | "admin-login" | "admin-register";

interface AuthSuccessPayload {
  mode: AuthMode;
  session?: UserSessionPayload;
  adminSession?: AdminSessionPayload;
}

interface AuthModalProps {
  open: boolean;
  defaultMode?: AuthMode;
  onClose: () => void;
  onSuccess?: (payload: AuthSuccessPayload) => void | Promise<void>;
}

function hintForMode(mode: AuthMode) {
  switch (mode) {
    case "user-login":
      return "用户侧使用手机号登录，首次登录会自动创建账号。";
    case "admin-login":
      return "管理员入口使用用户名和密码，登录后写入独立的管理员 Cookie。";
    case "admin-register":
      return "当前接口仅提供管理员注册，管理员和普通用户会话彼此隔离。";
  }
}

export function AuthModal({ open, defaultMode = "user-login", onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [userPhone, setUserPhone] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const helperText = useMemo(() => hintForMode(mode), [mode]);

  const handleSuccess = async (payload: AuthSuccessPayload) => {
    setErrorText(null);
    if (onSuccess) {
      await onSuccess(payload);
    }
    onClose();
  };

  const submitUserLogin = async () => {
    const phone = userPhone.trim();
    if (!phone) {
      setErrorText("请输入手机号。");
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const session = await apiClient.auth.login({ phone });
      await handleSuccess({
        mode: "user-login",
        session
      });
    } catch (error) {
      setErrorText(error instanceof ApiClientError ? error.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdmin = async (targetMode: "admin-login" | "admin-register") => {
    const username = adminUsername.trim();
    const password = adminPassword.trim();

    if (!username) {
      setErrorText("请输入管理员用户名。");
      return;
    }
    if (!password) {
      setErrorText("请输入管理员密码。");
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      if (targetMode === "admin-login") {
        await apiClient.admin.login({ username, password });
      } else {
        await apiClient.admin.register({ username, password });
      }
      const adminSession = await apiClient.admin.session();
      await handleSuccess({
        mode: targetMode,
        adminSession
      });
    } catch (error) {
      setErrorText(error instanceof ApiClientError ? error.message : "提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="登录 / 注册"
      description="工作台依赖用户登录态；管理员注册能力也在这里统一收口。"
      maxWidthClassName="max-w-3xl"
    >
      <div className="grid gap-0 lg:grid-cols-[320px,minmax(0,1fr)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#f5f8fd_0%,#edf3fb_100%)] p-6 lg:border-b-0 lg:border-r">
          <div className="rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#e8f2ff] px-3 py-1 text-sm font-medium text-[#155eef]">
              <LockKeyhole className="h-4 w-4" />
              接口已接入
            </div>
            <div className="mt-4 text-2xl font-semibold text-slate-900">统一认证入口</div>
            <div className="mt-3 text-sm leading-7 text-slate-500">{helperText}</div>
            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                `POST /api/auth/login`<br />
                用户手机号登录
              </div>
              <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                `POST /api/admin/auth/login`<br />
                管理员登录
              </div>
              <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                `GET /api/admin/auth/session`<br />
                管理员会话查询
              </div>
              <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                `POST /api/admin/auth/register`<br />
                管理员注册
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="user-login">用户登录</TabsTrigger>
              <TabsTrigger value="admin-login">管理员登录</TabsTrigger>
              <TabsTrigger value="admin-register">管理员注册</TabsTrigger>
            </TabsList>

            <TabsContent value="user-login" className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Smartphone className="h-4 w-4 text-[#155eef]" />
                  手机号
                </div>
                <Input
                  value={userPhone}
                  onChange={(event) => setUserPhone(event.target.value)}
                  placeholder="13800138000"
                />
              </div>
              <div className="rounded-[22px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-500">
                普通用户没有单独注册接口，首次输入新手机号登录时后端会自动建号。
              </div>
              <Button type="button" className="w-full" onClick={() => void submitUserLogin()} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                登录工作台
              </Button>
            </TabsContent>

            <TabsContent value="admin-login" className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Shield className="h-4 w-4 text-[#155eef]" />
                  用户名
                </div>
                <Input
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  placeholder="admin"
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">密码</div>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="请输入管理员密码"
                />
              </div>
              <Button type="button" className="w-full" onClick={() => void submitAdmin("admin-login")} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                管理员登录
              </Button>
            </TabsContent>

            <TabsContent value="admin-register" className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">管理员用户名</div>
                <Input
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  placeholder="输入新管理员用户名"
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">密码</div>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <Button type="button" className="w-full" onClick={() => void submitAdmin("admin-register")} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                创建管理员
              </Button>
            </TabsContent>
          </Tabs>

          {errorText ? <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div> : null}
        </div>
      </div>
    </ModalShell>
  );
}
