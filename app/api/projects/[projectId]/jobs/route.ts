import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listProjectJobs } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await listProjectJobs(auth.context.user.id, context.params.projectId));
  } catch (error) {
    return withServiceError(error);
  }
}
