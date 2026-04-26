import type {
  AccountState,
  ExportFormat,
  Order,
  PosterTemplate,
  ProductOption,
  Project,
  ProjectItem
} from "@/lib/pigeon-studio";

export type SessionRole = "user" | "admin";
export type ProcessingJobType =
  | "eye-cutout"
  | "body-cutout"
  | "eye-direction"
  | "body-direction"
  | "excel-import"
  | "export";
export type ProcessingJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorShape {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiUser {
  id: string;
  role: SessionRole;
  name: string;
  phone?: string;
  username?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface ApiSession {
  token: string;
  role: SessionRole;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface TemplateRecord extends PosterTemplate {
  enabled: boolean;
  sortOrder: number;
}

export interface PaymentOrder extends Order {
  userId: string;
  qrCodeUrl: string;
  productKind: ProductOption["kind"];
  credits?: number;
  days?: number;
}

export interface ProcessingJob {
  id: string;
  projectId: string;
  itemId?: string;
  type: ProcessingJobType;
  status: ProcessingJobStatus;
  attemptCount: number;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  activeItemId: string | null;
  itemCount: number;
  successCount: number;
  processingCount: number;
  failedCount: number;
  assetCount: number;
}

export interface ProjectExportTicket {
  id: string;
  projectId: string;
  itemIds: string[];
  format: ExportFormat;
  watermarked: boolean;
  downloadUrl: string;
  createdAt: string;
}

export interface AdminConfig {
  freeDailyQuota: number;
  watermarkOnFree: boolean;
  uploadNamingRules: string[];
  uploadTips: string[];
}

export interface UserWorkspace {
  userId: string;
  account: AccountState;
  projects: Project[];
  activeProjectId: string | null;
}

export interface MockDatabase {
  users: ApiUser[];
  sessions: ApiSession[];
  workspaces: Record<string, UserWorkspace>;
  templates: TemplateRecord[];
  products: ProductOption[];
  orders: PaymentOrder[];
  processingJobs: ProcessingJob[];
  exportTickets: ProjectExportTicket[];
  adminConfig: AdminConfig;
}

export interface SessionContext {
  session: ApiSession;
  user: ApiUser;
}

export interface EntitlementSnapshot {
  account: AccountState;
  availableExportCount: number;
  freeQuota: number;
  nextResetAt: string;
  unlockedTemplateIds: string[];
  watermarked: boolean;
}

export interface UserSessionPayload {
  user: ApiUser;
  account: AccountState;
  activeProjectId: string | null;
  projectCount: number;
}

export interface ProjectDetailPayload {
  project: Project;
  summary: ProjectSummary;
}

export interface ItemsPayload {
  items: ProjectItem[];
  total: number;
}

export class ApiServiceError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
