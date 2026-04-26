import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { changeProjectTemplate } from "@/lib/api/mock-store";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      templateId: string;
    }>(request);
    return jsonSuccess(changeProjectTemplate(auth.context.user.id, context.params.projectId, body.templateId));
  } catch (error) {
    return withServiceError(error);
  }
}
