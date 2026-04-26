import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { exportProjectRecords } from "@/lib/api/mock-store";
import type { ExportFormat } from "@/lib/pigeon-studio";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      itemIds?: string[];
      format?: ExportFormat;
    }>(request);
    return jsonSuccess(exportProjectRecords(auth.context.user.id, context.params.projectId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
