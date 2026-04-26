import { NextRequest } from "next/server";

import { clearSessionCookie, jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";
import { logoutSession } from "@/lib/api/mock-store";

export function POST(request: NextRequest) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    const response = auth.response;
    clearSessionCookie(response, "user");
    return response;
  }

  try {
    logoutSession(auth.context.session.token, "user");
    const response = jsonSuccess({
      loggedOut: true
    });
    return clearSessionCookie(response, "user");
  } catch (error) {
    return withServiceError(error);
  }
}
