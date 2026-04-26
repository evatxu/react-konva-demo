import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { getEntitlements } from "@/lib/api/mock-store";

export function GET(request: NextRequest) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(getEntitlements(auth.context.user.id));
  } catch (error) {
    return withServiceError(error);
  }
}
