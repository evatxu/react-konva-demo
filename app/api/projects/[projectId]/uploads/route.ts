import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { mutateProjectUploads } from "@/lib/api/postgres-store";
import type { UploadKind } from "@/lib/pigeon-studio";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      action?: "append" | "replace" | "supplement" | "delete";
      targetItemId?: string;
      kind?: UploadKind;
      assetIds?: string[];
      assets?: Array<{
        name: string;
        dataUrl?: string;
        kind?: UploadKind;
        ringNumber?: string;
      }>;
    }>(request);
    return jsonSuccess(await mutateProjectUploads(auth.context.user.id, context.params.projectId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
