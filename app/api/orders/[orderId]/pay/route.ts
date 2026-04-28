import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { payOrder } from "@/lib/api/postgres-store";

export async function POST(request: NextRequest, context: { params: { orderId: string } }) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await payOrder(auth.context.user.id, context.params.orderId));
  } catch (error) {
    return withServiceError(error);
  }
}
