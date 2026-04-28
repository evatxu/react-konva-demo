import { NextRequest } from "next/server";

import { jsonSuccess, requireSession } from "@/lib/api/http";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  return jsonSuccess({
    user: auth.context.user,
    session: auth.context.session
  });
}
