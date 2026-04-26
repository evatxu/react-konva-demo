import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { getAdminConfig, updateAdminConfig } from "@/lib/api/mock-store";

export function GET(request: NextRequest) {
  const auth = requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(getAdminConfig());
  } catch (error) {
    return withServiceError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireSession(request, "admin");
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
    return jsonSuccess(updateAdminConfig(body));
  } catch (error) {
    return withServiceError(error);
  }
}
