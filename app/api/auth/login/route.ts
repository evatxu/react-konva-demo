import { NextResponse } from "next/server";

import { jsonSuccess, parseJsonBody, setSessionCookie, withServiceError } from "@/lib/api/http";
import { loginUser } from "@/lib/api/postgres-store";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      phone?: string;
      username?: string;
      password?: string;
    }>(request);
    const result = await loginUser(body.phone ?? body.username);
    const response = jsonSuccess(result.payload);
    return setSessionCookie(response, "user", result.token);
  } catch (error) {
    return withServiceError(error);
  }
}
