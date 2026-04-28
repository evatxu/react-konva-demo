import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listProjectItems } from "@/lib/api/postgres-store";
import type { RecordStatus } from "@/lib/pigeon-studio";

export async function GET(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const status = request.nextUrl.searchParams.get("status") as RecordStatus | null;
    const keyword = request.nextUrl.searchParams.get("keyword") ?? undefined;
    return jsonSuccess(
      await listProjectItems(auth.context.user.id, context.params.projectId, {
        status: status ?? undefined,
        keyword
      })
    );
  } catch (error) {
    return withServiceError(error);
  }
}
