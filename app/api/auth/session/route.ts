import { NextRequest } from "next/server";

import { jsonSuccess, requireSession } from "@/lib/api/http";
import { buildUserSessionPayload } from "@/lib/api/mock-store";

export function GET(request: NextRequest) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  return jsonSuccess(buildUserSessionPayload(auth.context.user.id));
}
