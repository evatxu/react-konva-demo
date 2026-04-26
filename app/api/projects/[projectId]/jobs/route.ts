import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listProjectJobs } from "@/lib/api/mock-store";

export function GET(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(listProjectJobs(auth.context.user.id, context.params.projectId));
  } catch (error) {
    return withServiceError(error);
  }
}
