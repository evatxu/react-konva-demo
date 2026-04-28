import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { getAdminConfig, updateAdminConfig } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await getAdminConfig());
  } catch (error) {
    return withServiceError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      freeDailyQuota?: number;
      watermarkOnFree?: boolean;
      uploadNamingRules?: string[];
      uploadTips?: string[];
    }>(request);
    return jsonSuccess(await updateAdminConfig(body, auth.context.user.id));
  } catch (error) {
    return withServiceError(error);
  }
}
