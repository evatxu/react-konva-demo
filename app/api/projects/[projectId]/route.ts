import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { deleteProject, getProjectDetail, updateProject } from "@/lib/api/mock-store";

export function GET(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(getProjectDetail(auth.context.user.id, context.params.projectId));
  } catch (error) {
    return withServiceError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      fields?: Record<string, string>;
      activeItemId?: string | null;
    }>(request);
    return jsonSuccess(updateProject(auth.context.user.id, context.params.projectId, body));
  } catch (error) {
    return withServiceError(error);
  }
}

export function DELETE(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(deleteProject(auth.context.user.id, context.params.projectId));
  } catch (error) {
    return withServiceError(error);
  }
}
