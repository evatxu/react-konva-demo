import { NextRequest } from "next/server";

import { jsonSuccess } from "@/lib/api/http";
import { getSessionContext, listTemplates } from "@/lib/api/postgres-store";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pigeon_demo_session")?.value;
  let userId: string | undefined;

  if (token) {
    try {
      userId = (await getSessionContext(token, "user")).user.id;
    } catch {
      userId = undefined;
    }
  }

  return jsonSuccess(await listTemplates(userId));
}
