import { NextRequest, NextResponse } from "next/server";

import { ApiServiceError, type ApiResponse, type SessionRole } from "@/lib/api/contracts";
import { getSessionContext } from "@/lib/api/postgres-store";

export const USER_SESSION_COOKIE = "pigeon_demo_session";
export const ADMIN_SESSION_COOKIE = "pigeon_demo_admin_session";

function getCookieName(role: SessionRole) {
  return role === "admin" ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE;
}

export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>(
    {
      success: true,
      data
    },
    init
  );
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details
      }
    },
    {
      status
    }
  );
}

export function withServiceError(error: unknown) {
  if (error instanceof ApiServiceError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  return jsonError(500, "internal_error", "服务执行失败。", error instanceof Error ? error.message : error);
}

export async function parseJsonBody<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiServiceError(400, "invalid_json", "请求体不是合法 JSON。");
  }
}

export async function requireSession(request: NextRequest, role: SessionRole) {
  const token = request.cookies.get(getCookieName(role))?.value;
  if (!token) {
    return {
      ok: false as const,
      response: jsonError(401, "unauthorized", "缺少登录态。")
    };
  }

  try {
    const context = await getSessionContext(token, role);
    return {
      ok: true as const,
      context
    };
  } catch (error) {
    return {
      ok: false as const,
      response: withServiceError(error)
    };
  }
}

export function setSessionCookie(response: NextResponse, role: SessionRole, token: string) {
  response.cookies.set(getCookieName(role), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
  return response;
}

export function clearSessionCookie(response: NextResponse, role: SessionRole) {
  response.cookies.set(getCookieName(role), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
  return response;
}
