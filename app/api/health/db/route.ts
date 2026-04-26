import { jsonSuccess, withServiceError } from "@/lib/api/http";
import { checkDatabaseConnection } from "@/lib/db/postgres";

export const runtime = "nodejs";

export async function GET() {
  try {
    return jsonSuccess(await checkDatabaseConnection());
  } catch (error) {
    return withServiceError(error);
  }
}
