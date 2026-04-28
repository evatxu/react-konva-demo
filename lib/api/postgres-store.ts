import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { PoolClient, QueryResultRow } from "pg";

import {
  ApiServiceError,
  type AdminConfig,
  type ApiUser,
  type EntitlementSnapshot,
  type ItemsPayload,
  type PaymentOrder,
  type ProcessingJob,
  type ProjectDetailPayload,
  type ProjectSummary,
  type ProjectExportTicket,
  type SessionContext,
  type SessionRole,
  type TemplateRecord,
  type UserSessionPayload
} from "@/lib/api/contracts";
import { createSessionToken, verifySessionToken } from "@/lib/api/session-token";
import { query, withTransaction } from "@/lib/db/postgres";
import {
  buildRecordStatus,
  createEmptyProjectFields,
  getBusinessWindowKey,
  getNextResetAt,
  type AccountPlan,
  type AccountState,
  type ExportFormat,
  type Order,
  type PosterTemplate,
  type ProductOption,
  type Project,
  type ProjectFields,
  type ProjectItem,
  type RecordStatus,
  type UploadedAsset,
  type UploadKind
} from "@/lib/pigeon-studio";

type DbExecutor = Pick<PoolClient, "query">;

type UserRow = {
  id: string;
  phone: string;
  nickname: string | null;
  avatar_url: string | null;
  status: "active" | "disabled";
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AdminUserRow = {
  id: string;
  username: string;
  password_hash: string;
  status: "active" | "disabled";
  created_at: Date | string;
  updated_at: Date | string;
};

type UserEntitlementRow = {
  user_id: string;
  current_plan: "free" | "times_card" | "monthly";
  monthly_active: boolean;
  monthly_expire_at: Date | string | null;
  times_card_balance: number;
  free_daily_limit: number;
  last_effective_order_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type QuotaDailyUsageRow = {
  id: string;
  user_id: string;
  business_date: string;
  used_count: number;
  limit_count: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProductRow = {
  id: string;
  code: string;
  name: string;
  product_type: "times_card" | "monthly";
  price_cents: number;
  times_count: number | null;
  duration_days: number | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type TemplateGroupRow = {
  id: string;
  code: string;
  name: string;
  permission_type: "free" | "paid";
  cover_url: string | null;
  description: string | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  template_group_id: string | null;
  template_code: string | null;
  status: string;
  title: string | null;
  subtitle: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_wechat: string | null;
  logo_asset_id: string | null;
  wechat_qr_asset_id: string | null;
  logo_src: string | null;
  qr_src: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ProjectItemRow = {
  id: string;
  project_id: string;
  ring_no: string;
  sex: string | null;
  breeder_name: string | null;
  region: string | null;
  other_note: string | null;
  eye_side_auto: string | null;
  eye_side_auto_confidence: string | null;
  body_side_auto: string | null;
  body_side_auto_confidence: string | null;
  eye_side_final: string | null;
  side_source: string | null;
  item_status: string;
  needs_reprocess: boolean;
  needs_regenerate: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  race_rank: string | null;
  wind_speed: string | null;
  basket_count: string | null;
  eye_image_src: string | null;
  body_image_src: string | null;
  latest_generated_at: Date | string | null;
};

type AssetRow = {
  id: string;
  project_id: string | null;
  asset_type: string;
  file_name: string;
  status: string;
  storage_key: string;
};

type OrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  product_id: string;
  order_type: "times_card" | "monthly";
  amount_cents: number;
  status: string;
  paid_at: Date | string | null;
  expired_at: Date | string | null;
  remark: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  product_code: string;
  product_name: string;
  product_type: "times_card" | "monthly";
  times_count: number | null;
  duration_days: number | null;
};

type ProcessingJobRow = {
  id: string;
  project_id: string;
  job_type: string;
  status: string;
  total_items: number;
  success_items: number;
  failed_items: number;
  created_at: Date | string;
  updated_at: Date | string;
};

const TEMPLATE_THEME_PRESETS: PosterTemplate[] = [
  {
    id: "preset-1",
    name: "竞技旗舰版",
    tier: "free",
    description: "红白竞技风格",
    accent: "#d7271f",
    accentSoft: "#fff0eb",
    accentText: "#c42a22",
    backgroundFrom: "#fffdfc",
    backgroundTo: "#f7f0ee",
    surface: "#ffffff",
    frame: "#f4c7bf"
  },
  {
    id: "preset-2",
    name: "公棚名鸽版",
    tier: "paid",
    description: "蓝灰数据分栏",
    accent: "#2d65c8",
    accentSoft: "#edf4ff",
    accentText: "#2d65c8",
    backgroundFrom: "#fbfdff",
    backgroundTo: "#eef4fb",
    surface: "#ffffff",
    frame: "#cadeff"
  },
  {
    id: "preset-3",
    name: "冠军归巢版",
    tier: "paid",
    description: "黑灰叠层与红色焦点",
    accent: "#be2d2f",
    accentSoft: "#fff0f0",
    accentText: "#a11f22",
    backgroundFrom: "#fcfcfd",
    backgroundTo: "#eff1f5",
    surface: "#ffffff",
    frame: "#d7dbe5"
  },
  {
    id: "preset-4",
    name: "收藏系列版",
    tier: "paid",
    description: "高对比收藏风格",
    accent: "#7a58c9",
    accentSoft: "#f3edff",
    accentText: "#6b4dbe",
    backgroundFrom: "#fdfcff",
    backgroundTo: "#f2eefb",
    surface: "#ffffff",
    frame: "#ddd0fb"
  },
  {
    id: "preset-5",
    name: "极速先锋版",
    tier: "paid",
    description: "橙金焦点风格",
    accent: "#db8a18",
    accentSoft: "#fff4df",
    accentText: "#ba6f0c",
    backgroundFrom: "#fffdf9",
    backgroundTo: "#fbf3e7",
    surface: "#ffffff",
    frame: "#f3d5a0"
  }
];

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function execute<T extends QueryResultRow = QueryResultRow>(
  db: DbExecutor | null,
  text: string,
  params: unknown[] = []
) {
  if (db) {
    return db.query<T>(text, params);
  }
  return query<T>(text, params);
}

function formatPriceLabel(priceCents: number) {
  const amount = priceCents / 100;
  return Number.isInteger(amount) ? `¥${amount}` : `¥${amount.toFixed(2)}`;
}

function getTemplateTheme(index: number) {
  return TEMPLATE_THEME_PRESETS[index % TEMPLATE_THEME_PRESETS.length];
}

function mapDbSide(value: string | null | undefined, fallback: "左" | "右" | "居中") {
  switch (value) {
    case "left":
      return "左" as const;
    case "right":
      return "右" as const;
    case "center":
      return "居中" as const;
    default:
      return fallback;
  }
}

function mapCnSide(value: string | undefined) {
  switch (value) {
    case "左":
      return "left";
    case "右":
      return "right";
    case "居中":
      return "center";
    default:
      return null;
  }
}

function assetTypeToUploadKind(assetType: string): UploadKind {
  switch (assetType) {
    case "eye_image":
    case "processed_eye":
      return "eye";
    case "body_image":
    case "processed_body":
      return "body";
    case "excel":
      return "sheet";
    case "zip":
      return "archive";
    default:
      return "unknown";
  }
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

function inferDirection(name: string, fallback: "left" | "right" | "center") {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("left") || lowerName.includes("左")) {
    return "left";
  }
  if (lowerName.includes("right") || lowerName.includes("右")) {
    return "right";
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

function buildProductDescription(product: ProductRow) {
  if (product.product_type === "times_card") {
    return `不限制过期时间，可导出 ${product.times_count ?? 0} 条成功记录，可用全部模板。`;
  }
  return `${product.duration_days ?? 0} 天内不限导出张数，可用全部模板且无水印。`;
}

function mapProductRow(row: ProductRow): ProductOption {
  return {
    id: row.code,
    name: row.name,
    description: buildProductDescription(row),
    priceLabel: formatPriceLabel(row.price_cents),
    kind: row.product_type === "times_card" ? "pack" : "monthly",
    credits: row.times_count ?? undefined,
    days: row.duration_days ?? undefined
  };
}

function mapUserRowToApiUser(row: UserRow): ApiUser {
  return {
    id: String(row.id),
    role: "user",
    name: row.nickname?.trim() || row.phone,
    phone: row.phone,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    lastLoginAt: toIsoString(row.last_login_at)
  };
}

function mapAdminRowToApiUser(row: AdminUserRow): ApiUser {
  return {
    id: String(row.id),
    role: "admin",
    name: row.username,
    username: row.username,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString()
  };
}

function buildTemplateFromRow(row: TemplateGroupRow, index: number): TemplateRecord {
  const theme = getTemplateTheme(index);
  return {
    ...theme,
    id: row.code,
    name: row.name,
    tier: row.permission_type,
    description: row.description ?? theme.description,
    enabled: row.status === "active",
    sortOrder: row.sort_order
  };
}

async function getSystemConfigValue<T>(key: string, fallback: T, db?: DbExecutor | null): Promise<T> {
  const result = await execute<{ value_json: T }>(
    db ?? null,
    "SELECT value_json FROM system_configs WHERE key = $1",
    [key]
  );
  return result.rows[0]?.value_json ?? fallback;
}

async function upsertSystemConfig(key: string, value: unknown, description?: string, updatedBy?: string, db?: DbExecutor) {
  await execute(
    db ?? null,
    `
      INSERT INTO system_configs (key, value_json, description, updated_by)
      VALUES ($1, $2::jsonb, $3, $4)
      ON CONFLICT (key)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        description = COALESCE(EXCLUDED.description, system_configs.description),
        updated_by = EXCLUDED.updated_by
    `,
    [key, JSON.stringify(value), description ?? null, updatedBy ?? null]
  );
}

async function getUserByPhone(phone: string, db?: DbExecutor | null) {
  const result = await execute<UserRow>(
    db ?? null,
    `
      SELECT id, phone, nickname, avatar_url, status, last_login_at, created_at, updated_at
      FROM users
      WHERE phone = $1
      LIMIT 1
    `,
    [phone]
  );
  return result.rows[0] ?? null;
}

async function syncUsersIdSequence(db: DbExecutor) {
  await execute(
    db,
    `
      SELECT setval(
        pg_get_serial_sequence('users', 'id'),
        COALESCE((SELECT MAX(id) FROM users), 0) + 1,
        false
      )
    `
  );
}

async function syncAdminUsersIdSequence(db: DbExecutor) {
  await execute(
    db,
    `
      SELECT setval(
        pg_get_serial_sequence('admin_users', 'id'),
        COALESCE((SELECT MAX(id) FROM admin_users), 0) + 1,
        false
      )
    `
  );
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  if (!storedHash.startsWith("scrypt$")) {
    return password === storedHash;
  }

  const [, salt, hash] = storedHash.split("$");
  if (!salt || !hash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "utf8");
  const expected = Buffer.from(hash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function getUserById(userId: string, db?: DbExecutor | null) {
  const result = await execute<UserRow>(
    db ?? null,
    `
      SELECT id, phone, nickname, avatar_url, status, last_login_at, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function getAdminByUsername(username: string, db?: DbExecutor | null) {
  const result = await execute<AdminUserRow>(
    db ?? null,
    `
      SELECT id, username, password_hash, status, created_at, updated_at
      FROM admin_users
      WHERE username = $1
      LIMIT 1
    `,
    [username]
  );
  return result.rows[0] ?? null;
}

async function getAdminById(userId: string, db?: DbExecutor | null) {
  const result = await execute<AdminUserRow>(
    db ?? null,
    `
      SELECT id, username, password_hash, status, created_at, updated_at
      FROM admin_users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function ensureUserEntitlement(userId: string, db?: DbExecutor) {
  const freeDailyLimit = await getSystemConfigValue("free_daily_limit", 3, db ?? null);
  await execute(
    db ?? null,
    `
      INSERT INTO user_entitlements (
        user_id,
        current_plan,
        monthly_active,
        monthly_expire_at,
        times_card_balance,
        free_daily_limit,
        last_effective_order_id,
        created_at,
        updated_at
      )
      VALUES ($1, 'free', false, NULL, 0, $2, NULL, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, freeDailyLimit]
  );

  const result = await execute<UserEntitlementRow>(
    db ?? null,
    `
      SELECT
        user_id,
        current_plan,
        monthly_active,
        monthly_expire_at,
        times_card_balance,
        free_daily_limit,
        last_effective_order_id,
        created_at,
        updated_at
      FROM user_entitlements
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiServiceError(500, "entitlement_init_failed", "用户权益初始化失败。");
  }
  return row;
}

async function ensureQuotaDailyUsage(userId: string, limitCount: number, db?: DbExecutor) {
  const businessDate = getBusinessWindowKey();
  await execute(
    db ?? null,
    `
      INSERT INTO quota_daily_usage (
        user_id,
        business_date,
        used_count,
        limit_count,
        created_at,
        updated_at
      )
      VALUES ($1, $2::date, 0, $3, NOW(), NOW())
      ON CONFLICT (user_id, business_date)
      DO UPDATE SET
        limit_count = EXCLUDED.limit_count,
        updated_at = NOW()
    `,
    [userId, businessDate, limitCount]
  );

  const result = await execute<QuotaDailyUsageRow>(
    db ?? null,
    `
      SELECT
        id,
        user_id,
        business_date::text,
        used_count,
        limit_count,
        created_at,
        updated_at
      FROM quota_daily_usage
      WHERE user_id = $1 AND business_date = $2::date
      LIMIT 1
    `,
    [userId, businessDate]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiServiceError(500, "quota_init_failed", "免费额度初始化失败。");
  }
  return row;
}

function resolveAccountPlan(entitlement: UserEntitlementRow): AccountPlan {
  const monthlyExpiresAt = entitlement.monthly_expire_at ? new Date(entitlement.monthly_expire_at).getTime() : 0;
  if (entitlement.monthly_active && monthlyExpiresAt > Date.now()) {
    return "monthly";
  }
  if (entitlement.times_card_balance > 0) {
    return "pack";
  }
  return "free";
}

async function listUserOrderSummaries(userId: string, db?: DbExecutor | null): Promise<Order[]> {
  const result = await execute<OrderRow>(
    db ?? null,
    `
      SELECT
        o.id,
        o.order_no,
        o.user_id,
        o.product_id,
        o.order_type,
        o.amount_cents,
        o.status,
        o.paid_at,
        o.expired_at,
        o.remark,
        o.created_at,
        o.updated_at,
        p.code AS product_code,
        p.name AS product_name,
        p.product_type,
        p.times_count,
        p.duration_days
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC, o.id DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    productId: row.product_code,
    productName: row.product_name,
    amountLabel: formatPriceLabel(row.amount_cents),
    status: row.status === "paid" ? "paid" : "pending",
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    paidAt: toIsoString(row.paid_at)
  }));
}

async function buildAccountState(userId: string, db?: DbExecutor | null): Promise<AccountState> {
  const entitlement = await ensureUserEntitlement(userId, db ?? undefined);
  const quota = await ensureQuotaDailyUsage(userId, entitlement.free_daily_limit, db ?? undefined);
  const orders = await listUserOrderSummaries(userId, db ?? null);
  const plan = resolveAccountPlan(entitlement);

  return {
    plan,
    freeUsed: quota.used_count,
    freeWindowKey: getBusinessWindowKey(),
    packCredits: entitlement.times_card_balance,
    monthlyExpiresAt: toIsoString(entitlement.monthly_expire_at),
    orders
  };
}

async function getActiveProjectId(userId: string, db?: DbExecutor | null) {
  const result = await execute<{ id: string }>(
    db ?? null,
    `
      SELECT id
      FROM projects
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

async function getProjectCount(userId: string, db?: DbExecutor | null) {
  const result = await execute<{ count: number }>(
    db ?? null,
    "SELECT COUNT(*)::int AS count FROM projects WHERE user_id = $1",
    [userId]
  );
  return result.rows[0]?.count ?? 0;
}

async function assertTemplateAccess(templateId: string, account: AccountState, db?: DbExecutor | null) {
  const template = await getTemplateGroupByIdentifier(templateId, db ?? null);
  if (!template || template.status !== "active") {
    throw new ApiServiceError(404, "template_not_found", "模板不存在或已停用。");
  }
  if (template.permission_type === "paid" && account.plan === "free") {
    throw new ApiServiceError(403, "template_locked", "当前账号无法使用付费模板。");
  }
  return template;
}

async function getTemplateGroupByIdentifier(templateId: string, db?: DbExecutor | null) {
  const result = await execute<TemplateGroupRow>(
    db ?? null,
    `
      SELECT
        id,
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      FROM template_groups
      WHERE code = $1 OR id::text = $1
      LIMIT 1
    `,
    [templateId]
  );
  return result.rows[0] ?? null;
}

async function getDefaultTemplateGroup(db?: DbExecutor | null) {
  const result = await execute<TemplateGroupRow>(
    db ?? null,
    `
      SELECT
        id,
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      FROM template_groups
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `
  );
  return result.rows[0] ?? null;
}

function buildProjectFields(row: ProjectRow): ProjectFields {
  const defaults = createEmptyProjectFields();
  return {
    title: row.title ?? defaults.title,
    subtitle: row.subtitle ?? defaults.subtitle,
    contactName: row.contact_name ?? defaults.contactName,
    phone: row.contact_phone ?? defaults.phone,
    wechat: row.contact_wechat ?? defaults.wechat,
    logoSrc: row.logo_src ?? undefined,
    qrCodeSrc: row.qr_src ?? undefined
  };
}

async function listProjectAssets(projectId: string, db?: DbExecutor | null): Promise<UploadedAsset[]> {
  const result = await execute<AssetRow>(
    db ?? null,
    `
      SELECT id, project_id, asset_type, file_name, status, storage_key
      FROM assets
      WHERE project_id = $1 AND status <> 'deleted'
      ORDER BY created_at DESC, id DESC
    `,
    [projectId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.file_name,
    kind: assetTypeToUploadKind(row.asset_type),
    status: row.status === "failed" ? "failed" : "success",
    note: row.status === "failed" ? "处理失败" : "文件已上传"
  }));
}

async function listProjectItemRows(projectId: string, db?: DbExecutor | null) {
  const result = await execute<ProjectItemRow>(
    db ?? null,
    `
      SELECT
        pi.id,
        pi.project_id,
        pi.ring_no,
        pi.sex,
        pi.breeder_name,
        pi.region,
        pi.other_note,
        pi.eye_side_auto,
        pi.eye_side_auto_confidence,
        pi.body_side_auto,
        pi.body_side_auto_confidence,
        pi.eye_side_final,
        pi.side_source,
        pi.item_status,
        pi.needs_reprocess,
        pi.needs_regenerate,
        pi.created_at,
        pi.updated_at,
        perf.rank_text AS race_rank,
        perf.speed_text AS wind_speed,
        perf.basket_count_text AS basket_count,
        eye_asset.storage_key AS eye_image_src,
        body_asset.storage_key AS body_image_src,
        latest_gen.created_at AS latest_generated_at
      FROM project_items pi
      LEFT JOIN LATERAL (
        SELECT rank_text, speed_text, basket_count_text
        FROM project_item_performances
        WHERE project_item_id = pi.id
        ORDER BY seq_no ASC, id ASC
        LIMIT 1
      ) perf ON TRUE
      LEFT JOIN LATERAL (
        SELECT a.storage_key
        FROM project_item_assets pia
        JOIN assets a ON a.id = pia.asset_id
        WHERE pia.project_item_id = pi.id
          AND pia.asset_role IN ('processed_eye', 'raw_eye')
          AND a.status <> 'deleted'
        ORDER BY CASE pia.asset_role WHEN 'processed_eye' THEN 0 ELSE 1 END, pia.id DESC
        LIMIT 1
      ) eye_asset ON TRUE
      LEFT JOIN LATERAL (
        SELECT a.storage_key
        FROM project_item_assets pia
        JOIN assets a ON a.id = pia.asset_id
        WHERE pia.project_item_id = pi.id
          AND pia.asset_role IN ('processed_body', 'raw_body')
          AND a.status <> 'deleted'
        ORDER BY CASE pia.asset_role WHEN 'processed_body' THEN 0 ELSE 1 END, pia.id DESC
        LIMIT 1
      ) body_asset ON TRUE
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM generation_items
        WHERE project_item_id = pi.id AND item_status = 'success'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) latest_gen ON TRUE
      WHERE pi.project_id = $1
      ORDER BY pi.created_at ASC, pi.id ASC
    `,
    [projectId]
  );
  return result.rows;
}

function mapProjectItemRow(row: ProjectItemRow): ProjectItem {
  const item: ProjectItem = {
    id: String(row.id),
    ringNumber: row.ring_no,
    eyeDirectionAuto: mapDbSide(row.eye_side_auto, "左"),
    eyeDirectionFinal: mapDbSide(row.eye_side_final ?? row.eye_side_auto, "左"),
    bodyDirectionAuto: mapDbSide(row.body_side_auto, "右"),
    bodyDirectionFinal: mapDbSide(row.body_side_auto, "右"),
    eyeImageSrc: row.eye_image_src ?? undefined,
    bodyImageSrc: row.body_image_src ?? undefined,
    gender: row.sex ?? "",
    owner: row.breeder_name ?? "",
    region: row.region ?? "",
    raceRank: row.race_rank ?? "",
    windSpeed: row.wind_speed ?? "",
    basketCount: row.basket_count ?? "",
    note: row.other_note ?? "",
    status: buildRecordStatus({
      eyeImageSrc: row.eye_image_src ?? undefined,
      bodyImageSrc: row.body_image_src ?? undefined
    }),
    exportStatus: row.latest_generated_at ? "exported" : "idle",
    lastExportedAt: toIsoString(row.latest_generated_at),
    exportedSignatures: []
  };

  item.failureReason = item.status === "success" ? undefined : getFailureReason(item);
  return item;
}

async function buildProjectSummaryById(projectId: string, db?: DbExecutor | null) {
  const result = await execute<ProjectSummary>(
    db ?? null,
    `
      WITH asset_counts AS (
        SELECT project_id, COUNT(*)::int AS asset_count
        FROM assets
        WHERE project_id = $1 AND status <> 'deleted'
        GROUP BY project_id
      ),
      item_counts AS (
        SELECT
          pi.project_id,
          COUNT(*)::int AS item_count,
          COUNT(*) FILTER (
            WHERE eye_exists.has_eye AND body_exists.has_body
          )::int AS success_count,
          COUNT(*) FILTER (
            WHERE eye_exists.has_eye <> body_exists.has_body
          )::int AS processing_count,
          COUNT(*) FILTER (
            WHERE NOT eye_exists.has_eye AND NOT body_exists.has_body
          )::int AS failed_count
        FROM project_items pi
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1
            FROM project_item_assets pia
            JOIN assets a ON a.id = pia.asset_id
            WHERE pia.project_item_id = pi.id
              AND pia.asset_role IN ('processed_eye', 'raw_eye')
              AND a.status <> 'deleted'
          ) AS has_eye
        ) eye_exists ON TRUE
        LEFT JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1
            FROM project_item_assets pia
            JOIN assets a ON a.id = pia.asset_id
            WHERE pia.project_item_id = pi.id
              AND pia.asset_role IN ('processed_body', 'raw_body')
              AND a.status <> 'deleted'
          ) AS has_body
        ) body_exists ON TRUE
        WHERE pi.project_id = $1
        GROUP BY pi.project_id
      )
      SELECT
        p.id,
        p.name,
        COALESCE(p.description, '') AS description,
        COALESCE(tg.code, p.template_group_id::text) AS template_id,
        p.created_at,
        p.updated_at,
        (
          SELECT pi.id::text
          FROM project_items pi
          WHERE pi.project_id = p.id
          ORDER BY pi.updated_at DESC, pi.id DESC
          LIMIT 1
        ) AS active_item_id,
        COALESCE(item_counts.item_count, 0) AS item_count,
        COALESCE(item_counts.success_count, 0) AS success_count,
        COALESCE(item_counts.processing_count, 0) AS processing_count,
        COALESCE(item_counts.failed_count, 0) AS failed_count,
        COALESCE(asset_counts.asset_count, 0) AS asset_count
      FROM projects p
      LEFT JOIN template_groups tg ON tg.id = p.template_group_id
      LEFT JOIN item_counts ON item_counts.project_id = p.id
      LEFT JOIN asset_counts ON asset_counts.project_id = p.id
      WHERE p.id = $1
      LIMIT 1
    `,
    [projectId]
  );

  const row = result.rows[0] as unknown as {
    id: string;
    name: string;
    description: string;
    template_id: string;
    created_at: Date | string;
    updated_at: Date | string;
    active_item_id: string | null;
    item_count: number;
    success_count: number;
    processing_count: number;
    failed_count: number;
    asset_count: number;
  } | undefined;

  if (!row) {
    throw new ApiServiceError(404, "project_not_found", "项目不存在。");
  }

  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    templateId: row.template_id,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    activeItemId: row.active_item_id ? String(row.active_item_id) : null,
    itemCount: row.item_count,
    successCount: row.success_count,
    processingCount: row.processing_count,
    failedCount: row.failed_count,
    assetCount: row.asset_count
  };
}

async function getProjectRowForUser(userId: string, projectId: string, db?: DbExecutor | null) {
  const result = await execute<ProjectRow>(
    db ?? null,
    `
      SELECT
        p.id,
        p.user_id,
        p.name,
        p.description,
        p.template_group_id,
        tg.code AS template_code,
        p.status,
        p.title,
        p.subtitle,
        p.contact_name,
        p.contact_phone,
        p.contact_wechat,
        p.logo_asset_id,
        p.wechat_qr_asset_id,
        logo.storage_key AS logo_src,
        qr.storage_key AS qr_src,
        p.created_at,
        p.updated_at
      FROM projects p
      LEFT JOIN template_groups tg ON tg.id = p.template_group_id
      LEFT JOIN assets logo ON logo.id = p.logo_asset_id
      LEFT JOIN assets qr ON qr.id = p.wechat_qr_asset_id
      WHERE p.id = $1 AND p.user_id = $2
      LIMIT 1
    `,
    [projectId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiServiceError(404, "project_not_found", "项目不存在。");
  }
  return row;
}

async function buildProjectByRow(row: ProjectRow, db?: DbExecutor | null): Promise<Project> {
  const items = (await listProjectItemRows(String(row.id), db ?? null)).map(mapProjectItemRow);
  const uploadedAssets = await listProjectAssets(String(row.id), db ?? null);
  return {
    id: String(row.id),
    name: row.name,
    description: row.description ?? "",
    templateId: row.template_code ?? String(row.template_group_id ?? ""),
    fields: buildProjectFields(row),
    uploadedAssets,
    items,
    activeItemId: items[0]?.id ?? null,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString()
  };
}

async function upsertProjectItemAsset(projectItemId: string, assetRole: string, assetId: string, db: DbExecutor) {
  await execute(
    db,
    `
      INSERT INTO project_item_assets (
        project_item_id,
        asset_role,
        asset_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (project_item_id, asset_role)
      DO UPDATE SET
        asset_id = EXCLUDED.asset_id,
        updated_at = NOW()
    `,
    [projectItemId, assetRole, assetId]
  );
}

async function insertAsset(
  payload: {
    ownerUserId: string;
    projectId?: string | null;
    assetType: string;
    fileName: string;
    storageKey: string;
    status?: string;
    mimeType?: string | null;
    fileExt?: string | null;
  },
  db: DbExecutor
) {
  const result = await execute<{ id: string }>(
    db,
    `
      INSERT INTO assets (
        owner_user_id,
        project_id,
        asset_type,
        file_name,
        file_ext,
        mime_type,
        file_size,
        storage_key,
        storage_bucket,
        checksum,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, NULL, NULL, $8, NOW(), NOW())
      RETURNING id
    `,
    [
      payload.ownerUserId,
      payload.projectId ?? null,
      payload.assetType,
      payload.fileName,
      payload.fileExt ?? null,
      payload.mimeType ?? null,
      payload.storageKey,
      payload.status ?? "ready"
    ]
  );
  return String(result.rows[0].id);
}

async function createOrUpdateProjectItem(
  projectId: string,
  ringNumber: string,
  patch: Partial<{
    sex: string;
    breederName: string;
    region: string;
    otherNote: string;
    eyeSideAuto: string | null;
    bodySideAuto: string | null;
    eyeSideFinal: string | null;
    sideSource: string | null;
  }>,
  db: DbExecutor
) {
  const existing = await execute<{ id: string }>(
    db,
    `
      SELECT id
      FROM project_items
      WHERE project_id = $1 AND ring_no = $2
      LIMIT 1
    `,
    [projectId, ringNumber]
  );

  if (existing.rows[0]) {
    const result = await execute<{ id: string }>(
      db,
      `
        UPDATE project_items
        SET
          sex = COALESCE($3, sex),
          breeder_name = COALESCE($4, breeder_name),
          region = COALESCE($5, region),
          other_note = COALESCE($6, other_note),
          eye_side_auto = COALESCE($7, eye_side_auto),
          body_side_auto = COALESCE($8, body_side_auto),
          eye_side_final = COALESCE($9, eye_side_final),
          side_source = COALESCE($10, side_source),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [
        existing.rows[0].id,
        projectId,
        patch.sex ?? null,
        patch.breederName ?? null,
        patch.region ?? null,
        patch.otherNote ?? null,
        patch.eyeSideAuto ?? null,
        patch.bodySideAuto ?? null,
        patch.eyeSideFinal ?? null,
        patch.sideSource ?? null
      ]
    );
    return String(result.rows[0].id);
  }

  const eyeSideFinal = patch.eyeSideFinal ?? patch.eyeSideAuto ?? "left";
  const result = await execute<{ id: string }>(
    db,
    `
      INSERT INTO project_items (
        project_id,
        ring_no,
        sex,
        breeder_name,
        region,
        other_note,
        eye_side_auto,
        eye_side_auto_confidence,
        body_side_auto,
        body_side_auto_confidence,
        eye_side_final,
        side_source,
        item_status,
        needs_reprocess,
        needs_regenerate,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, NULL, $8, NULL, $9, $10, 'draft', false, false, NOW(), NOW()
      )
      RETURNING id
    `,
    [
      projectId,
      ringNumber,
      patch.sex ?? null,
      patch.breederName ?? null,
      patch.region ?? null,
      patch.otherNote ?? null,
      patch.eyeSideAuto ?? null,
      patch.bodySideAuto ?? null,
      eyeSideFinal,
      patch.sideSource ?? "default"
    ]
  );
  return String(result.rows[0].id);
}

async function upsertPrimaryPerformance(
  projectItemId: string,
  payload: Partial<{
    raceRank: string;
    windSpeed: string;
    basketCount: string;
    note: string;
    sourceType: string;
  }>,
  db: DbExecutor
) {
  const existing = await execute<{ id: string }>(
    db,
    `
      SELECT id
      FROM project_item_performances
      WHERE project_item_id = $1 AND seq_no = 1
      LIMIT 1
    `,
    [projectItemId]
  );

  if (existing.rows[0]) {
    await execute(
      db,
      `
        UPDATE project_item_performances
        SET
          rank_text = COALESCE($2, rank_text),
          speed_text = COALESCE($3, speed_text),
          basket_count_text = COALESCE($4, basket_count_text),
          remark = COALESCE($5, remark),
          source_type = COALESCE($6, source_type),
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        payload.raceRank ?? null,
        payload.windSpeed ?? null,
        payload.basketCount ?? null,
        payload.note ?? null,
        payload.sourceType ?? null
      ]
    );
    return;
  }

  await execute(
    db,
    `
      INSERT INTO project_item_performances (
        project_item_id,
        seq_no,
        race_name,
        distance_km,
        rank_text,
        speed_text,
        basket_count_text,
        remark,
        source_type,
        created_at,
        updated_at
      )
      VALUES ($1, 1, NULL, NULL, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
    [
      projectItemId,
      payload.raceRank ?? null,
      payload.windSpeed ?? null,
      payload.basketCount ?? null,
      payload.note ?? null,
      payload.sourceType ?? "manual"
    ]
  );
}

async function writeProcessingJob(
  projectId: string,
  triggeredBy: string,
  payload: {
    totalItems: number;
    successItems: number;
    failedItems: number;
    status: string;
    itemEntries?: Array<{
      projectItemId: string;
      itemStatus: string;
      eyeCropStatus?: string;
      bodyCropStatus?: string;
      eyeSideStatus?: string;
      bodySideStatus?: string;
      errorMessage?: string;
      resultJson?: unknown;
    }>;
  },
  db: DbExecutor
) {
  const result = await execute<{ id: string }>(
    db,
    `
      INSERT INTO processing_jobs (
        project_id,
        job_type,
        status,
        total_items,
        success_items,
        failed_items,
        triggered_by,
        created_at,
        updated_at
      )
      VALUES ($1, 'process_assets', $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
    `,
    [
      projectId,
      payload.status,
      payload.totalItems,
      payload.successItems,
      payload.failedItems,
      triggeredBy
    ]
  );

  const jobId = String(result.rows[0].id);
  for (const entry of payload.itemEntries ?? []) {
    await execute(
      db,
      `
        INSERT INTO processing_job_items (
          processing_job_id,
          project_item_id,
          item_status,
          eye_crop_status,
          body_crop_status,
          eye_side_status,
          body_side_status,
          error_message,
          result_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
      `,
      [
        jobId,
        entry.projectItemId,
        entry.itemStatus,
        entry.eyeCropStatus ?? "pending",
        entry.bodyCropStatus ?? "pending",
        entry.eyeSideStatus ?? "pending",
        entry.bodySideStatus ?? "pending",
        entry.errorMessage ?? null,
        entry.resultJson ? JSON.stringify(entry.resultJson) : null
      ]
    );
  }

  return jobId;
}

function mapOrderRowToPaymentOrder(row: OrderRow): PaymentOrder {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    productId: row.product_code,
    productName: row.product_name,
    amountLabel: formatPriceLabel(row.amount_cents),
    status: row.status === "paid" ? "paid" : "pending",
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    paidAt: toIsoString(row.paid_at),
    qrCodeUrl: `https://pay.local/orders/${row.order_no}`,
    productKind: row.product_type === "times_card" ? "pack" : "monthly",
    credits: row.times_count ?? undefined,
    days: row.duration_days ?? undefined
  };
}

export async function getSessionContext(token: string, role: SessionRole): Promise<SessionContext> {
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== role) {
    throw new ApiServiceError(401, "unauthorized", "登录态已失效，请重新登录。");
  }

  if (role === "user") {
    const user = await getUserById(payload.userId);
    if (!user || user.status !== "active") {
      throw new ApiServiceError(401, "user_not_found", "当前会话对应用户不存在。");
    }
    return {
      session: {
        token,
        role,
        userId: String(user.id),
        createdAt: new Date(payload.exp - 1000 * 60 * 60 * 24 * 7).toISOString(),
        expiresAt: new Date(payload.exp).toISOString()
      },
      user: mapUserRowToApiUser(user)
    };
  }

  const admin = await getAdminById(payload.userId);
  if (!admin || admin.status !== "active") {
    throw new ApiServiceError(401, "admin_not_found", "当前会话对应管理员不存在。");
  }
  return {
    session: {
      token,
      role,
      userId: String(admin.id),
      createdAt: new Date(payload.exp - 1000 * 60 * 60 * 24 * 7).toISOString(),
      expiresAt: new Date(payload.exp).toISOString()
    },
    user: mapAdminRowToApiUser(admin)
  };
}

export async function loginUser(phone?: string) {
  return withTransaction(async (db) => {
    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) {
      throw new ApiServiceError(400, "missing_phone", "手机号不能为空。");
    }

    let user = await getUserByPhone(normalizedPhone, db);

    if (!user) {
      await syncUsersIdSequence(db);
      const nickname = `用户${normalizedPhone.slice(-4)}`;
      const inserted = await execute<UserRow>(
        db,
        `
          INSERT INTO users (
            phone,
            nickname,
            avatar_url,
            status,
            last_login_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, NULL, 'active', NOW(), NOW(), NOW())
          RETURNING id, phone, nickname, avatar_url, status, last_login_at, created_at, updated_at
        `,
        [normalizedPhone, nickname]
      );
      user = inserted.rows[0];
    } else if (user.status !== "active") {
      throw new ApiServiceError(403, "user_disabled", "当前账号已被禁用。");
    } else {
      const updated = await execute<UserRow>(
        db,
        `
          UPDATE users
          SET last_login_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING id, phone, nickname, avatar_url, status, last_login_at, created_at, updated_at
        `,
        [user.id]
      );
      user = updated.rows[0];
    }

    await ensureUserEntitlement(String(user.id), db);

    return {
      token: createSessionToken({
        role: "user",
        userId: String(user.id)
      }),
      payload: await buildUserSessionPayload(String(user.id), db)
    };
  });
}

export async function loginAdmin(username?: string, password?: string) {
  const normalizedUsername = username?.trim() || "admin";
  const admin = await getAdminByUsername(normalizedUsername);
  if (!admin || admin.status !== "active") {
    throw new ApiServiceError(401, "admin_login_failed", "管理员账号不存在或已停用。");
  }
  if (!password || !verifyPassword(password, admin.password_hash)) {
    throw new ApiServiceError(401, "admin_login_failed", "管理员账号或密码错误。");
  }
  return {
    token: createSessionToken({
      role: "admin",
      userId: String(admin.id)
    }),
    user: mapAdminRowToApiUser(admin)
  };
}

export async function registerAdmin(username?: string, password?: string) {
  return withTransaction(async (db) => {
    const normalizedUsername = username?.trim();
    if (!normalizedUsername) {
      throw new ApiServiceError(400, "missing_username", "管理员用户名不能为空。");
    }
    if (!password?.trim()) {
      throw new ApiServiceError(400, "missing_password", "管理员密码不能为空。");
    }
    if (password.trim().length < 6) {
      throw new ApiServiceError(400, "weak_password", "管理员密码至少需要 6 位。");
    }

    const existing = await getAdminByUsername(normalizedUsername, db);
    if (existing) {
      throw new ApiServiceError(409, "admin_already_exists", "管理员用户名已存在。");
    }

    await syncAdminUsersIdSequence(db);
    const passwordHash = hashPassword(password.trim());
    const inserted = await execute<AdminUserRow>(
      db,
      `
        INSERT INTO admin_users (
          username,
          password_hash,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'active', NOW(), NOW())
        RETURNING id, username, password_hash, status, created_at, updated_at
      `,
      [normalizedUsername, passwordHash]
    );

    const admin = inserted.rows[0];
    return {
      token: createSessionToken({
        role: "admin",
        userId: String(admin.id)
      }),
      user: mapAdminRowToApiUser(admin)
    };
  });
}

export async function buildUserSessionPayload(userId: string, db?: DbExecutor | null): Promise<UserSessionPayload> {
  const user = await getUserById(userId, db ?? null);
  if (!user) {
    throw new ApiServiceError(404, "user_not_found", "用户不存在。");
  }
  return {
    user: mapUserRowToApiUser(user),
    account: await buildAccountState(userId, db ?? null),
    activeProjectId: await getActiveProjectId(userId, db ?? null),
    projectCount: await getProjectCount(userId, db ?? null)
  };
}

export async function listTemplates(userId?: string) {
  const account = userId ? await buildAccountState(userId) : null;
  const result = await query<TemplateGroupRow>(
    `
      SELECT
        id,
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      FROM template_groups
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `
  );

  return result.rows.map((row, index) => ({
    ...buildTemplateFromRow(row, index),
    locked: row.permission_type === "paid" && account?.plan === "free"
  }));
}

export async function listProducts() {
  const result = await query<ProductRow>(
    `
      SELECT
        id,
        code,
        name,
        product_type,
        price_cents,
        times_count,
        duration_days,
        status,
        sort_order,
        created_at,
        updated_at
      FROM products
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `
  );

  return result.rows.map(mapProductRow);
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const result = await query<{ id: string }>(
    `
      SELECT id
      FROM projects
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
    `,
    [userId]
  );

  const summaries = await Promise.all(result.rows.map((row) => buildProjectSummaryById(String(row.id))));
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createProject(
  userId: string,
  payload: Partial<{
    name: string;
    description: string;
    templateId: string;
    fields: Partial<ProjectFields>;
  }>
) {
  return withTransaction(async (db) => {
    const account = await buildAccountState(userId, db);
    const template = payload.templateId
      ? await assertTemplateAccess(payload.templateId, account, db)
      : await getDefaultTemplateGroup(db);

    if (!template) {
      throw new ApiServiceError(404, "template_not_found", "当前没有可用模板，请先初始化模板数据。");
    }

    if (template.permission_type === "paid" && account.plan === "free") {
      throw new ApiServiceError(403, "template_locked", "当前账号无法使用付费模板。");
    }

    const fields = {
      ...createEmptyProjectFields(),
      ...(payload.fields ?? {})
    };

    const inserted = await execute<{ id: string }>(
      db,
      `
        INSERT INTO projects (
          user_id,
          name,
          description,
          template_group_id,
          status,
          title,
          subtitle,
          contact_name,
          contact_phone,
          contact_wechat,
          logo_asset_id,
          wechat_qr_asset_id,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, NULL, NULL, NOW(), NOW()
        )
        RETURNING id
      `,
      [
        userId,
        payload.name?.trim() || "新建项目",
        payload.description?.trim() || "",
        template.id,
        fields.title,
        fields.subtitle,
        fields.contactName,
        fields.phone,
        fields.wechat
      ]
    );

    const projectRow = await getProjectRowForUser(userId, String(inserted.rows[0].id), db);
    const project = await buildProjectByRow(projectRow, db);
    const summary = await buildProjectSummaryById(project.id, db);
    return { project, summary };
  });
}

export async function getProjectDetail(userId: string, projectId: string): Promise<ProjectDetailPayload> {
  const projectRow = await getProjectRowForUser(userId, projectId);
  const project = await buildProjectByRow(projectRow);
  const summary = await buildProjectSummaryById(projectId);
  return { project, summary };
}

export async function updateProject(
  userId: string,
  projectId: string,
  payload: Partial<{
    name: string;
    description: string;
    fields: Partial<ProjectFields>;
    activeItemId: string | null;
  }>
) {
  return withTransaction(async (db) => {
    const current = await getProjectRowForUser(userId, projectId, db);
    const nextFields = {
      ...buildProjectFields(current),
      ...(payload.fields ?? {})
    };

    await execute(
      db,
      `
        UPDATE projects
        SET
          name = $3,
          description = $4,
          title = $5,
          subtitle = $6,
          contact_name = $7,
          contact_phone = $8,
          contact_wechat = $9,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `,
      [
        projectId,
        userId,
        payload.name?.trim() || current.name,
        typeof payload.description === "string" ? payload.description.trim() : current.description ?? "",
        nextFields.title,
        nextFields.subtitle,
        nextFields.contactName,
        nextFields.phone,
        nextFields.wechat
      ]
    );

    const projectRow = await getProjectRowForUser(userId, projectId, db);
    const project = await buildProjectByRow(projectRow, db);
    if (payload.activeItemId && project.items.some((item) => item.id === payload.activeItemId)) {
      project.activeItemId = payload.activeItemId;
    }
    const summary = await buildProjectSummaryById(projectId, db);
    return { project, summary };
  });
}

export async function changeProjectTemplate(userId: string, projectId: string, templateId: string) {
  return withTransaction(async (db) => {
    const account = await buildAccountState(userId, db);
    const template = await assertTemplateAccess(templateId, account, db);
    await execute(
      db,
      `
        UPDATE projects
        SET template_group_id = $3, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `,
      [projectId, userId, template.id]
    );
    const projectRow = await getProjectRowForUser(userId, projectId, db);
    const project = await buildProjectByRow(projectRow, db);
    const summary = await buildProjectSummaryById(projectId, db);
    return { project, summary };
  });
}

export async function deleteProject(userId: string, projectId: string) {
  return withTransaction(async (db) => {
    await getProjectRowForUser(userId, projectId, db);

    await execute(
      db,
      `
        DELETE FROM generated_outputs
        WHERE generation_item_id IN (
          SELECT gi.id
          FROM generation_items gi
          JOIN generation_batches gb ON gb.id = gi.generation_batch_id
          WHERE gb.project_id = $1
        )
      `,
      [projectId]
    );
    await execute(
      db,
      `
        DELETE FROM generation_items
        WHERE generation_batch_id IN (
          SELECT id
          FROM generation_batches
          WHERE project_id = $1
        )
      `,
      [projectId]
    );
    await execute(db, "DELETE FROM generation_batches WHERE project_id = $1", [projectId]);
    await execute(
      db,
      `
        DELETE FROM processing_job_items
        WHERE processing_job_id IN (
          SELECT id
          FROM processing_jobs
          WHERE project_id = $1
        )
      `,
      [projectId]
    );
    await execute(db, "DELETE FROM processing_jobs WHERE project_id = $1", [projectId]);
    await execute(
      db,
      `
        DELETE FROM import_rows
        WHERE import_batch_id IN (
          SELECT id
          FROM import_batches
          WHERE project_id = $1
        )
      `,
      [projectId]
    );
    await execute(db, "DELETE FROM import_batches WHERE project_id = $1", [projectId]);
    await execute(
      db,
      `
        DELETE FROM project_item_performances
        WHERE project_item_id IN (
          SELECT id
          FROM project_items
          WHERE project_id = $1
        )
      `,
      [projectId]
    );
    await execute(
      db,
      `
        DELETE FROM project_item_assets
        WHERE project_item_id IN (
          SELECT id
          FROM project_items
          WHERE project_id = $1
        )
      `,
      [projectId]
    );
    await execute(db, "DELETE FROM project_items WHERE project_id = $1", [projectId]);
    await execute(db, "DELETE FROM assets WHERE project_id = $1", [projectId]);
    await execute(db, "DELETE FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);

    return {
      deleted: true,
      activeProjectId: await getActiveProjectId(userId, db)
    };
  });
}

export async function mutateProjectUploads(
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
  return withTransaction(async (db) => {
    await getProjectRowForUser(userId, projectId, db);
    const action = payload.action ?? "append";

    if (action === "delete") {
      const assetIds = payload.assetIds ?? [];
      if (!assetIds.length && !payload.targetItemId) {
        throw new ApiServiceError(400, "missing_delete_target", "删除素材时至少提供 assetIds 或 targetItemId。");
      }

      if (assetIds.length) {
        await execute(
          db,
          `
            UPDATE assets
            SET status = 'deleted', updated_at = NOW()
            WHERE id = ANY($1::bigint[]) AND project_id = $2
          `,
          [assetIds, projectId]
        );
      }

      if (payload.targetItemId && payload.kind) {
        const role =
          payload.kind === "eye" ? "raw_eye" :
          payload.kind === "body" ? "raw_body" :
          null;
        if (role) {
          await execute(
            db,
            "DELETE FROM project_item_assets WHERE project_item_id = $1 AND asset_role = $2",
            [payload.targetItemId, role]
          );
        }
      }

      const projectDetail = await getProjectDetail(userId, projectId);
      return {
        project: projectDetail.project,
        summary: projectDetail.summary
      };
    }

    if (!payload.assets?.length) {
      throw new ApiServiceError(400, "missing_assets", "请提供待上传素材。");
    }

    const insertedAssetIds: string[] = [];
    const affectedItemIds = new Set<string>();

    for (const incoming of payload.assets) {
      const kind = incoming.kind ?? inferUploadKind(incoming.name);
      const assetType =
        kind === "eye" ? "eye_image" :
        kind === "body" ? "body_image" :
        kind === "sheet" ? "excel" :
        kind === "archive" ? "zip" :
        "output";

      const assetId = await insertAsset(
        {
          ownerUserId: userId,
          projectId,
          assetType,
          fileName: incoming.name,
          fileExt: incoming.name.includes(".") ? incoming.name.split(".").pop() ?? null : null,
          mimeType: incoming.dataUrl?.match(/^data:([^;]+);/)?.[1] ?? null,
          storageKey: incoming.dataUrl ?? incoming.name,
          status: "ready"
        },
        db
      );
      insertedAssetIds.push(assetId);

      if (kind !== "eye" && kind !== "body") {
        continue;
      }

      let projectItemId = payload.targetItemId ?? null;
      if (!projectItemId) {
        const ringNumber = incoming.ringNumber?.trim() || inferRingNumber(incoming.name) || `AUTO-${Date.now()}`;
        projectItemId = await createOrUpdateProjectItem(
          projectId,
          ringNumber,
          {
            eyeSideAuto: kind === "eye" ? inferDirection(incoming.name, "left") : undefined,
            bodySideAuto: kind === "body" ? inferDirection(incoming.name, "right") : undefined,
            eyeSideFinal: kind === "eye" ? inferDirection(incoming.name, "left") : undefined,
            sideSource: "auto"
          },
          db
        );
      }

      const role = kind === "eye" ? "raw_eye" : "raw_body";
      await upsertProjectItemAsset(projectItemId, role, assetId, db);
      await execute(
        db,
        `
          UPDATE project_items
          SET
            eye_side_auto = COALESCE($2, eye_side_auto),
            body_side_auto = COALESCE($3, body_side_auto),
            eye_side_final = COALESCE($4, eye_side_final),
            side_source = COALESCE($5, side_source),
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          projectItemId,
          kind === "eye" ? inferDirection(incoming.name, "left") : null,
          kind === "body" ? inferDirection(incoming.name, "right") : null,
          kind === "eye" ? inferDirection(incoming.name, "left") : null,
          "auto"
        ]
      );
      affectedItemIds.add(projectItemId);
    }

    if (affectedItemIds.size) {
      await writeProcessingJob(
        projectId,
        userId,
        {
          totalItems: affectedItemIds.size,
          successItems: affectedItemIds.size,
          failedItems: 0,
          status: "success",
          itemEntries: Array.from(affectedItemIds).map((itemId) => ({
            projectItemId: itemId,
            itemStatus: "success",
            eyeCropStatus: "success",
            bodyCropStatus: "success",
            eyeSideStatus: "success",
            bodySideStatus: "success"
          }))
        },
        db
      );
    }

    const projectDetail = await getProjectDetail(userId, projectId);
    return {
      uploadedAssets: projectDetail.project.uploadedAssets.filter((asset) => insertedAssetIds.includes(asset.id)),
      affectedItems: projectDetail.project.items.filter((item) => affectedItemIds.has(item.id)),
      project: projectDetail.project,
      summary: projectDetail.summary
    };
  });
}

export async function importProjectExcel(
  userId: string,
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
) {
  return withTransaction(async (db) => {
    await getProjectRowForUser(userId, projectId, db);
    if (!payload.rows.length) {
      throw new ApiServiceError(400, "missing_excel_rows", "Excel 导入数据不能为空。");
    }

    const excelAssetId = await insertAsset(
      {
        ownerUserId: userId,
        projectId,
        assetType: "excel",
        fileName: payload.fileName?.trim() || "records.xlsx",
        fileExt: "xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storageKey: payload.fileName?.trim() || "records.xlsx",
        status: "ready"
      },
      db
    );

    const batchInsert = await execute<{ id: string }>(
      db,
      `
        INSERT INTO import_batches (
          project_id,
          excel_asset_id,
          import_status,
          total_rows,
          success_rows,
          failed_rows,
          summary_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'parsing', $3, 0, 0, NULL, NOW(), NOW())
        RETURNING id
      `,
      [projectId, excelAssetId, payload.rows.length]
    );
    const batchId = String(batchInsert.rows[0].id);

    let updatedCount = 0;
    let createdCount = 0;
    let successRows = 0;
    let failedRows = 0;

    for (let index = 0; index < payload.rows.length; index += 1) {
      const row = payload.rows[index];
      const ringNumber = row.ringNumber?.trim();
      if (!ringNumber) {
        failedRows += 1;
        await execute(
          db,
          `
            INSERT INTO import_rows (
              import_batch_id,
              row_no,
              ring_no,
              parsed_data,
              row_status,
              error_message,
              project_item_id,
              created_at,
              updated_at
            )
            VALUES ($1, $2, NULL, $3::jsonb, 'failed', $4, NULL, NOW(), NOW())
          `,
          [batchId, index + 1, JSON.stringify(row), "缺少足环号"]
        );
        continue;
      }

      const existing = await execute<{ id: string }>(
        db,
        "SELECT id FROM project_items WHERE project_id = $1 AND ring_no = $2 LIMIT 1",
        [projectId, ringNumber]
      );

      const projectItemId = await createOrUpdateProjectItem(
        projectId,
        ringNumber,
        {
          sex: row.gender?.trim() || undefined,
          breederName: row.owner?.trim() || undefined,
          region: row.region?.trim() || undefined,
          otherNote: row.note?.trim() || undefined,
          sideSource: "excel"
        },
        db
      );

      await upsertPrimaryPerformance(
        projectItemId,
        {
          raceRank: row.raceRank?.trim() || undefined,
          windSpeed: row.windSpeed?.trim() || undefined,
          basketCount: row.basketCount?.trim() || undefined,
          note: row.note?.trim() || undefined,
          sourceType: "excel"
        },
        db
      );

      await execute(
        db,
        `
          INSERT INTO import_rows (
            import_batch_id,
            row_no,
            ring_no,
            parsed_data,
            row_status,
            error_message,
            project_item_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, 'success', NULL, $5, NOW(), NOW())
        `,
        [batchId, index + 1, ringNumber, JSON.stringify(row), projectItemId]
      );

      if (existing.rows[0]) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
      successRows += 1;
    }

    await execute(
      db,
      `
        UPDATE import_batches
        SET
          import_status = $2,
          success_rows = $3,
          failed_rows = $4,
          summary_json = $5::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        batchId,
        failedRows ? (successRows ? "partial_success" : "failed") : "success",
        successRows,
        failedRows,
        JSON.stringify({
          updatedCount,
          createdCount,
          ignoredCount: payload.rows.length - updatedCount - createdCount - failedRows
        })
      ]
    );

    const projectDetail = await getProjectDetail(userId, projectId);
    return {
      project: projectDetail.project,
      summary: projectDetail.summary,
      importSummary: {
        totalRows: payload.rows.length,
        updatedCount,
        createdCount,
        ignoredCount: payload.rows.length - updatedCount - createdCount - failedRows
      }
    };
  });
}

export async function listProjectItems(
  userId: string,
  projectId: string,
  filters?: {
    status?: RecordStatus;
    keyword?: string;
  }
): Promise<ItemsPayload> {
  await getProjectRowForUser(userId, projectId);
  let items = (await listProjectItemRows(projectId)).map(mapProjectItemRow);
  if (filters?.status) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters?.keyword?.trim()) {
    const keyword = filters.keyword.trim().toLowerCase();
    items = items.filter((item) =>
      [item.ringNumber, item.owner, item.region, item.raceRank, item.note].join(" ").toLowerCase().includes(keyword)
    );
  }
  return {
    items,
    total: items.length
  };
}

export async function updateProjectItem(
  userId: string,
  projectId: string,
  itemId: string,
  payload: Partial<ProjectItem> & {
    applyFieldsToAll?: boolean;
    sharedFields?: Array<"owner" | "region" | "raceRank" | "windSpeed" | "basketCount" | "note">;
  }
) {
  return withTransaction(async (db) => {
    await getProjectRowForUser(userId, projectId, db);
    const itemResult = await execute<{ id: string }>(
      db,
      "SELECT id FROM project_items WHERE id = $1 AND project_id = $2 LIMIT 1",
      [itemId, projectId]
    );
    if (!itemResult.rows[0]) {
      throw new ApiServiceError(404, "item_not_found", "记录不存在。");
    }

    const updateIds = [itemId];
    if (payload.applyFieldsToAll && payload.sharedFields?.length) {
      const rows = await execute<{ id: string }>(db, "SELECT id FROM project_items WHERE project_id = $1", [projectId]);
      updateIds.splice(0, updateIds.length, ...rows.rows.map((row) => String(row.id)));
    }

    for (const targetId of updateIds) {
      await execute(
        db,
        `
          UPDATE project_items
          SET
            sex = COALESCE($2, sex),
            breeder_name = COALESCE($3, breeder_name),
            region = COALESCE($4, region),
            other_note = COALESCE($5, other_note),
            eye_side_auto = COALESCE($6, eye_side_auto),
            body_side_auto = COALESCE($7, body_side_auto),
            eye_side_final = COALESCE($8, eye_side_final),
            side_source = COALESCE($9, side_source),
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          targetId,
          targetId === itemId ? payload.gender ?? null : null,
          payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("owner") ? null : payload.owner ?? null,
          payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("region") ? null : payload.region ?? null,
          payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("note") ? null : payload.note ?? null,
          targetId === itemId ? mapCnSide(payload.eyeDirectionAuto) : null,
          targetId === itemId ? mapCnSide(payload.bodyDirectionFinal ?? payload.bodyDirectionAuto) : null,
          targetId === itemId ? mapCnSide(payload.eyeDirectionFinal) : null,
          targetId === itemId && payload.eyeDirectionFinal ? "manual" : null
        ]
      );

      if (
        payload.raceRank !== undefined ||
        payload.windSpeed !== undefined ||
        payload.basketCount !== undefined ||
        payload.note !== undefined
      ) {
        await upsertPrimaryPerformance(
          targetId,
          {
            raceRank:
              payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("raceRank")
                ? undefined
                : payload.raceRank,
            windSpeed:
              payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("windSpeed")
                ? undefined
                : payload.windSpeed,
            basketCount:
              payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("basketCount")
                ? undefined
                : payload.basketCount,
            note:
              payload.applyFieldsToAll && targetId !== itemId && !payload.sharedFields?.includes("note")
                ? undefined
                : payload.note,
            sourceType: "manual"
          },
          db
        );
      }
    }

    const projectDetail = await getProjectDetail(userId, projectId);
    const item = projectDetail.project.items.find((entry) => entry.id === itemId);
    if (!item) {
      throw new ApiServiceError(404, "item_not_found", "记录不存在。");
    }
    return {
      item,
      summary: projectDetail.summary
    };
  });
}

export async function retryProjectItem(userId: string, projectId: string, itemId: string) {
  return withTransaction(async (db) => {
    await getProjectRowForUser(userId, projectId, db);
    const items = await listProjectItemRows(projectId, db);
    const row = items.find((entry) => String(entry.id) === itemId);
    if (!row) {
      throw new ApiServiceError(404, "item_not_found", "记录不存在。");
    }
    const item = mapProjectItemRow(row);
    const success = item.status === "success";

    await writeProcessingJob(
      projectId,
      userId,
      {
        totalItems: 1,
        successItems: success ? 1 : 0,
        failedItems: success ? 0 : 1,
        status: success ? "success" : "failed",
        itemEntries: [
          {
            projectItemId: itemId,
            itemStatus: success ? "success" : "failed",
            eyeCropStatus: item.eyeImageSrc ? "success" : "failed",
            bodyCropStatus: item.bodyImageSrc ? "success" : "failed",
            eyeSideStatus: item.eyeImageSrc ? "success" : "failed",
            bodySideStatus: item.bodyImageSrc ? "success" : "failed",
            errorMessage: success ? undefined : item.failureReason
          }
        ]
      },
      db
    );

    return {
      item,
      retryAccepted: success
    };
  });
}

export async function getEntitlements(userId: string): Promise<EntitlementSnapshot> {
  const account = await buildAccountState(userId);
  const templates = await query<TemplateGroupRow>(
    `
      SELECT
        id,
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      FROM template_groups
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `
  );
  const freeQuota = await getSystemConfigValue("free_daily_limit", 3);
  const watermark = await getSystemConfigValue("watermark_image", { enabled: false, asset_id: null });
  const unlockedTemplateIds = templates.rows
    .filter((template) => account.plan !== "free" || template.permission_type === "free")
    .map((template) => template.code);

  return {
    account,
    availableExportCount:
      account.plan === "monthly"
        ? Number.MAX_SAFE_INTEGER
        : account.plan === "pack"
          ? Math.max(0, account.packCredits)
          : Math.max(0, freeQuota - account.freeUsed),
    freeQuota,
    nextResetAt: getNextResetAt().toISOString(),
    unlockedTemplateIds,
    watermarked: Boolean(watermark?.enabled) && account.plan === "free"
  };
}

export async function createOrder(userId: string, productId: string) {
  return withTransaction(async (db) => {
    const result = await execute<ProductRow>(
      db,
      `
        SELECT
          id,
          code,
          name,
          product_type,
          price_cents,
          times_count,
          duration_days,
          status,
          sort_order,
          created_at,
          updated_at
        FROM products
        WHERE (code = $1 OR id::text = $1) AND status = 'active'
        LIMIT 1
      `,
      [productId]
    );

    const product = result.rows[0];
    if (!product) {
      throw new ApiServiceError(404, "product_not_found", "商品不存在。");
    }

    const orderNo = `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    const inserted = await execute<OrderRow>(
      db,
      `
        INSERT INTO orders (
          order_no,
          user_id,
          product_id,
          order_type,
          amount_cents,
          status,
          paid_at,
          expired_at,
          remark,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', NULL, NOW() + INTERVAL '15 minutes', NULL, NOW(), NOW())
        RETURNING
          id,
          order_no,
          user_id,
          product_id,
          order_type,
          amount_cents,
          status,
          paid_at,
          expired_at,
          remark,
          created_at,
          updated_at,
          $6::text AS product_code,
          $7::text AS product_name,
          $8::text AS product_type,
          $9::int AS times_count,
          $10::int AS duration_days
      `,
      [
        orderNo,
        userId,
        product.id,
        product.product_type,
        product.price_cents,
        product.code,
        product.name,
        product.product_type,
        product.times_count,
        product.duration_days
      ]
    );

    return mapOrderRowToPaymentOrder(inserted.rows[0]);
  });
}

export async function getOrder(userId: string, orderId: string) {
  const result = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.order_no,
        o.user_id,
        o.product_id,
        o.order_type,
        o.amount_cents,
        o.status,
        o.paid_at,
        o.expired_at,
        o.remark,
        o.created_at,
        o.updated_at,
        p.code AS product_code,
        p.name AS product_name,
        p.product_type,
        p.times_count,
        p.duration_days
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.id = $1 AND o.user_id = $2
      LIMIT 1
    `,
    [orderId, userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiServiceError(404, "order_not_found", "订单不存在。");
  }
  return mapOrderRowToPaymentOrder(row);
}

export async function listUserOrders(userId: string) {
  const result = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.order_no,
        o.user_id,
        o.product_id,
        o.order_type,
        o.amount_cents,
        o.status,
        o.paid_at,
        o.expired_at,
        o.remark,
        o.created_at,
        o.updated_at,
        p.code AS product_code,
        p.name AS product_name,
        p.product_type,
        p.times_count,
        p.duration_days
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC, o.id DESC
    `,
    [userId]
  );
  return result.rows.map(mapOrderRowToPaymentOrder);
}

export async function payOrder(userId: string, orderId: string) {
  return withTransaction(async (db) => {
    const result = await execute<OrderRow>(
      db,
      `
        SELECT
          o.id,
          o.order_no,
          o.user_id,
          o.product_id,
          o.order_type,
          o.amount_cents,
          o.status,
          o.paid_at,
          o.expired_at,
          o.remark,
          o.created_at,
          o.updated_at,
          p.code AS product_code,
          p.name AS product_name,
          p.product_type,
          p.times_count,
          p.duration_days
        FROM orders o
        JOIN products p ON p.id = o.product_id
        WHERE o.id = $1 AND o.user_id = $2
        LIMIT 1
      `,
      [orderId, userId]
    );

    const order = result.rows[0];
    if (!order) {
      throw new ApiServiceError(404, "order_not_found", "订单不存在。");
    }

    if (order.status !== "paid") {
      await execute(
        db,
        `
          UPDATE orders
          SET status = 'paid', paid_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [orderId]
      );
      await execute(
        db,
        `
          INSERT INTO order_payments (
            order_id,
            provider,
            provider_trade_no,
            pay_status,
            raw_callback,
            callback_at,
            created_at,
            updated_at
          )
          VALUES ($1, 'manual', NULL, 'success', NULL, NOW(), NOW(), NOW())
        `,
        [orderId]
      );

      const entitlement = await ensureUserEntitlement(userId, db);
      const currentExpiry = entitlement.monthly_expire_at ? new Date(entitlement.monthly_expire_at).getTime() : 0;
      const now = Date.now();

      let monthlyActive = entitlement.monthly_active;
      let monthlyExpireAt = entitlement.monthly_expire_at ? new Date(entitlement.monthly_expire_at) : null;
      let timesCardBalance = entitlement.times_card_balance;

      if (order.product_type === "times_card") {
        timesCardBalance += order.times_count ?? 0;
      }
      if (order.product_type === "monthly") {
        monthlyActive = true;
        const baseTime = Math.max(now, currentExpiry);
        monthlyExpireAt = new Date(baseTime + (order.duration_days ?? 30) * 24 * 60 * 60 * 1000);
      }

      const nextPlan =
        monthlyActive && monthlyExpireAt && monthlyExpireAt.getTime() > now
          ? "monthly"
          : timesCardBalance > 0
            ? "times_card"
            : "free";

      await execute(
        db,
        `
          UPDATE user_entitlements
          SET
            current_plan = $2,
            monthly_active = $3,
            monthly_expire_at = $4,
            times_card_balance = $5,
            last_effective_order_id = $6,
            updated_at = NOW()
          WHERE user_id = $1
        `,
        [
          userId,
          nextPlan,
          monthlyActive,
          monthlyExpireAt?.toISOString() ?? null,
          timesCardBalance,
          orderId
        ]
      );
    }

    return {
      order: await getOrder(userId, orderId),
      entitlement: await getEntitlements(userId)
    };
  });
}

export async function listAdminUsers() {
  const result = await query<UserRow>(
    `
      SELECT id, phone, nickname, avatar_url, status, last_login_at, created_at, updated_at
      FROM users
      ORDER BY created_at DESC, id DESC
    `
  );

  return Promise.all(
    result.rows.map(async (row) => {
      const account = await buildAccountState(String(row.id));
      const projectCount = await getProjectCount(String(row.id));
      const activeProjectId = await getActiveProjectId(String(row.id));
      const latestProject = await query<{ updated_at: Date | string }>(
        `
          SELECT updated_at
          FROM projects
          WHERE user_id = $1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `,
        [row.id]
      );

      return {
        ...mapUserRowToApiUser(row),
        nickname: row.nickname?.trim() || undefined,
        avatarUrl: row.avatar_url ?? undefined,
        status: row.status,
        updatedAt: toIsoString(row.updated_at),
        projectCount,
        activeProjectId,
        account,
        effectivePlan: account.plan,
        latestProjectUpdatedAt: toIsoString(latestProject.rows[0]?.updated_at)
      };
    })
  );
}

export async function listAdminOrders() {
  const result = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.order_no,
        o.user_id,
        o.product_id,
        o.order_type,
        o.amount_cents,
        o.status,
        o.paid_at,
        o.expired_at,
        o.remark,
        o.created_at,
        o.updated_at,
        p.code AS product_code,
        p.name AS product_name,
        p.product_type,
        p.times_count,
        p.duration_days
      FROM orders o
      JOIN products p ON p.id = o.product_id
      ORDER BY o.created_at DESC, o.id DESC
    `
  );
  return result.rows.map(mapOrderRowToPaymentOrder);
}

export async function listAdminTemplates() {
  const result = await query<TemplateGroupRow>(
    `
      SELECT
        id,
        code,
        name,
        permission_type,
        cover_url,
        description,
        status,
        sort_order,
        created_at,
        updated_at
      FROM template_groups
      ORDER BY sort_order ASC, id ASC
    `
  );
  return result.rows.map((row, index) => buildTemplateFromRow(row, index));
}

export async function updateAdminTemplate(
  templateId: string,
  payload: Partial<{
    name: string;
    description: string;
    tier: "free" | "paid";
    accent: string;
    enabled: boolean;
    sortOrder: number;
  }>
) {
  return withTransaction(async (db) => {
    const current = await getTemplateGroupByIdentifier(templateId, db);
    if (!current) {
      throw new ApiServiceError(404, "template_not_found", "模板不存在。");
    }

    await execute(
      db,
      `
        UPDATE template_groups
        SET
          name = $2,
          description = $3,
          permission_type = $4,
          status = $5,
          sort_order = $6,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        current.id,
        payload.name ?? current.name,
        payload.description ?? current.description,
        payload.tier ?? current.permission_type,
        payload.enabled === undefined ? current.status : payload.enabled ? "active" : "inactive",
        payload.sortOrder ?? current.sort_order
      ]
    );

    const updated = await getTemplateGroupByIdentifier(templateId, db);
    if (!updated) {
      throw new ApiServiceError(404, "template_not_found", "模板不存在。");
    }
    const templates = await listAdminTemplates();
    const template = templates.find((entry) => entry.id === updated.code);
    if (!template) {
      throw new ApiServiceError(404, "template_not_found", "模板不存在。");
    }
    return template;
  });
}

export async function getAdminConfig() {
  const freeDailyQuota = await getSystemConfigValue("free_daily_limit", 3);
  const watermarkImage = await getSystemConfigValue("watermark_image", {
    enabled: false,
    asset_id: null
  });
  const uploadNamingRules = await getSystemConfigValue<string[]>("upload_naming_rules", []);
  const uploadTips = await getSystemConfigValue<string[]>("upload_tips", []);

  return {
    freeDailyQuota,
    watermarkOnFree: Boolean(watermarkImage?.enabled),
    uploadNamingRules,
    uploadTips
  } satisfies AdminConfig;
}

export async function updateAdminConfig(
  payload: Partial<{
    freeDailyQuota: number;
    watermarkOnFree: boolean;
    uploadNamingRules: string[];
    uploadTips: string[];
  }>,
  adminUserId?: string
) {
  return withTransaction(async (db) => {
    if (payload.freeDailyQuota !== undefined) {
      await upsertSystemConfig("free_daily_limit", payload.freeDailyQuota, "免费每日额度", adminUserId, db);
    }
    if (payload.watermarkOnFree !== undefined) {
      const current = await getSystemConfigValue("watermark_image", {
        enabled: false,
        asset_id: null
      }, db);
      await upsertSystemConfig(
        "watermark_image",
        {
          ...current,
          enabled: payload.watermarkOnFree
        },
        "免费导出水印配置",
        adminUserId,
        db
      );
    }
    if (payload.uploadNamingRules !== undefined) {
      await upsertSystemConfig("upload_naming_rules", payload.uploadNamingRules, "上传命名规则", adminUserId, db);
    }
    if (payload.uploadTips !== undefined) {
      await upsertSystemConfig("upload_tips", payload.uploadTips, "上传提示语", adminUserId, db);
    }
    return getAdminConfig();
  });
}

export async function exportProjectRecords(
  userId: string,
  projectId: string,
  payload: Partial<{
    itemIds: string[];
    format: ExportFormat;
  }>
) {
  return withTransaction(async (db) => {
    const project = await getProjectDetail(userId, projectId);
    const selectedItems = payload.itemIds?.length
      ? project.project.items.filter((item) => payload.itemIds?.includes(item.id))
      : project.project.items.filter((item) => item.status === "success");

    if (!selectedItems.length) {
      throw new ApiServiceError(400, "no_exportable_items", "没有可导出的成功记录。");
    }
    if (selectedItems.some((item) => item.status !== "success")) {
      throw new ApiServiceError(400, "export_contains_failed_records", "仅支持导出处理成功的记录。");
    }

    const entitlement = await getEntitlements(userId);
    if (entitlement.availableExportCount !== Number.MAX_SAFE_INTEGER && selectedItems.length > entitlement.availableExportCount) {
      throw new ApiServiceError(403, "insufficient_entitlement", "剩余导出次数不足。", {
        remaining: entitlement.availableExportCount,
        requested: selectedItems.length
      });
    }

    const format = payload.format ?? "png";
    const watermarked = entitlement.watermarked;
    const batchInsert = await execute<{ id: string }>(
      db,
      `
        INSERT INTO generation_batches (
          project_id,
          generate_mode,
          output_format,
          total_items,
          success_items,
          failed_items,
          status,
          triggered_by,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $4, 0, 'success', $5, NOW(), NOW()
        )
        RETURNING id
      `,
      [projectId, selectedItems.length === 1 ? "single" : "batch", format === "zip" ? "jpg" : format, selectedItems.length, userId]
    );
    const generationBatchId = String(batchInsert.rows[0].id);

    const account = await buildAccountState(userId, db);
    const entitlementRow = await ensureUserEntitlement(userId, db);
    const quotaRow = await ensureQuotaDailyUsage(userId, entitlementRow.free_daily_limit, db);

    if (account.plan === "free") {
      await execute(
        db,
        `
          UPDATE quota_daily_usage
          SET used_count = used_count + $3, updated_at = NOW()
          WHERE user_id = $1 AND business_date = $2::date
        `,
        [userId, quotaRow.business_date, selectedItems.length]
      );
    } else if (account.plan === "pack") {
      await execute(
        db,
        `
          UPDATE user_entitlements
          SET times_card_balance = GREATEST(0, times_card_balance - $2), updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, selectedItems.length]
      );
    }

    for (const item of selectedItems) {
      const outputAssetId = await insertAsset(
        {
          ownerUserId: userId,
          projectId,
          assetType: "output",
          fileName: `${item.ringNumber}.${format === "zip" ? "jpg" : format}`,
          fileExt: format === "zip" ? "jpg" : format,
          mimeType: `image/${format === "jpg" ? "jpeg" : "png"}`,
          storageKey: `/generated/${projectId}/${item.id}/${Date.now()}.${format === "zip" ? "jpg" : format}`,
          status: "ready"
        },
        db
      );

      const generationItem = await execute<{ id: string }>(
        db,
        `
          INSERT INTO generation_items (
            generation_batch_id,
            project_item_id,
            template_variant_id,
            item_status,
            output_asset_id,
            preview_asset_id,
            watermarked,
            quota_source,
            error_message,
            created_at,
            updated_at
          )
          VALUES ($1, $2, NULL, 'success', $3, NULL, $4, $5, NULL, NOW(), NOW())
          RETURNING id
        `,
        [
          generationBatchId,
          item.id,
          outputAssetId,
          watermarked,
          account.plan === "pack" ? "times_card" : account.plan
        ]
      );

      await execute(
        db,
        `
          INSERT INTO generated_outputs (
            generation_item_id,
            output_type,
            asset_id,
            download_count,
            last_download_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 0, NULL, NOW(), NOW())
        `,
        [generationItem.rows[0].id, format === "zip" ? "zip_package" : "single_file", outputAssetId]
      );
    }

    const refreshed = await getProjectDetail(userId, projectId);
    const nextEntitlement = await getEntitlements(userId);
    const ticket: ProjectExportTicket = {
      id: generationBatchId,
      projectId,
      itemIds: selectedItems.map((item) => item.id),
      format,
      watermarked,
      downloadUrl: `https://download.local/projects/${projectId}/exports/${generationBatchId}`,
      createdAt: new Date().toISOString()
    };

    return {
      ticket,
      summary: refreshed.summary,
      entitlement: nextEntitlement
    };
  });
}

export async function listProjectJobs(userId: string, projectId: string): Promise<ProcessingJob[]> {
  await getProjectRowForUser(userId, projectId);
  const result = await query<ProcessingJobRow>(
    `
      SELECT
        id,
        project_id,
        job_type,
        status,
        total_items,
        success_items,
        failed_items,
        created_at,
        updated_at
      FROM processing_jobs
      WHERE project_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [projectId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    type: row.job_type === "process_assets" ? "eye-cutout" : "export",
    status:
      row.status === "success"
        ? "succeeded"
        : row.status === "failed"
          ? "failed"
          : row.status === "running"
            ? "running"
            : "queued",
    attemptCount: 1,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString()
  }));
}
