import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { updateProjectItem } from "@/lib/api/mock-store";
import type { ProjectItem } from "@/lib/pigeon-studio";

export async function PATCH(
  request: NextRequest,
  context: { params: { projectId: string; itemId: string } }
) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<
      Partial<ProjectItem> & {
        applyFieldsToAll?: boolean;
        sharedFields?: Array<"owner" | "region" | "raceRank" | "windSpeed" | "basketCount" | "note">;
      }
    >(request);
    return jsonSuccess(updateProjectItem(auth.context.user.id, context.params.projectId, context.params.itemId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
