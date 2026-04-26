import { NextRequest } from "next/server";

import { jsonSuccess } from "@/lib/api/http";
import { getSessionContext, listTemplates } from "@/lib/api/mock-store";

export function GET(request: NextRequest) {
  const token = request.cookies.get("pigeon_demo_session")?.value;
  let userId: string | undefined;

  if (token) {
    try {
      userId = getSessionContext(token, "user").user.id;
    } catch {
      userId = undefined;
    }
  }

  return jsonSuccess(listTemplates(userId));
}
