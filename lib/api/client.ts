import type {
  ApiErrorShape,
  ApiResponse
} from "@/lib/api/contracts";
import type {
  ExportFormat,
  ProjectFields,
  ProjectItem,
  RecordStatus,
  UploadKind
} from "@/lib/pigeon-studio";

async function apiFetch<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiResponse<T> | ApiErrorShape;
  if (!response.ok || !payload.success) {
    const error = "error" in payload ? payload.error : { code: "unknown_error", message: "请求失败" };
    throw new Error(error.message);
  }
  return payload.data;
}

export const apiClient = {
  auth: {
    login: (payload: { phone?: string; password?: string }) =>
      apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    session: () => apiFetch("/api/auth/session"),
    logout: () =>
      apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({})
      })
  },
  templates: {
    list: () => apiFetch("/api/templates")
  },
  products: {
    list: () => apiFetch("/api/products")
  },
  account: {
    entitlements: () => apiFetch("/api/account/entitlements")
  },
  projects: {
    list: () => apiFetch("/api/projects"),
    create: (payload: { name?: string; description?: string; templateId?: string; fields?: Partial<ProjectFields> }) =>
      apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    detail: (projectId: string) => apiFetch(`/api/projects/${projectId}`),
    update: (
      projectId: string,
      payload: {
        name?: string;
        description?: string;
        fields?: Partial<ProjectFields>;
        activeItemId?: string | null;
      }
    ) =>
      apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    remove: (projectId: string) =>
      apiFetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      }),
    changeTemplate: (projectId: string, templateId: string) =>
      apiFetch(`/api/projects/${projectId}/template`, {
        method: "POST",
        body: JSON.stringify({ templateId })
      }),
    uploadAssets: (
      projectId: string,
      payload: {
        action?: "append" | "replace" | "supplement" | "delete";
        targetItemId?: string;
        kind?: UploadKind;
        assetIds?: string[];
        assets?: Array<{
          name: string;
          dataUrl?: string;
          kind?: UploadKind;
          ringNumber?: string;
        }>;
      }
    ) =>
      apiFetch(`/api/projects/${projectId}/uploads`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    importExcel: (
      projectId: string,
      payload: {
        fileName?: string;
        rows: Array<{
          ringNumber?: string;
          gender?: string;
          owner?: string;
          region?: string;
          raceRank?: string;
          windSpeed?: string;
          basketCount?: string;
          note?: string;
        }>;
      }
    ) =>
      apiFetch(`/api/projects/${projectId}/excel`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    listItems: (projectId: string, filters?: { status?: RecordStatus; keyword?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) {
        params.set("status", filters.status);
      }
      if (filters?.keyword) {
        params.set("keyword", filters.keyword);
      }
      const query = params.toString();
      return apiFetch(`/api/projects/${projectId}/items${query ? `?${query}` : ""}`);
    },
    updateItem: (
      projectId: string,
      itemId: string,
      payload: Partial<ProjectItem> & {
        applyFieldsToAll?: boolean;
        sharedFields?: Array<"owner" | "region" | "raceRank" | "windSpeed" | "basketCount" | "note">;
      }
    ) =>
      apiFetch(`/api/projects/${projectId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    retryItem: (projectId: string, itemId: string) =>
      apiFetch(`/api/projects/${projectId}/items/${itemId}/retry`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    exportItems: (projectId: string, payload: { itemIds?: string[]; format?: ExportFormat }) =>
      apiFetch(`/api/projects/${projectId}/exports`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    jobs: (projectId: string) => apiFetch(`/api/projects/${projectId}/jobs`)
  },
  orders: {
    list: () => apiFetch("/api/orders"),
    create: (productId: string) =>
      apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({ productId })
      }),
    detail: (orderId: string) => apiFetch(`/api/orders/${orderId}`),
    pay: (orderId: string) =>
      apiFetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        body: JSON.stringify({})
      })
  },
  admin: {
    register: (payload: { username?: string; password?: string }) =>
      apiFetch("/api/admin/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    login: (payload: { username?: string; password?: string }) =>
      apiFetch("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    users: () => apiFetch("/api/admin/users"),
    orders: () => apiFetch("/api/admin/orders"),
    templates: () => apiFetch("/api/admin/templates"),
    updateTemplate: (
      templateId: string,
      payload: {
        name?: string;
        description?: string;
        tier?: "free" | "paid";
        accent?: string;
        enabled?: boolean;
        sortOrder?: number;
      }
    ) =>
      apiFetch(`/api/admin/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    config: () => apiFetch("/api/admin/config"),
    updateConfig: (payload: {
      freeDailyQuota?: number;
      watermarkOnFree?: boolean;
      uploadNamingRules?: string[];
      uploadTips?: string[];
    }) =>
      apiFetch("/api/admin/config", {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
  }
};
