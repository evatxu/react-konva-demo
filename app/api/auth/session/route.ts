import { NextRequest } from "next/server";

import { jsonSuccess, requireSession } from "@/lib/api/http";
import { buildUserSessionPayload } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  return jsonSuccess(await buildUserSessionPayload(auth.context.user.id));
}
