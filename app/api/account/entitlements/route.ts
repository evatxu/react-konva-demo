import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { getEntitlements } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await getEntitlements(auth.context.user.id));
  } catch (error) {
    return withServiceError(error);
  }
}
