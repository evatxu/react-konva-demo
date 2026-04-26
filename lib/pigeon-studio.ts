export type AccountPlan = "free" | "pack" | "monthly";
export type TemplateTier = "free" | "paid";
export type WorkspaceTab = "upload" | "edit" | "export";
export type UploadKind = "eye" | "body" | "sheet" | "archive" | "unknown";
export type UploadStatus = "success" | "failed";
export type RecordStatus = "success" | "processing" | "failed";
export type ExportStatus = "idle" | "exported" | "failed";
export type ExportFormat = "png" | "jpg" | "zip";

export interface PosterTemplate {
  id: string;
  name: string;
  tier: TemplateTier;
  description: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  backgroundFrom: string;
  backgroundTo: string;
  surface: string;
  frame: string;
}

export interface ProjectFields {
  title: string;
  subtitle: string;
  contactName: string;
  phone: string;
  wechat: string;
  logoSrc?: string;
  qrCodeSrc?: string;
}

export interface UploadedAsset {
  id: string;
  name: string;
  kind: UploadKind;
  status: UploadStatus;
  note: string;
}

export interface ProjectItem {
  id: string;
  ringNumber: string;
  eyeDirectionAuto: "左" | "右" | "居中";
  eyeDirectionFinal: "左" | "右" | "居中";
  bodyDirectionAuto: "左" | "右" | "居中";
  bodyDirectionFinal: "左" | "右" | "居中";
  eyeImageSrc?: string;
  bodyImageSrc?: string;
  gender: string;
  owner: string;
  region: string;
  raceRank: string;
  windSpeed: string;
  basketCount: string;
  note: string;
  status: RecordStatus;
  failureReason?: string;
  exportStatus: ExportStatus;
  lastExportedAt?: string;
  exportedSignatures: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  templateId: string;
  fields: ProjectFields;
  uploadedAssets: UploadedAsset[];
  items: ProjectItem[];
  activeItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  amountLabel: string;
  status: "pending" | "paid";
  createdAt: string;
  paidAt?: string;
}

export interface AccountState {
  plan: AccountPlan;
  freeUsed: number;
  freeWindowKey: string;
  packCredits: number;
  monthlyExpiresAt?: string;
  orders: Order[];
}

export interface WorkspaceState {
  account: AccountState;
  projects: Project[];
  activeProjectId: string | null;
}

export interface ProductOption {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  kind: "pack" | "monthly";
  credits?: number;
  days?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createEyeSvg(accent: string, ringNumber: string) {
  return svgToDataUrl(`
    <svg width="900" height="900" viewBox="0 0 900 900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="iris" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#fffce4" />
          <stop offset="30%" stop-color="#ffc85b" />
          <stop offset="68%" stop-color="${accent}" />
          <stop offset="100%" stop-color="#2a1610" />
        </radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#502616" flood-opacity="0.18" />
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <ellipse cx="450" cy="450" rx="340" ry="272" fill="#f8e3cb" />
        <ellipse cx="450" cy="450" rx="286" ry="222" fill="url(#iris)" />
        <circle cx="450" cy="450" r="102" fill="#111217" />
        <circle cx="392" cy="388" r="42" fill="#ffffff" opacity="0.94" />
        <circle cx="326" cy="326" r="18" fill="#ffffff" opacity="0.74" />
        <ellipse cx="448" cy="448" rx="362" ry="290" fill="none" stroke="#8f3f18" stroke-width="12" opacity="0.6" />
      </g>
      <text x="450" y="812" fill="#7b3b1d" text-anchor="middle" font-size="46" font-family="PingFang SC, Microsoft YaHei, sans-serif">${ringNumber}</text>
    </svg>
  `);
}

function createBodySvg(accent: string, ringNumber: string) {
  return svgToDataUrl(`
    <svg width="900" height="1200" viewBox="0 0 900 1200" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="456" cy="638" rx="222" ry="344" fill="#2b2f36" />
      <ellipse cx="410" cy="642" rx="150" ry="286" fill="#818792" />
      <ellipse cx="564" cy="518" rx="118" ry="170" fill="#4a4f56" />
      <path d="M356 490C430 440 538 452 594 520C522 562 442 598 370 626C336 582 334 536 356 490Z" fill="#f0f2f4" />
      <path d="M386 350C414 258 530 234 600 286C554 334 516 380 494 456C438 442 400 410 386 350Z" fill="#f8fbff" />
      <path d="M500 286C566 246 642 266 700 334C628 368 566 408 534 470C496 434 482 350 500 286Z" fill="${accent}" opacity="0.95" />
      <circle cx="590" cy="318" r="22" fill="#15171b" />
      <path d="M676 330L776 362L684 414Z" fill="#ef996f" />
      <path d="M224 798C184 926 214 1024 294 1122" fill="none" stroke="#6c727c" stroke-width="34" stroke-linecap="round" />
      <path d="M332 844C300 990 330 1076 392 1154" fill="none" stroke="#4e5560" stroke-width="28" stroke-linecap="round" />
      <path d="M504 800C676 760 786 676 814 574" fill="none" stroke="#1f232a" stroke-width="18" stroke-linecap="round" opacity="0.82" />
      <text x="450" y="1136" fill="#6a2c21" text-anchor="middle" font-size="50" font-family="PingFang SC, Microsoft YaHei, sans-serif">${ringNumber}</text>
    </svg>
  `);
}

function createLogoSvg(accent: string) {
  return svgToDataUrl(`
    <svg width="240" height="240" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <rect width="240" height="240" rx="48" fill="${accent}" />
      <path d="M54 130C70 74 128 50 172 70C146 90 128 118 124 154C100 154 74 144 54 130Z" fill="#fff4d1" />
      <path d="M74 154C106 110 162 106 196 134C160 146 130 168 112 198C96 188 84 174 74 154Z" fill="#ffffff" opacity="0.92" />
    </svg>
  `);
}

function createQrSvg(accent: string) {
  return svgToDataUrl(`
    <svg width="280" height="280" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
      <rect width="280" height="280" rx="28" fill="#ffffff" />
      <rect x="24" y="24" width="76" height="76" rx="12" fill="${accent}" />
      <rect x="180" y="24" width="76" height="76" rx="12" fill="${accent}" />
      <rect x="24" y="180" width="76" height="76" rx="12" fill="${accent}" />
      <g fill="#1c1c1c">
        <rect x="124" y="34" width="18" height="18" rx="4" />
        <rect x="154" y="34" width="18" height="18" rx="4" />
        <rect x="124" y="64" width="18" height="18" rx="4" />
        <rect x="154" y="64" width="18" height="18" rx="4" />
        <rect x="124" y="124" width="18" height="18" rx="4" />
        <rect x="154" y="124" width="18" height="18" rx="4" />
        <rect x="184" y="124" width="18" height="18" rx="4" />
        <rect x="214" y="124" width="18" height="18" rx="4" />
        <rect x="124" y="154" width="18" height="18" rx="4" />
        <rect x="184" y="154" width="18" height="18" rx="4" />
        <rect x="214" y="154" width="18" height="18" rx="4" />
        <rect x="124" y="184" width="18" height="18" rx="4" />
        <rect x="154" y="184" width="18" height="18" rx="4" />
        <rect x="214" y="184" width="18" height="18" rx="4" />
        <rect x="124" y="214" width="18" height="18" rx="4" />
        <rect x="154" y="214" width="18" height="18" rx="4" />
        <rect x="184" y="214" width="18" height="18" rx="4" />
      </g>
    </svg>
  `);
}

export const TEMPLATE_OPTIONS: PosterTemplate[] = [
  {
    id: "classic-free",
    name: "竞技旗舰版",
    tier: "free",
    description: "红白竞技风格，突出冠军带与三段赛绩信息。",
    accent: "#d7271f",
    accentSoft: "#fff0eb",
    accentText: "#c42a22",
    backgroundFrom: "#fffdfc",
    backgroundTo: "#f7f0ee",
    surface: "#ffffff",
    frame: "#f4c7bf"
  },
  {
    id: "public-spotlight",
    name: "公棚名鸽占位",
    tier: "paid",
    description: "蓝灰数据分栏，更适合公棚成绩展示。",
    accent: "#2d65c8",
    accentSoft: "#edf4ff",
    accentText: "#2d65c8",
    backgroundFrom: "#fbfdff",
    backgroundTo: "#eef4fb",
    surface: "#ffffff",
    frame: "#cadeff"
  },
  {
    id: "medal-night",
    name: "冠军归巢版",
    tier: "paid",
    description: "黑灰叠层与红色焦点，适合高对比海报。",
    accent: "#be2d2f",
    accentSoft: "#fff0f0",
    accentText: "#a11f22",
    backgroundFrom: "#fcfcfd",
    backgroundTo: "#eff1f5",
    surface: "#ffffff",
    frame: "#d7dbe5"
  },
  {
    id: "violet-archive",
    name: "收藏差旅版",
    tier: "paid",
    description: "紫色边框与留白结构，适合品牌收藏系列。",
    accent: "#7a58c9",
    accentSoft: "#f3edff",
    accentText: "#6b4dbe",
    backgroundFrom: "#fdfcff",
    backgroundTo: "#f2eefb",
    surface: "#ffffff",
    frame: "#ddd0fb"
  },
  {
    id: "velocity-amber",
    name: "极速先锋版",
    tier: "paid",
    description: "橙金奖牌栏，适合赛事专题连续输出。",
    accent: "#db8a18",
    accentSoft: "#fff4df",
    accentText: "#ba6f0c",
    backgroundFrom: "#fffdf9",
    backgroundTo: "#fbf3e7",
    surface: "#ffffff",
    frame: "#f3d5a0"
  }
];

export const PRODUCT_OPTIONS: ProductOption[] = [
  {
    id: "pack-10",
    name: "10 次导出卡",
    description: "不限制过期时间，可导出多条成功记录，可用全部模板。",
    priceLabel: "¥99",
    kind: "pack",
    credits: 10
  },
  {
    id: "pack-30",
    name: "30 次导出卡",
    description: "适合频繁批量导出，剩余次数不足时按条数控制。",
    priceLabel: "¥269",
    kind: "pack",
    credits: 30
  },
  {
    id: "monthly-30d",
    name: "月付专业版",
    description: "30 天内不限导出张数，可用全部模板且无水印。",
    priceLabel: "¥399",
    kind: "monthly",
    days: 30
  }
];

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + BEIJING_OFFSET_MS);
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getBusinessWindowKey(date = new Date()) {
  const beijing = getBeijingDate(date);
  const inBusinessDate = beijing.getUTCHours() < 4 ? new Date(beijing.getTime() - DAY_MS) : beijing;
  return formatDateKey(inBusinessDate);
}

export function getNextResetAt(date = new Date()) {
  const beijing = getBeijingDate(date);
  const year = beijing.getUTCFullYear();
  const month = beijing.getUTCMonth();
  const day = beijing.getUTCDate();
  const targetDay = beijing.getUTCHours() >= 4 ? day + 1 : day;
  return new Date(Date.UTC(year, month, targetDay, -4, 0, 0, 0));
}

export function formatBeijingDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function syncAccountByBusinessWindow(account: AccountState, now = new Date()) {
  const windowKey = getBusinessWindowKey(now);
  if (account.freeWindowKey === windowKey) {
    return account;
  }
  return {
    ...account,
    freeWindowKey: windowKey,
    freeUsed: 0
  };
}

export function resolvePlan(account: AccountState, now = new Date()): AccountPlan {
  if (account.plan === "monthly" && account.monthlyExpiresAt) {
    return new Date(account.monthlyExpiresAt).getTime() > now.getTime() ? "monthly" : "free";
  }
  return account.plan;
}

export function shouldApplyWatermark(account: AccountState, now = new Date()) {
  return resolvePlan(syncAccountByBusinessWindow(account, now), now) === "free";
}

export function canUsePaidTemplates(account: AccountState, now = new Date()) {
  return resolvePlan(syncAccountByBusinessWindow(account, now), now) !== "free";
}

export function getAvailableExportCount(account: AccountState, now = new Date()) {
  const synced = syncAccountByBusinessWindow(account, now);
  const plan = resolvePlan(synced, now);

  if (plan === "free") {
    return Math.max(0, 3 - synced.freeUsed);
  }
  if (plan === "pack") {
    return Math.max(0, synced.packCredits);
  }
  return Number.POSITIVE_INFINITY;
}

export function getPlanLabel(plan: AccountPlan) {
  switch (plan) {
    case "free":
      return "免费版";
    case "pack":
      return "次卡版";
    case "monthly":
      return "月付版";
  }
}

export function getTemplateById(templateId: string) {
  return TEMPLATE_OPTIONS.find((template) => template.id === templateId) ?? TEMPLATE_OPTIONS[0];
}

export function buildRecordStatus(item: Pick<ProjectItem, "eyeImageSrc" | "bodyImageSrc">) {
  if (item.eyeImageSrc && item.bodyImageSrc) {
    return "success" as const;
  }
  if (item.eyeImageSrc || item.bodyImageSrc) {
    return "processing" as const;
  }
  return "failed" as const;
}

export function normalizeProject(project: Project): Project {
  const activeExists = project.activeItemId && project.items.some((item) => item.id === project.activeItemId);
  return {
    ...project,
    activeItemId: activeExists ? project.activeItemId : project.items[0]?.id ?? null
  };
}

export function getRecordDefaults(ringNumber: string) {
  return {
    gender: "雄",
    owner: "演示鸽舍",
    region: "上海",
    raceRank: "待填写",
    windSpeed: "2.3m/s",
    basketCount: "1280 羽",
    note: `足环 ${ringNumber} 自动生成，可继续微调说明。`
  };
}

function createSampleRecord(
  ringNumber: string,
  accent: string,
  overrides?: Partial<ProjectItem>
): ProjectItem {
  const defaults = getRecordDefaults(ringNumber);
  const nextItem: ProjectItem = {
    id: createId("item"),
    ringNumber,
    eyeDirectionAuto: "左",
    eyeDirectionFinal: "左",
    bodyDirectionAuto: "右",
    bodyDirectionFinal: "右",
    eyeImageSrc: createEyeSvg(accent, ringNumber),
    bodyImageSrc: createBodySvg(accent, ringNumber),
    gender: defaults.gender,
    owner: defaults.owner,
    region: defaults.region,
    raceRank: defaults.raceRank,
    windSpeed: defaults.windSpeed,
    basketCount: defaults.basketCount,
    note: defaults.note,
    status: "success",
    exportStatus: "idle",
    exportedSignatures: [],
    ...overrides
  };

  return {
    ...nextItem,
    status: buildRecordStatus(nextItem),
    failureReason: buildRecordStatus(nextItem) === "failed" ? "素材未匹配成功" : overrides?.failureReason
  };
}

export function createEmptyProjectFields() {
  return {
    title: "赛绩海报",
    subtitle: "鸽眼智能生成演示项目",
    contactName: "高定赛鸽",
    phone: "13800138000",
    wechat: "gaoding-race"
  };
}

export function createInitialWorkspace(): WorkspaceState {
  const template = TEMPLATE_OPTIONS[0];
  const createdAt = new Date().toISOString();
  const projectId = createId("project");
  const fields: ProjectFields = {
    title: "2026 春季竞翔专场",
    subtitle: "鸽眼与外形记录自动生成",
    contactName: "高定鸽业",
    phone: "13800138000",
    wechat: "gaoding-pigeon",
    logoSrc: createLogoSvg(template.accent),
    qrCodeSrc: createQrSvg(template.accent)
  };

  const firstRecord = createSampleRecord("2026-0001", template.accent, {
    owner: "高定鸽业",
    region: "上海浦东",
    raceRank: "300 公里 7 名",
    windSpeed: "顺风 2.1m/s",
    basketCount: "上笼 1520 羽",
    note: "状态良好，鸽眼层次清晰，适合作为主推记录。"
  });
  const secondRecord = createSampleRecord("2026-0002", template.accent, {
    eyeDirectionAuto: "右",
    eyeDirectionFinal: "右",
    bodyDirectionAuto: "左",
    bodyDirectionFinal: "左",
    owner: "华东赛鸽棚",
    region: "江苏南通",
    raceRank: "500 公里 21 名",
    windSpeed: "侧风 3.4m/s",
    basketCount: "上笼 980 羽",
    note: "建议保留原始外形图，以突出羽翼层次。"
  });
  const thirdRecord = createSampleRecord("2026-0003", template.accent, {
    bodyImageSrc: undefined,
    status: "processing",
    exportStatus: "idle",
    failureReason: "缺少外形图，暂不能导出。",
    owner: "海派铭鸽",
    region: "浙江嘉兴",
    raceRank: "等待补录",
    note: "素材处理中，可补充外形图后再次识别。"
  });

  const sampleProject: Project = normalizeProject({
    id: projectId,
    name: "春季赛绩项目",
    description: "演示项目，包含免费模板、处理结果、基础编辑与导出规则。",
    templateId: template.id,
    fields,
    uploadedAssets: [
      {
        id: createId("asset"),
        name: "2026-0001_eye.jpg",
        kind: "eye",
        status: "success",
        note: "已识别为鸽眼图"
      },
      {
        id: createId("asset"),
        name: "2026-0001_body.jpg",
        kind: "body",
        status: "success",
        note: "已识别为外形图"
      },
      {
        id: createId("asset"),
        name: "2026-0002_eye.jpg",
        kind: "eye",
        status: "success",
        note: "已识别为鸽眼图"
      },
      {
        id: createId("asset"),
        name: "2026-0002_body.jpg",
        kind: "body",
        status: "success",
        note: "已识别为外形图"
      },
      {
        id: createId("asset"),
        name: "records.csv",
        kind: "sheet",
        status: "success",
        note: "已回填鸽主、地区和赛绩字段"
      }
    ],
    items: [firstRecord, secondRecord, thirdRecord],
    activeItemId: firstRecord.id,
    createdAt,
    updatedAt: createdAt
  });

  return {
    account: {
      plan: "free",
      freeUsed: 0,
      freeWindowKey: getBusinessWindowKey(),
      packCredits: 0,
      orders: []
    },
    projects: [sampleProject],
    activeProjectId: sampleProject.id
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function buildExportSignature(project: Project, item: ProjectItem, watermarked: boolean) {
  return hashString(
    JSON.stringify({
      templateId: project.templateId,
      fields: project.fields,
      ringNumber: item.ringNumber,
      eyeDirectionFinal: item.eyeDirectionFinal,
      bodyDirectionFinal: item.bodyDirectionFinal,
      eyeImageSrc: item.eyeImageSrc ?? "",
      bodyImageSrc: item.bodyImageSrc ?? "",
      gender: item.gender,
      owner: item.owner,
      region: item.region,
      raceRank: item.raceRank,
      windSpeed: item.windSpeed,
      basketCount: item.basketCount,
      note: item.note,
      watermarked
    })
  );
}
