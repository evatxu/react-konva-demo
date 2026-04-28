import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { retryProjectItem } from "@/lib/api/postgres-store";

export async function POST(
  request: NextRequest,
  context: { params: { projectId: string; itemId: string } }
) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await retryProjectItem(auth.context.user.id, context.params.projectId, context.params.itemId));
  } catch (error) {
    return withServiceError(error);
  }
}
