import {
  PRODUCT_OPTIONS,
  TEMPLATE_OPTIONS,
  buildExportSignature,
  buildRecordStatus,
  createEmptyProjectFields,
  createId,
  createInitialWorkspace,
  getBusinessWindowKey,
  getNextResetAt,
  getRecordDefaults,
  normalizeProject,
  syncAccountByBusinessWindow,
  type AccountPlan,
  type AccountState,
  type ExportFormat,
  type PosterTemplate,
  type ProductOption,
  type Project,
  type ProjectFields,
  type ProjectItem,
  type RecordStatus,
  type UploadKind,
  type UploadedAsset
} from "@/lib/pigeon-studio";

import {
  ApiServiceError,
  type AdminConfig,
  type ApiSession,
  type ApiUser,
  type EntitlementSnapshot,
  type MockDatabase,
  type PaymentOrder,
  type ProcessingJob,
  type ProcessingJobType,
  type ProjectDetailPayload,
  type ProjectExportTicket,
  type ProjectSummary,
  type SessionContext,
  type SessionRole,
  type TemplateRecord,
  type UserSessionPayload,
  type UserWorkspace
} from "@/lib/api/contracts";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

declare global {
  // eslint-disable-next-line no-var
  var __PIGEON_MOCK_DB__: MockDatabase | undefined;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function inferUploadKind(name: string): UploadKind {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".zip")) {
    return "archive";
  }
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
    return "sheet";
  }
  if (lowerName.includes("eye") || lowerName.includes("鸽眼")) {
    return "eye";
  }
  if (lowerName.includes("body") || lowerName.includes("外形")) {
    return "body";
  }
  return "unknown";
}

function inferRingNumber(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension
    .replace(/(eye|body|鸽眼|外形|left|right|左|右)/gi, " ")
    .replace(/[_\-.]+/g, " ")
    .trim();
  const match = cleaned.match(/[a-z0-9]{2,}(?:\s+[a-z0-9]{2,})*/i);
  return match ? match[0].replace(/\s+/g, "-").toUpperCase() : "";
}

function inferDirection(name: string, fallback: "左" | "右" | "居中") {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("left") || lowerName.includes("左")) {
    return "左";
  }
  if (lowerName.includes("right") || lowerName.includes("右")) {
    return "右";
  }
  return fallback;
}

function getFailureReason(item: Pick<ProjectItem, "eyeImageSrc" | "bodyImageSrc">) {
  if (!item.eyeImageSrc && !item.bodyImageSrc) {
    return "缺少鸽眼图和外形图。";
  }
  if (!item.eyeImageSrc) {
    return "缺少鸽眼图。";
  }
  if (!item.bodyImageSrc) {
    return "缺少外形图。";
  }
  return undefined;
}

function buildAssetNote(kind: UploadKind) {
  switch (kind) {
    case "eye":
      return "已识别为鸽眼图";
    case "body":
      return "已识别为外形图";
    case "sheet":
      return "已识别为 Excel 数据源";
    case "archive":
      return "压缩包已登记，等待解析";
    default:
      return "文件已上传，等待人工确认分类";
  }
}

function buildSummary(project: Project): ProjectSummary {
  const successCount = project.items.filter((item) => item.status === "success").length;
  const processingCount = project.items.filter((item) => item.status === "processing").length;
  const failedCount = project.items.filter((item) => item.status === "failed").length;
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    templateId: project.templateId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeItemId: project.activeItemId,
    itemCount: project.items.length,
    successCount,
    processingCount,
    failedCount,
    assetCount: project.uploadedAssets.length
  };
}

function getStoreTemplate(templateId: string) {
  const template = getDb().templates.find((item) => item.id === templateId && item.enabled);
  if (!template) {
    throw new ApiServiceError(404, "template_not_found", "模板不存在或已停用。");
  }
  return template;
}

function makeRecordFromRingNumber(ringNumber: string, partial?: Partial<ProjectItem>): ProjectItem {
  const defaults = getRecordDefaults(ringNumber);
  const nextItem: ProjectItem = {
    id: createId("item"),
    ringNumber,
    eyeDirectionAuto: partial?.eyeDirectionAuto ?? "左",
    eyeDirectionFinal: partial?.eyeDirectionFinal ?? partial?.eyeDirectionAuto ?? "左",
    bodyDirectionAuto: partial?.bodyDirectionAuto ?? "右",
    bodyDirectionFinal: partial?.bodyDirectionFinal ?? partial?.bodyDirectionAuto ?? "右",
    eyeImageSrc: partial?.eyeImageSrc,
    bodyImageSrc: partial?.bodyImageSrc,
    gender: partial?.gender ?? defaults.gender,
    owner: partial?.owner ?? defaults.owner,
    region: partial?.region ?? defaults.region,
    raceRank: partial?.raceRank ?? defaults.raceRank,
    windSpeed: partial?.windSpeed ?? defaults.windSpeed,
    basketCount: partial?.basketCount ?? defaults.basketCount,
    note: partial?.note ?? defaults.note,
    status: partial?.status ?? buildRecordStatus(partial ?? {}),
    failureReason: partial?.failureReason,
    exportStatus: partial?.exportStatus ?? "idle",
    lastExportedAt: partial?.lastExportedAt,
    exportedSignatures: partial?.exportedSignatures ?? []
  };

  const status = buildRecordStatus(nextItem);
  return {
    ...nextItem,
    status,
    failureReason: status === "success" ? undefined : getFailureReason(nextItem)
  };
}

function mergeItem(existing: ProjectItem, incoming: Partial<ProjectItem>): ProjectItem {
  const merged: ProjectItem = {
    ...existing,
    ...incoming,
    eyeDirectionAuto: incoming.eyeDirectionAuto ?? existing.eyeDirectionAuto,
    bodyDirectionAuto: incoming.bodyDirectionAuto ?? existing.bodyDirectionAuto,
    eyeDirectionFinal: incoming.eyeDirectionFinal ?? existing.eyeDirectionFinal,
    bodyDirectionFinal: incoming.bodyDirectionFinal ?? existing.bodyDirectionFinal,
    exportedSignatures: incoming.exportedSignatures ?? existing.exportedSignatures
  };
  const status = buildRecordStatus(merged);
  return {
    ...merged,
    status,
    failureReason: status === "success" ? undefined : getFailureReason(merged)
  };
}

function upsertProcessingJob(payload: {
  projectId: string;
  itemId?: string;
  type: ProcessingJobType;
  status: ProcessingJob["status"];
  failureReason?: string;
}) {
  const db = getDb();
  const createdAt = nowIso();
  db.processingJobs.unshift({
    id: createId("job"),
    projectId: payload.projectId,
    itemId: payload.itemId,
    type: payload.type,
    status: payload.status,
    attemptCount: 1,
    failureReason: payload.failureReason,
    createdAt,
    updatedAt: createdAt
  });
}

function syncAccountState(account: AccountState, now = new Date()) {
  const synced = syncAccountByBusinessWindow(account, now);
  const monthlyActive = Boolean(synced.monthlyExpiresAt && new Date(synced.monthlyExpiresAt).getTime() > now.getTime());
  if (monthlyActive) {
    return {
      ...synced,
      plan: "monthly" as const
    };
  }
  if (synced.packCredits > 0) {
    return {
      ...synced,
      plan: "pack" as const
    };
  }
  return {
    ...synced,
    plan: "free" as const
  };
}

function getEffectivePlan(account: AccountState, now = new Date()): AccountPlan {
  return syncAccountState(account, now).plan;
}

function getAvailableExportCount(account: AccountState, freeDailyQuota: number, now = new Date()) {
  const synced = syncAccountState(account, now);
  if (synced.plan === "monthly") {
    return Number.POSITIVE_INFINITY;
  }
  if (synced.plan === "pack") {
    return Math.max(0, synced.packCredits);
  }
  return Math.max(0, freeDailyQuota - synced.freeUsed);
}

function buildEntitlementSnapshot(workspace: UserWorkspace): EntitlementSnapshot {
  const db = getDb();
  const syncedAccount = syncAccountState(workspace.account);
  workspace.account = syncedAccount;
  return {
    account: deepClone(syncedAccount),
    availableExportCount: getAvailableExportCount(syncedAccount, db.adminConfig.freeDailyQuota),
    freeQuota: db.adminConfig.freeDailyQuota,
    nextResetAt: getNextResetAt().toISOString(),
    unlockedTemplateIds: db.templates
      .filter((template) => template.enabled)
      .filter((template) => template.tier === "free" || syncedAccount.plan !== "free")
      .map((template) => template.id),
    watermarked: db.adminConfig.watermarkOnFree && syncedAccount.plan === "free"
  };
}

function assertTemplateAccess(account: AccountState, template: PosterTemplate) {
  const plan = getEffectivePlan(account);
  if (template.tier === "paid" && plan === "free") {
    throw new ApiServiceError(403, "template_locked", "当前账号未开通付费模板权限。", {
      templateId: template.id
    });
  }
}

function getWorkspaceOrThrow(userId: string) {
  const workspace = getDb().workspaces[userId];
  if (!workspace) {
    throw new ApiServiceError(404, "workspace_not_found", "未找到用户工作区。");
  }
  workspace.account = syncAccountState(workspace.account);
  return workspace;
}

function getProjectOrThrow(workspace: UserWorkspace, projectId: string) {
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new ApiServiceError(404, "project_not_found", "项目不存在。");
  }
  return project;
}

function touchProject(project: Project) {
  project.updatedAt = nowIso();
  return normalizeProject(project);
}

function seedDatabase(): MockDatabase {
  const createdAt = nowIso();
  const workspace = createInitialWorkspace();
  const userId = "user-demo";
  const adminId = "admin-demo";

  return {
    users: [
      {
        id: userId,
        role: "user",
        name: "演示用户",
        phone: "13800138000",
        createdAt
      },
      {
        id: adminId,
        role: "admin",
        name: "系统管理员",
        username: "admin",
        createdAt
      }
    ],
    sessions: [],
    workspaces: {
      [userId]: {
        userId,
        account: workspace.account,
        projects: workspace.projects,
        activeProjectId: workspace.activeProjectId
      }
    },
    templates: TEMPLATE_OPTIONS.map((template, index) => ({
      ...template,
      enabled: true,
      sortOrder: index + 1
    })),
    products: deepClone(PRODUCT_OPTIONS),
    orders: [],
    processingJobs: [],
    exportTickets: [],
    adminConfig: {
      freeDailyQuota: 3,
      watermarkOnFree: true,
      uploadNamingRules: [
        "推荐命名：足环号_eye.jpg / 足环号_body.jpg / records.xlsx",
        "压缩包内建议以足环号分组，避免同名覆盖"
      ],
      uploadTips: [
        "支持图片、ZIP、Excel 三类文件统一上传",
        "上传后系统会自动识别鸽眼图/外形图并按足环号归组",
        "同名素材可走 replace 模式覆盖原素材"
      ]
    }
  };
}

export function getDb() {
  if (!globalThis.__PIGEON_MOCK_DB__) {
    globalThis.__PIGEON_MOCK_DB__ = seedDatabase();
  }
  return globalThis.__PIGEON_MOCK_DB__;
}

export function loginUser(phone?: string) {
  const db = getDb();
  const normalizedPhone = phone?.trim() || "13800138000";
  let user = db.users.find((item) => item.role === "user" && item.phone === normalizedPhone);

  if (!user) {
    user = {
      id: createId("user"),
      role: "user",
      name: `用户${normalizedPhone.slice(-4)}`,
      phone: normalizedPhone,
      createdAt: nowIso()
    };
    db.users.push(user);

    const nextUser = user;
    const workspace = createInitialWorkspace();
    const projectIdMap = new Map<string, string>();
    const mappedProjects = workspace.projects.map((project, index) => {
      const nextProjectId = createId("project");
      projectIdMap.set(project.id, nextProjectId);
      return {
        ...project,
        id: nextProjectId,
        name: index === 0 ? `${nextUser.name} 的项目` : project.name
      };
    });
    db.workspaces[nextUser.id] = {
      userId: nextUser.id,
      account: workspace.account,
      projects: mappedProjects,
      activeProjectId: workspace.activeProjectId ? projectIdMap.get(workspace.activeProjectId) ?? null : null
    };
  }

  user.lastLoginAt = nowIso();
  const session: ApiSession = {
    token: createId("session"),
    role: "user",
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  db.sessions = db.sessions.filter((item) => !(item.role === "user" && item.userId === user.id));
  db.sessions.push(session);

  return {
    token: session.token,
    payload: buildUserSessionPayload(user.id)
  };
}

export function loginAdmin(username?: string) {
  const db = getDb();
  const admin = db.users.find((item) => item.role === "admin" && item.username === (username?.trim() || "admin"));
  if (!admin) {
    throw new ApiServiceError(401, "admin_login_failed", "管理员账号不存在。");
  }

  admin.lastLoginAt = nowIso();
  const session: ApiSession = {
    token: createId("session"),
    role: "admin",
    userId: admin.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  db.sessions = db.sessions.filter((item) => !(item.role === "admin" && item.userId === admin.id));
  db.sessions.push(session);

  return {
    token: session.token,
    user: deepClone(admin)
  };
}

export function logoutSession(token: string, role: SessionRole) {
  const db = getDb();
  db.sessions = db.sessions.filter((item) => !(item.token === token && item.role === role));
}

export function getSessionContext(token: string, role: SessionRole): SessionContext {
  const db = getDb();
  console.log("🚀 ~ getSessionContext ~ db:", db)
  const session = db.sessions.find((item) => item.token === token && item.role === role);
  if (!session) {
    throw new ApiServiceError(401, "unauthorized", "登录态已失效，请重新登录。");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    logoutSession(token, role);
    throw new ApiServiceError(401, "session_expired", "登录态已过期，请重新登录。");
  }
  const user = db.users.find((item) => item.id === session.userId && item.role === role);
  if (!user) {
    throw new ApiServiceError(401, "user_not_found", "当前会话对应用户不存在。");
  }
  return {
    session: deepClone(session),
    user: deepClone(user)
  };
}

export function buildUserSessionPayload(userId: string): UserSessionPayload {
  const db = getDb();
  const user = db.users.find((item) => item.id === userId && item.role === "user");
  if (!user) {
    throw new ApiServiceError(404, "user_not_found", "用户不存在。");
  }
  const workspace = getWorkspaceOrThrow(userId);
  return {
    user: deepClone(user),
    account: deepClone(workspace.account),
    activeProjectId: workspace.activeProjectId,
    projectCount: workspace.projects.length
  };
}

export function listTemplates(userId?: string) {
  const db = getDb();
  const workspace = userId ? getWorkspaceOrThrow(userId) : null;
  const plan = workspace ? getEffectivePlan(workspace.account) : "free";
  return db.templates
    .filter((template) => template.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((template) => ({
      ...deepClone(template),
      locked: template.tier === "paid" && plan === "free"
    }));
}

export function listProducts() {
  return deepClone(getDb().products);
}

export function listProjects(userId: string) {
  const workspace = getWorkspaceOrThrow(userId);
  return workspace.projects
    .map((project) => buildSummary(project))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createProject(
  userId: string,
  payload: Partial<{
    name: string;
    description: string;
    templateId: string;
    fields: Partial<ProjectFields>;
  }>
) {
  const workspace = getWorkspaceOrThrow(userId);
  const template = getStoreTemplate(payload.templateId ?? getDb().templates[0].id);
  assertTemplateAccess(workspace.account, template);

  const createdAt = nowIso();
  const fields = {
    ...createEmptyProjectFields(),
    ...payload.fields
  };

  const project: Project = normalizeProject({
    id: createId("project"),
    name: payload.name?.trim() || "新建项目",
    description: payload.description?.trim() || "",
    templateId: template.id,
    fields,
    uploadedAssets: [],
    items: [],
    activeItemId: null,
    createdAt,
    updatedAt: createdAt
  });

  workspace.projects.unshift(project);
  workspace.activeProjectId = project.id;
  return {
    project: deepClone(project),
    summary: buildSummary(project)
  };
}

export function getProjectDetail(userId: string, projectId: string): ProjectDetailPayload {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  return {
    project: deepClone(project),
    summary: buildSummary(project)
  };
}

export function updateProject(
  userId: string,
  projectId: string,
  payload: Partial<{
    name: string;
    description: string;
    fields: Partial<ProjectFields>;
    activeItemId: string | null;
  }>
) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);

  if (typeof payload.name === "string") {
    project.name = payload.name.trim() || project.name;
  }
  if (typeof payload.description === "string") {
    project.description = payload.description.trim();
  }
  if (payload.fields) {
    project.fields = {
      ...project.fields,
      ...payload.fields
    };
  }
  if ("activeItemId" in payload) {
    project.activeItemId = payload.activeItemId ?? null;
    workspace.activeProjectId = project.id;
  }

  touchProject(project);
  return {
    project: deepClone(project),
    summary: buildSummary(project)
  };
}

export function changeProjectTemplate(userId: string, projectId: string, templateId: string) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  const template = getStoreTemplate(templateId);
  assertTemplateAccess(workspace.account, template);
  project.templateId = template.id;
  touchProject(project);
  return {
    project: deepClone(project),
    summary: buildSummary(project)
  };
}

export function deleteProject(userId: string, projectId: string) {
  const workspace = getWorkspaceOrThrow(userId);
  const beforeCount = workspace.projects.length;
  workspace.projects = workspace.projects.filter((project) => project.id !== projectId);
  if (workspace.projects.length === beforeCount) {
    throw new ApiServiceError(404, "project_not_found", "项目不存在。");
  }
  if (workspace.activeProjectId === projectId) {
    workspace.activeProjectId = workspace.projects[0]?.id ?? null;
  }
  getDb().processingJobs = getDb().processingJobs.filter((job) => job.projectId !== projectId);
  getDb().exportTickets = getDb().exportTickets.filter((ticket) => ticket.projectId !== projectId);
  return {
    deleted: true,
    activeProjectId: workspace.activeProjectId
  };
}

function applyAssetToItem(project: Project, asset: {
  name: string;
  dataUrl?: string;
  kind?: UploadKind;
  ringNumber?: string;
}) {
  const kind = asset.kind ?? inferUploadKind(asset.name);
  const ringNumber = asset.ringNumber?.trim() || inferRingNumber(asset.name) || `UNMATCHED-${project.items.length + 1}`;
  const defaultDirection = kind === "body" ? "右" : "左";
  const current = project.items.find((item) => item.ringNumber === ringNumber);
  const partial: Partial<ProjectItem> = {
    eyeImageSrc: kind === "eye" ? asset.dataUrl ?? current?.eyeImageSrc : current?.eyeImageSrc,
    bodyImageSrc: kind === "body" ? asset.dataUrl ?? current?.bodyImageSrc : current?.bodyImageSrc,
    eyeDirectionAuto: kind === "eye" ? inferDirection(asset.name, defaultDirection) : current?.eyeDirectionAuto,
    eyeDirectionFinal: kind === "eye" ? inferDirection(asset.name, defaultDirection) : current?.eyeDirectionFinal,
    bodyDirectionAuto: kind === "body" ? inferDirection(asset.name, defaultDirection) : current?.bodyDirectionAuto,
    bodyDirectionFinal: kind === "body" ? inferDirection(asset.name, defaultDirection) : current?.bodyDirectionFinal
  };

  if (current) {
    Object.assign(current, mergeItem(current, partial));
    return current;
  }

  const item = makeRecordFromRingNumber(ringNumber, partial);
  project.items.push(item);
  if (!project.activeItemId) {
    project.activeItemId = item.id;
  }
  return item;
}

export function mutateProjectUploads(
  userId: string,
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
) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  const action = payload.action ?? "append";

  if (action === "delete") {
    const assetIds = new Set(payload.assetIds ?? []);
    if (assetIds.size === 0 && !payload.targetItemId) {
      throw new ApiServiceError(400, "missing_delete_target", "删除素材时至少提供 assetIds 或 targetItemId。");
    }

    project.uploadedAssets = project.uploadedAssets.filter((asset) => !assetIds.has(asset.id));
    if (payload.targetItemId && payload.kind) {
      const item = project.items.find((entry) => entry.id === payload.targetItemId);
      if (!item) {
        throw new ApiServiceError(404, "item_not_found", "目标记录不存在。");
      }
      if (payload.kind === "eye") {
        item.eyeImageSrc = undefined;
      }
      if (payload.kind === "body") {
        item.bodyImageSrc = undefined;
      }
      Object.assign(item, mergeItem(item, {}));
    }
    touchProject(project);
    return {
      project: deepClone(project),
      summary: buildSummary(project)
    };
  }

  if (!payload.assets?.length) {
    throw new ApiServiceError(400, "missing_assets", "请提供待上传素材。");
  }

  const affectedItems: ProjectItem[] = [];
  payload.assets.forEach((incoming) => {
    const kind = incoming.kind ?? inferUploadKind(incoming.name);
    const assetRecord: UploadedAsset = {
      id: createId("asset"),
      name: incoming.name,
      kind,
      status: "success",
      note: buildAssetNote(kind)
    };
    project.uploadedAssets.unshift(assetRecord);

    let item: ProjectItem | undefined;
    if (payload.targetItemId && (action === "replace" || action === "supplement")) {
      item = project.items.find((entry) => entry.id === payload.targetItemId);
      if (!item) {
        throw new ApiServiceError(404, "item_not_found", "目标记录不存在。");
      }
      const update = kind === "eye"
        ? {
          eyeImageSrc: incoming.dataUrl,
          eyeDirectionAuto: inferDirection(incoming.name, "左"),
          eyeDirectionFinal: inferDirection(incoming.name, "左")
        }
        : kind === "body"
          ? {
            bodyImageSrc: incoming.dataUrl,
            bodyDirectionAuto: inferDirection(incoming.name, "右"),
            bodyDirectionFinal: inferDirection(incoming.name, "右")
          }
          : {};
      Object.assign(item, mergeItem(item, update));
    } else if (kind === "eye" || kind === "body") {
      item = applyAssetToItem(project, incoming);
    }

    if (item) {
      affectedItems.push(item);
      if (kind === "eye") {
        upsertProcessingJob({
          projectId: project.id,
          itemId: item.id,
          type: "eye-cutout",
          status: item.eyeImageSrc ? "succeeded" : "failed",
          failureReason: item.eyeImageSrc ? undefined : "缺少鸽眼图"
        });
        upsertProcessingJob({
          projectId: project.id,
          itemId: item.id,
          type: "eye-direction",
          status: item.eyeImageSrc ? "succeeded" : "failed",
          failureReason: item.eyeImageSrc ? undefined : "缺少鸽眼图"
        });
      }
      if (kind === "body") {
        upsertProcessingJob({
          projectId: project.id,
          itemId: item.id,
          type: "body-cutout",
          status: item.bodyImageSrc ? "succeeded" : "failed",
          failureReason: item.bodyImageSrc ? undefined : "缺少外形图"
        });
        upsertProcessingJob({
          projectId: project.id,
          itemId: item.id,
          type: "body-direction",
          status: item.bodyImageSrc ? "succeeded" : "failed",
          failureReason: item.bodyImageSrc ? undefined : "缺少外形图"
        });
      }
    }
  });

  touchProject(project);
  return {
    uploadedAssets: deepClone(project.uploadedAssets.slice(0, payload.assets.length)),
    affectedItems: deepClone(affectedItems),
    project: deepClone(project),
    summary: buildSummary(project)
  };
}

export function importProjectExcel(
  userId: string,
  projectId: string,
  payload: {
    fileName?: string;
    rows: Array<
      Partial<{
        ringNumber: string;
        gender: string;
        owner: string;
        region: string;
        raceRank: string;
        windSpeed: string;
        basketCount: string;
        note: string;
      }>
    >;
  }
) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  if (!payload.rows.length) {
    throw new ApiServiceError(400, "missing_excel_rows", "Excel 导入数据不能为空。");
  }

  let updatedCount = 0;
  let createdCount = 0;

  payload.rows.forEach((row) => {
    const ringNumber = row.ringNumber?.trim();
    if (!ringNumber) {
      return;
    }

    const existing = project.items.find((item) => item.ringNumber === ringNumber);
    const patch: Partial<ProjectItem> = {
      gender: row.gender,
      owner: row.owner,
      region: row.region,
      raceRank: row.raceRank,
      windSpeed: row.windSpeed,
      basketCount: row.basketCount,
      note: row.note
    };

    if (existing) {
      Object.assign(existing, mergeItem(existing, patch));
      updatedCount += 1;
      return;
    }

    project.items.push(makeRecordFromRingNumber(ringNumber, patch));
    createdCount += 1;
  });

  project.uploadedAssets.unshift({
    id: createId("asset"),
    name: payload.fileName?.trim() || "records.xlsx",
    kind: "sheet",
    status: "success",
    note: "已回填 Excel 字段数据"
  });

  upsertProcessingJob({
    projectId: project.id,
    type: "excel-import",
    status: "succeeded"
  });

  touchProject(project);
  return {
    project: deepClone(project),
    summary: buildSummary(project),
    importSummary: {
      totalRows: payload.rows.length,
      updatedCount,
      createdCount,
      ignoredCount: payload.rows.length - updatedCount - createdCount
    }
  };
}

export function listProjectItems(
  userId: string,
  projectId: string,
  filters?: Partial<{
    status: RecordStatus;
    keyword: string;
  }>
) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  let items = [...project.items];

  if (filters?.status) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters?.keyword?.trim()) {
    const keyword = filters.keyword.trim().toLowerCase();
    items = items.filter((item) => {
      const haystack = [
        item.ringNumber,
        item.owner,
        item.region,
        item.raceRank,
        item.note
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }

  return {
    items: deepClone(items),
    total: items.length
  };
}

export function updateProjectItem(
  userId: string,
  projectId: string,
  itemId: string,
  payload: Partial<ProjectItem> & {
    applyFieldsToAll?: boolean;
    sharedFields?: Array<keyof Pick<ProjectItem, "owner" | "region" | "raceRank" | "windSpeed" | "basketCount" | "note">>;
  }
) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  const item = project.items.find((entry) => entry.id === itemId);
  if (!item) {
    throw new ApiServiceError(404, "item_not_found", "记录不存在。");
  }

  const { applyFieldsToAll, sharedFields, ...patch } = payload;
  Object.assign(item, mergeItem(item, patch));

  if (applyFieldsToAll && sharedFields?.length) {
    project.items.forEach((entry) => {
      if (entry.id === item.id) {
        return;
      }
      const nextPatch = sharedFields.reduce<Partial<ProjectItem>>((accumulator, field) => {
        accumulator[field] = item[field];
        return accumulator;
      }, {});
      Object.assign(entry, mergeItem(entry, nextPatch));
    });
  }

  touchProject(project);
  return {
    item: deepClone(item),
    summary: buildSummary(project)
  };
}

export function retryProjectItem(userId: string, projectId: string, itemId: string) {
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  const item = project.items.find((entry) => entry.id === itemId);
  if (!item) {
    throw new ApiServiceError(404, "item_not_found", "记录不存在。");
  }

  const status = buildRecordStatus(item);
  item.status = status;
  item.failureReason = status === "success" ? undefined : getFailureReason(item);

  const hasEye = Boolean(item.eyeImageSrc);
  const hasBody = Boolean(item.bodyImageSrc);
  upsertProcessingJob({
    projectId: project.id,
    itemId: item.id,
    type: hasEye ? "eye-cutout" : "body-cutout",
    status: status === "success" ? "succeeded" : "failed",
    failureReason: status === "success" ? undefined : item.failureReason
  });

  touchProject(project);
  return {
    item: deepClone(item),
    retryAccepted: status !== "failed"
  };
}

export function exportProjectRecords(
  userId: string,
  projectId: string,
  payload: Partial<{
    itemIds: string[];
    format: ExportFormat;
  }>
) {
  const db = getDb();
  const workspace = getWorkspaceOrThrow(userId);
  const project = getProjectOrThrow(workspace, projectId);
  const selectedItems = payload.itemIds?.length
    ? project.items.filter((item) => payload.itemIds?.includes(item.id))
    : project.items.filter((item) => item.status === "success");

  if (!selectedItems.length) {
    throw new ApiServiceError(400, "no_exportable_items", "没有可导出的成功记录。");
  }

  if (selectedItems.some((item) => item.status !== "success")) {
    throw new ApiServiceError(400, "export_contains_failed_records", "仅支持导出处理成功的记录。");
  }

  const syncedAccount = syncAccountState(workspace.account);
  const remaining = getAvailableExportCount(syncedAccount, db.adminConfig.freeDailyQuota);
  if (remaining !== Number.POSITIVE_INFINITY && selectedItems.length > remaining) {
    throw new ApiServiceError(403, "insufficient_entitlement", "剩余导出次数不足。", {
      remaining,
      requested: selectedItems.length
    });
  }

  const plan = getEffectivePlan(syncedAccount);
  if (plan === "free") {
    workspace.account.freeUsed += selectedItems.length;
  } else if (plan === "pack") {
    workspace.account.packCredits = Math.max(0, workspace.account.packCredits - selectedItems.length);
  }
  workspace.account = syncAccountState(workspace.account);

  const watermarked = db.adminConfig.watermarkOnFree && plan === "free";
  const format = payload.format ?? "png";
  const createdAt = nowIso();
  selectedItems.forEach((item) => {
    const signature = buildExportSignature(project, item, watermarked);
    item.exportStatus = "exported";
    item.lastExportedAt = createdAt;
    item.exportedSignatures = Array.from(new Set([...item.exportedSignatures, signature]));
    upsertProcessingJob({
      projectId: project.id,
      itemId: item.id,
      type: "export",
      status: "succeeded"
    });
  });
  touchProject(project);

  const ticket: ProjectExportTicket = {
    id: createId("export"),
    projectId: project.id,
    itemIds: selectedItems.map((item) => item.id),
    format,
    watermarked,
    downloadUrl: `https://mock.pigeon.studio/download/${project.id}/${format}/${Date.now()}`,
    createdAt
  };
  db.exportTickets.unshift(ticket);

  return {
    ticket: deepClone(ticket),
    summary: buildSummary(project),
    entitlement: buildEntitlementSnapshot(workspace)
  };
}

export function getEntitlements(userId: string) {
  return buildEntitlementSnapshot(getWorkspaceOrThrow(userId));
}

function getProductOrThrow(productId: string): ProductOption {
  const product = getDb().products.find((item) => item.id === productId);
  if (!product) {
    throw new ApiServiceError(404, "product_not_found", "商品不存在。");
  }
  return product;
}

export function createOrder(userId: string, productId: string) {
  const product = getProductOrThrow(productId);
  const db = getDb();
  const order: PaymentOrder = {
    id: createId("order"),
    userId,
    productId: product.id,
    productName: product.name,
    amountLabel: product.priceLabel,
    status: "pending",
    createdAt: nowIso(),
    qrCodeUrl: `https://mock.pigeon.studio/pay/${product.id}/${Date.now()}`,
    productKind: product.kind,
    credits: product.credits,
    days: product.days
  };
  db.orders.unshift(order);
  return deepClone(order);
}

export function getOrder(userId: string, orderId: string) {
  const order = getDb().orders.find((item) => item.id === orderId && item.userId === userId);
  if (!order) {
    throw new ApiServiceError(404, "order_not_found", "订单不存在。");
  }
  return deepClone(order);
}

export function listUserOrders(userId: string) {
  return getDb().orders.filter((order) => order.userId === userId).map((order) => deepClone(order));
}

export function payOrder(userId: string, orderId: string) {
  const db = getDb();
  const workspace = getWorkspaceOrThrow(userId);
  const order = db.orders.find((item) => item.id === orderId && item.userId === userId);
  if (!order) {
    throw new ApiServiceError(404, "order_not_found", "订单不存在。");
  }
  if (order.status === "paid") {
    return {
      order: deepClone(order),
      entitlement: buildEntitlementSnapshot(workspace)
    };
  }

  order.status = "paid";
  order.paidAt = nowIso();

  if (order.productKind === "pack") {
    workspace.account.packCredits += order.credits ?? 0;
  }
  if (order.productKind === "monthly") {
    const now = Date.now();
    const currentExpiry = workspace.account.monthlyExpiresAt ? new Date(workspace.account.monthlyExpiresAt).getTime() : 0;
    const baseTime = Math.max(now, currentExpiry);
    workspace.account.monthlyExpiresAt = new Date(baseTime + (order.days ?? 30) * 24 * 60 * 60 * 1000).toISOString();
  }

  workspace.account.orders.unshift({
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    amountLabel: order.amountLabel,
    status: "paid",
    createdAt: order.createdAt,
    paidAt: order.paidAt
  });
  workspace.account = syncAccountState(workspace.account);

  return {
    order: deepClone(order),
    entitlement: buildEntitlementSnapshot(workspace)
  };
}

export function listAdminUsers() {
  const db = getDb();
  return db.users
    .filter((user) => user.role === "user")
    .map((user) => {
      const workspace = getWorkspaceOrThrow(user.id);
      return {
        ...deepClone(user),
        projectCount: workspace.projects.length,
        activeProjectId: workspace.activeProjectId,
        account: deepClone(workspace.account),
        effectivePlan: getEffectivePlan(workspace.account),
        latestProjectUpdatedAt: workspace.projects[0]?.updatedAt
      };
    });
}

export function listAdminOrders() {
  return getDb().orders.map((order) => deepClone(order));
}

export function listAdminTemplates() {
  return getDb().templates
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((template) => deepClone(template));
}

export function updateAdminTemplate(templateId: string, payload: Partial<TemplateRecord>) {
  const template = getDb().templates.find((item) => item.id === templateId);
  if (!template) {
    throw new ApiServiceError(404, "template_not_found", "模板不存在。");
  }

  Object.assign(template, {
    name: payload.name ?? template.name,
    description: payload.description ?? template.description,
    tier: payload.tier ?? template.tier,
    accent: payload.accent ?? template.accent,
    enabled: payload.enabled ?? template.enabled,
    sortOrder: payload.sortOrder ?? template.sortOrder
  });

  return deepClone(template);
}

export function getAdminConfig() {
  return deepClone(getDb().adminConfig);
}

export function updateAdminConfig(payload: Partial<AdminConfig>) {
  const db = getDb();
  db.adminConfig = {
    ...db.adminConfig,
    ...payload
  };
  return deepClone(db.adminConfig);
}

export function listProjectJobs(userId: string, projectId: string) {
  const workspace = getWorkspaceOrThrow(userId);
  getProjectOrThrow(workspace, projectId);
  return getDb().processingJobs
    .filter((job) => job.projectId === projectId)
    .map((job) => deepClone(job));
}

export function resetMockDatabase() {
  globalThis.__PIGEON_MOCK_DB__ = seedDatabase();
  return true;
}
