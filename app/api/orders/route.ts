import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { createOrder, listUserOrders } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await listUserOrders(auth.context.user.id));
  } catch (error) {
    return withServiceError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      productId: string;
    }>(request);
    return jsonSuccess(await createOrder(auth.context.user.id, body.productId), {
      status: 201
    });
  } catch (error) {
    return withServiceError(error);
  }
}
