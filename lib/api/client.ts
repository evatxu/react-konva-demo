import type {
  AdminConfig,
  AdminSessionPayload,
  ApiErrorShape,
  EntitlementSnapshot,
  ItemsPayload,
  PaymentOrder,
  ProcessingJob,
  ProjectDetailPayload,
  ProjectExportTicket,
  ProjectSummary,
  TemplateRecord,
  UserSessionPayload,
  ApiUser
} from "@/lib/api/contracts";
import type {
  ApiResponse
} from "@/lib/api/contracts";
import type {
  ExportFormat,
  Order,
  ProductOption,
  Project,
  ProjectFields,
  ProjectItem,
  RecordStatus,
  UploadedAsset,
  UploadKind
} from "@/lib/pigeon-studio";

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiFetch<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiResponse<T> | ApiErrorShape;
  if (!response.ok || !payload.success) {
    const error = "error" in payload ? payload.error : { code: "unknown_error", message: "请求失败" };
    throw new ApiClientError(response.status, error.code, error.message, error.details);
  }
  return payload.data;
}

export const apiClient = {
  auth: {
    login: (payload: { phone?: string; password?: string }) =>
      apiFetch<UserSessionPayload>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    session: () => apiFetch<UserSessionPayload>("/api/auth/session"),
    logout: () =>
      apiFetch<{ loggedOut: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({})
      })
  },
  templates: {
    list: () => apiFetch<Array<TemplateRecord & { locked: boolean }>>("/api/templates")
  },
  products: {
    list: () => apiFetch<ProductOption[]>("/api/products")
  },
  account: {
    entitlements: () => apiFetch<EntitlementSnapshot>("/api/account/entitlements")
  },
  projects: {
    list: () => apiFetch<ProjectSummary[]>("/api/projects"),
    create: (payload: { name?: string; description?: string; templateId?: string; fields?: Partial<ProjectFields> }) =>
      apiFetch<ProjectDetailPayload>("/api/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    detail: (projectId: string) => apiFetch<ProjectDetailPayload>(`/api/projects/${projectId}`),
    update: (
      projectId: string,
      payload: {
        name?: string;
        description?: string;
        fields?: Partial<ProjectFields>;
        activeItemId?: string | null;
      }
    ) =>
      apiFetch<ProjectDetailPayload>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    remove: (projectId: string) =>
      apiFetch<{ deleted: boolean; activeProjectId: string | null }>(`/api/projects/${projectId}`, {
        method: "DELETE"
      }),
    changeTemplate: (projectId: string, templateId: string) =>
      apiFetch<ProjectDetailPayload>(`/api/projects/${projectId}/template`, {
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
      apiFetch<{
        uploadedAssets: UploadedAsset[];
        affectedItems: ProjectItem[];
        project: Project;
        summary: ProjectSummary;
      }>(`/api/projects/${projectId}/uploads`, {
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
      apiFetch<{
        project: Project;
        summary: ProjectSummary;
        importSummary: {
          totalRows: number;
          updatedCount: number;
          createdCount: number;
          ignoredCount: number;
        };
      }>(`/api/projects/${projectId}/excel`, {
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
      return apiFetch<ItemsPayload>(`/api/projects/${projectId}/items${query ? `?${query}` : ""}`);
    },
    updateItem: (
      projectId: string,
      itemId: string,
      payload: Partial<ProjectItem> & {
        applyFieldsToAll?: boolean;
        sharedFields?: Array<"owner" | "region" | "raceRank" | "windSpeed" | "basketCount" | "note">;
      }
    ) =>
      apiFetch<{ item: ProjectItem; summary: ProjectSummary }>(`/api/projects/${projectId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    retryItem: (projectId: string, itemId: string) =>
      apiFetch<{ item: ProjectItem; retryAccepted: boolean }>(`/api/projects/${projectId}/items/${itemId}/retry`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    exportItems: (projectId: string, payload: { itemIds?: string[]; format?: ExportFormat }) =>
      apiFetch<{ ticket: ProjectExportTicket; summary: ProjectSummary; entitlement: EntitlementSnapshot }>(`/api/projects/${projectId}/exports`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    jobs: (projectId: string) => apiFetch<ProcessingJob[]>(`/api/projects/${projectId}/jobs`)
  },
  orders: {
    list: () => apiFetch<PaymentOrder[]>("/api/orders"),
    create: (productId: string) =>
      apiFetch<PaymentOrder>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ productId })
      }),
    detail: (orderId: string) => apiFetch<PaymentOrder>(`/api/orders/${orderId}`),
    pay: (orderId: string) =>
      apiFetch<{ order: PaymentOrder; entitlement: EntitlementSnapshot }>(`/api/orders/${orderId}/pay`, {
        method: "POST",
        body: JSON.stringify({})
      })
  },
  admin: {
    register: (payload: { username?: string; password?: string }) =>
      apiFetch<{ user: ApiUser }>("/api/admin/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    login: (payload: { username?: string; password?: string }) =>
      apiFetch<{ user: ApiUser }>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    session: () => apiFetch<AdminSessionPayload>("/api/admin/auth/session"),
    users: () => apiFetch<Array<ApiUser & { account: unknown; projectCount: number; activeProjectId: string | null; latestProjectUpdatedAt?: string }>>("/api/admin/users"),
    orders: () => apiFetch<PaymentOrder[]>("/api/admin/orders"),
    templates: () => apiFetch<TemplateRecord[]>("/api/admin/templates"),
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
      apiFetch<TemplateRecord>(`/api/admin/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    config: () => apiFetch<AdminConfig>("/api/admin/config"),
    updateConfig: (payload: {
      freeDailyQuota?: number;
      watermarkOnFree?: boolean;
      uploadNamingRules?: string[];
      uploadTips?: string[];
    }) =>
      apiFetch<AdminConfig>("/api/admin/config", {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
  }
};
