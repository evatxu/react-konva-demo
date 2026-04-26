import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { importProjectExcel } from "@/lib/api/mock-store";

export async function POST(request: NextRequest, context: { params: { projectId: string } }) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      fileName?: string;
      rows: Array<{
        ringNumber?: string;
        gender?: string;
        owner?: string;
        region?: string;
        raceRank?: string;
        windSpeed?: string;
        basketCount?: string;
        note?: string;
      }>;
    }>(request);
    return jsonSuccess(importProjectExcel(auth.context.user.id, context.params.projectId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
