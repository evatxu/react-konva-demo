import { NextRequest } from "next/server";

import { clearSessionCookie, jsonSuccess, requireSession, withServiceError } from "@/lib/api/http";

export async function POST(request: NextRequest) {
  const auth = await requireSession(request, "user");
  if (!auth.ok) {
    const response = auth.response;
    clearSessionCookie(response, "user");
    return response;
  }

  try {
    const response = jsonSuccess({
      loggedOut: true
    });
    return clearSessionCookie(response, "user");
  } catch (error) {
    return withServiceError(error);
  }
}
