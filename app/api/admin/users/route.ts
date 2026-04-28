import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listAdminUsers } from "@/lib/api/postgres-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await listAdminUsers());
  } catch (error) {
    return withServiceError(error);
  }
}
