import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { updateAdminTemplate } from "@/lib/api/mock-store";

export async function PATCH(request: NextRequest, context: { params: { templateId: string } }) {
  const auth = requireSession(request, "admin");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      tier?: "free" | "paid";
      accent?: string;
      enabled?: boolean;
      sortOrder?: number;
    }>(request);
    return jsonSuccess(updateAdminTemplate(context.params.templateId, body));
  } catch (error) {
    return withServiceError(error);
  }
}
