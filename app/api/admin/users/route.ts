import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { query } from "@/lib/db/postgres";
import { getBusinessWindowKey, type AccountState, type AccountPlan } from "@/lib/pigeon-studio";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  phone: string;
  nickname: string | null;
  avatar_url: string | null;
  status: "active" | "disabled";
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildDefaultAccount(): AccountState {
  return {
    plan: "free",
    freeUsed: 0,
    freeWindowKey: getBusinessWindowKey(),
    packCredits: 0,
    orders: []
  };
}

function mapUserRow(row: UserRow) {
  const nickname = row.nickname?.trim() || undefined;
  const account = buildDefaultAccount();
  const effectivePlan: AccountPlan = account.plan;

  return {
    id: String(row.id),
    role: "user" as const,
    name: nickname ?? row.phone,
    phone: row.phone,
    nickname,
    avatarUrl: row.avatar_url ?? undefined,
    status: row.status,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    lastLoginAt: toIsoString(row.last_login_at),
    projectCount: 0,
    activeProjectId: null,
    account,
    effectivePlan,
    latestProjectUpdatedAt: undefined
  };
}

export async function GET(request: NextRequest) {
  const auth = requireSession(request, "admin");
  console.log("🚀 ~ GET ~ auth:", auth)
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await query<UserRow>(
      `
        SELECT
          id,
          phone,
          nickname,
          avatar_url,
          status,
          last_login_at,
          created_at,
          updated_at
        FROM users
        ORDER BY created_at DESC, id DESC
      `
    );

    return jsonSuccess(result.rows.map(mapUserRow));
  } catch (error) {
    return withServiceError(error);
  }
}
