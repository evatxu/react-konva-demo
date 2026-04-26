import { jsonSuccess, parseJsonBody, setSessionCookie, withServiceError } from "@/lib/api/http";
import { loginAdmin } from "@/lib/api/mock-store";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      username?: string;
      password?: string;
    }>(request);
    const result = loginAdmin(body.username);
    const response = jsonSuccess({
      user: result.user
    });
    return setSessionCookie(response, "admin", result.token);
  } catch (error) {
    return withServiceError(error);
  }
}
