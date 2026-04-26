import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { mutateProjectUploads } from "@/lib/api/mock-store";
import type { UploadKind } from "@/lib/pigeon-studio";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
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
    return jsonSuccess(mutateProjectUploads(auth.context.user.id, context.params.projectId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
