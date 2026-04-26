import { NextRequest } from "next/server";

import { jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { listAdminTemplates } from "@/lib/api/mock-store";

export function GET(request: NextRequest) {
  const auth = requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(listAdminTemplates());
  } catch (error) {
    return withServiceError(error);
  }
}
