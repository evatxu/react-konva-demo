import { NextRequest } from "next/server";

import { jsonSuccess, parseJsonBody, requireSession, withServiceError } from "@/lib/api/http";
import { createProject, listProjects } from "@/lib/api/mock-store";
import type { ProjectFields } from "@/lib/pigeon-studio";

export function GET(request: NextRequest) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(listProjects(auth.context.user.id));
  } catch (error) {
    return withServiceError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireSession(request, "user");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      templateId?: string;
      fields?: Partial<ProjectFields>;
    }>(request);
    return jsonSuccess(createProject(auth.context.user.id, body), {
      status: 201
    });
  } catch (error) {
    return withServiceError(error);
  }
}
