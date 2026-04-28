import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listAdminOrders } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await listAdminOrders());
  } catch (error) {
    return withServiceError(error);
  }
}
