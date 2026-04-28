import { jsonSuccess, withServiceError } from "@/lib/api/http";
import { listProducts } from "@/lib/api/postgres-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return jsonSuccess(await listProducts());
  } catch (error) {
    return withServiceError(error);
  }
}
