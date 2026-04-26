import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { getOrder } from "@/lib/api/mock-store";

export function GET(request: NextRequest, context: { params: { orderId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(getOrder(auth.context.user.id, context.params.orderId));
  } catch (error) {
    return withServiceError(error);
  }
}
