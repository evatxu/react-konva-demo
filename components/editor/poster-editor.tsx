"use client";

import {
  CreditCard,
  Download,
  FolderKanban,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useState, type ReactNode, type TextareaHTMLAttributes } from "react";

import { AuthModal } from "@/components/auth/auth-modal";
import { ModalShell } from "@/components/shared/modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ApiClientError, apiClient } from "@/lib/api/client";
import type {
  EntitlementSnapshot,
  PaymentOrder,
  ProjectDetailPayload,
  ProjectExportTicket,
  ProjectSummary,
  TemplateRecord,
  UserSessionPayload
} from "@/lib/api/contracts";
import {
  downloadBlob,
  downloadZip,
  exportPosterBlob,
  getExportFileName,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  renderPosterToCanvas
} from "@/lib/poster-renderer";
import {
  TEMPLATE_OPTIONS,
  createEmptyProjectFields,
  getPlanLabel,
  type ExportFormat,
  type ProductOption,
  type Project,
  type ProjectFields,
  type ProjectItem,
  type UploadKind
} from "@/lib/pigeon-studio";
import { cn } from "@/lib/utils";

type TemplateCard = TemplateRecord & { locked: boolean };
type NoticeTone = "info" | "success" | "error";

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

interface ProjectFormState {
  name: string;
  description: string;
  templateId: string;
  fields: ProjectFields;
}

interface ItemFormState {
  gender: string;
  owner: string;
  region: string;
  raceRank: string;
  windSpeed: string;
  basketCount: string;
  note: string;
  eyeDirectionFinal: ProjectItem["eyeDirectionFinal"];
  bodyDirectionFinal: ProjectItem["bodyDirectionFinal"];
}

function emptyProjectForm(templateId?: string): ProjectFormState {
  return {
    name: "新建赛绩项目",
    description: "",
    templateId: templateId ?? TEMPLATE_OPTIONS[0]?.id ?? "",
    fields: createEmptyProjectFields()
  };
}

function createProjectForm(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description,
    templateId: project.templateId,
    fields: { ...project.fields }
  };
}

function createItemForm(item: ProjectItem): ItemFormState {
  return {
    gender: item.gender,
    owner: item.owner,
    region: item.region,
    raceRank: item.raceRank,
    windSpeed: item.windSpeed,
    basketCount: item.basketCount,
    note: item.note,
    eyeDirectionFinal: item.eyeDirectionFinal,
    bodyDirectionFinal: item.bodyDirectionFinal
  };
}

function sortProjectSummaries(projects: ProjectSummary[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function isUnlimitedExport(count?: number) {
  return typeof count === "number" && count >= Number.MAX_SAFE_INTEGER / 2;
}

function formatExportCount(count?: number) {
  if (typeof count !== "number") {
    return "-";
  }
  return isUnlimitedExport(count) ? "∞" : String(count);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "暂无";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid_file_result"));
    };
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
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
  if (!match) {
    return "";
  }
  return match[0].replace(/\s+/g, "-").toUpperCase();
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/, "$1").trim());
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]+/g, "");
}

function findCsvValue(headers: string[], row: string[], aliases: string[]) {
  const aliasesSet = new Set(aliases.map((item) => normalizeCsvHeader(item)));
  const index = headers.findIndex((header) => aliasesSet.has(header));
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function parseCsvRows(text: string) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      ringNumber: findCsvValue(headers, cells, ["ringNumber", "ringNo", "ring_no", "足环号", "足环"]),
      gender: findCsvValue(headers, cells, ["gender", "sex", "性别"]),
      owner: findCsvValue(headers, cells, ["owner", "breeder", "breederName", "鸽主", "鸽主名"]),
      region: findCsvValue(headers, cells, ["region", "地区"]),
      raceRank: findCsvValue(headers, cells, ["raceRank", "成绩", "赛绩", "名次"]),
      windSpeed: findCsvValue(headers, cells, ["windSpeed", "风速"]),
      basketCount: findCsvValue(headers, cells, ["basketCount", "上笼羽数", "上笼"]),
      note: findCsvValue(headers, cells, ["note", "备注", "说明"])
    };
  });
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cn(
        "min-h-[96px] w-full rounded-[22px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...rest}
    />
  );
}

function StatusPill({
  children,
  tone
}: {
  children: ReactNode;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    neutral: "bg-slate-100 text-slate-700"
  }[tone];

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", styles)}>{children}</span>;
}

function NoticeBanner({ notice }: { notice: NoticeState | null }) {
  if (!notice) {
    return null;
  }

  const toneClass = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-rose-200 bg-rose-50 text-rose-800"
  }[notice.tone];

  return <div className={cn("rounded-[22px] border px-4 py-3 text-sm", toneClass)}>{notice.text}</div>;
}

function PosterPreviewCanvas({
  template,
  project,
  item,
  watermarked
}: {
  template: TemplateRecord;
  project: Project;
  item: ProjectItem;
  watermarked: boolean;
}) {
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) {
      return;
    }

    let cancelled = false;
    renderPosterToCanvas(canvas, {
      template,
      projectName: project.name,
      fields: project.fields,
      item,
      watermarked
    })
      .then(() => {
        if (!cancelled) {
          setPreviewError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError("预览渲染失败，请检查素材是否完整。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canvas, item, project.fields, project.name, template, watermarked]);

  return (
    <div className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,#f7fbff_0%,#eef2f9_100%)] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="rounded-[22px] border border-slate-200/80 bg-white p-5">
        <canvas
          ref={setCanvas}
          width={POSTER_WIDTH}
          height={POSTER_HEIGHT}
          className="block h-auto w-full rounded-[16px] bg-white"
          style={{ aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}` }}
        />
      </div>
      {previewError ? <div className="pt-3 text-sm text-rose-600">{previewError}</div> : null}
    </div>
  );
}

function ProjectTemplateCard({
  template,
  selected,
  onSelect
}: {
  template: TemplateCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-[26px] border p-4 text-left transition-all",
        selected ? "border-[#1764ff] bg-[#f4f8ff]" : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <div
        className="h-28 rounded-[20px] border border-white/70"
        style={{
          background: `linear-gradient(135deg, ${template.backgroundFrom} 0%, ${template.backgroundTo} 100%)`
        }}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-slate-900">{template.name}</div>
        <Badge variant={template.tier === "free" ? "secondary" : "accent"}>
          {template.tier === "free" ? "免费" : "付费"}
        </Badge>
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{template.description}</div>
      <div className="mt-3 text-xs text-slate-400">{template.locked ? "当前账号未解锁" : "当前账号可用"}</div>
    </button>
  );
}

function getTemplate(templates: TemplateCard[], templateId?: string | null) {
  return (
    templates.find((template) => template.id === templateId) ??
    (TEMPLATE_OPTIONS.find((template) => template.id === templateId) as TemplateCard | undefined) ??
    templates[0] ??
    (TEMPLATE_OPTIONS[0] as TemplateCard)
  );
}

function getRecordTone(item: ProjectItem) {
  if (item.status === "success") {
    return "success" as const;
  }
  if (item.status === "processing") {
    return "warning" as const;
  }
  return "danger" as const;
}

function getRecordStatusLabel(item: ProjectItem) {
  if (item.status === "success") {
    return "成功";
  }
  if (item.status === "processing") {
    return "处理中";
  }
  return "失败";
}

export default function PosterEditor() {
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [session, setSession] = useState<UserSessionPayload | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectDetail, setActiveProjectDetail] = useState<ProjectDetailPayload | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [createProjectFormState, setCreateProjectFormState] = useState<ProjectFormState>(emptyProjectForm());
  const [projectFormState, setProjectFormState] = useState<ProjectFormState>(emptyProjectForm());
  const [itemFormState, setItemFormState] = useState<ItemFormState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [lastExportTicket, setLastExportTicket] = useState<ProjectExportTicket | null>(null);

  const deferredProjectSearch = useDeferredValue(projectSearch);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const activeProject = activeProjectDetail?.project;
    if (!activeProject) {
      setProjectFormState(emptyProjectForm(templates[0]?.id));
      return;
    }
    setProjectFormState(createProjectForm(activeProject));
  }, [activeProjectDetail?.project, templates]);

  useEffect(() => {
    const activeProject = activeProjectDetail?.project;
    if (!activeProject) {
      setItemFormState(null);
      return;
    }
    const nextItem =
      activeProject.items.find((item) => item.id === selectedItemId) ??
      activeProject.items.find((item) => item.id === activeProject.activeItemId) ??
      activeProject.items[0] ??
      null;

    setSelectedItemId(nextItem?.id ?? null);
    setItemFormState(nextItem ? createItemForm(nextItem) : null);
  }, [activeProjectDetail?.project, selectedItemId]);

  const postNotice = (tone: NoticeTone, text: string) => {
    setNotice({ tone, text });
  };

  const resetPrivateState = () => {
    setSession(null);
    setEntitlements(null);
    setProjects([]);
    setOrders([]);
    setActiveProjectId(null);
    setActiveProjectDetail(null);
    setSelectedItemId(null);
    setItemFormState(null);
    setLastExportTicket(null);
  };

  const handleApiError = (error: unknown, fallbackText: string) => {
    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        resetPrivateState();
        setAuthOpen(true);
        postNotice("error", "当前登录态已失效，请重新登录。");
        return true;
      }
      postNotice("error", error.message);
      return true;
    }
    postNotice("error", fallbackText);
    return false;
  };

  const loadProjectDetail = async (projectId: string) => {
    const detail = await apiClient.projects.detail(projectId);
    setActiveProjectId(projectId);
    setActiveProjectDetail(detail);
    setSelectedItemId(detail.project.activeItemId ?? detail.project.items[0]?.id ?? null);
    setProjects((current) => {
      const next = current.some((item) => item.id === detail.summary.id)
        ? current.map((item) => (item.id === detail.summary.id ? detail.summary : item))
        : [detail.summary, ...current];
      return sortProjectSummaries(next);
    });
    return detail;
  };

  const loadDashboard = async (preferredProjectId?: string | null, initialSession?: UserSessionPayload | null) => {
    setLoading(true);
    try {
      const [templateData, productData] = await Promise.all([apiClient.templates.list(), apiClient.products.list()]);
      setTemplates(templateData);
      setProducts(productData);

      const sessionData = initialSession ?? (await apiClient.auth.session());
      setSession(sessionData);

      const [entitlementData, projectData, orderData] = await Promise.all([
        apiClient.account.entitlements(),
        apiClient.projects.list(),
        apiClient.orders.list()
      ]);

      setEntitlements(entitlementData);
      setProjects(sortProjectSummaries(projectData));
      setOrders(orderData);

      const nextProjectId =
        preferredProjectId ??
        activeProjectId ??
        sessionData.activeProjectId ??
        projectData[0]?.id ??
        null;

      if (nextProjectId) {
        await loadProjectDetail(nextProjectId);
      } else {
        setActiveProjectId(null);
        setActiveProjectDetail(null);
        setSelectedItemId(null);
      }
    } catch (error) {
      if (!(error instanceof ApiClientError && error.status === 401)) {
        handleApiError(error, "工作台初始化失败。");
      } else {
        const [templateData, productData] = await Promise.allSettled([apiClient.templates.list(), apiClient.products.list()]);
        if (templateData.status === "fulfilled") {
          setTemplates(templateData.value);
        }
        if (productData.status === "fulfilled") {
          setProducts(productData.value);
        }
        resetPrivateState();
        setAuthOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const filteredProjects = projects.filter((project) => {
    const keyword = deferredProjectSearch.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    const template = getTemplate(templates, project.templateId);
    return [project.name, project.description, template.name].join(" ").toLowerCase().includes(keyword);
  });

  const activeProject = activeProjectDetail?.project ?? null;
  const activeSummary =
    activeProjectDetail?.summary ?? projects.find((project) => project.id === activeProjectId) ?? null;
  const activeItem =
    activeProject?.items.find((item) => item.id === selectedItemId) ??
    activeProject?.items.find((item) => item.id === activeProject.activeItemId) ??
    activeProject?.items[0] ??
    null;
  const activeTemplate = getTemplate(templates, projectFormState.templateId || activeProject?.templateId);
  const remainingExports = entitlements?.availableExportCount;

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } catch (error) {
      handleApiError(error, "退出失败。");
    } finally {
      resetPrivateState();
      setAuthOpen(true);
    }
  };

  const handleCreateProject = async () => {
    setSavingProject(true);
    try {
      const detail = await apiClient.projects.create(createProjectFormState);
      setCreateProjectOpen(false);
      setCreateProjectFormState(emptyProjectForm(templates[0]?.id));
      setSession((current) =>
        current
          ? {
              ...current,
              activeProjectId: detail.project.id,
              projectCount: current.projectCount + 1
            }
          : current
      );
      await loadProjectDetail(detail.project.id);
      const latestProjects = await apiClient.projects.list();
      setProjects(sortProjectSummaries(latestProjects));
      postNotice("success", "项目已创建，接口数据已同步到工作台。");
    } catch (error) {
      handleApiError(error, "创建项目失败。");
    } finally {
      setSavingProject(false);
    }
  };

  const handleSaveProject = async () => {
    if (!activeProject) {
      return;
    }

    setSavingProject(true);
    try {
      let detail = await apiClient.projects.update(activeProject.id, {
        name: projectFormState.name,
        description: projectFormState.description,
        fields: projectFormState.fields
      });

      if (projectFormState.templateId && projectFormState.templateId !== activeProject.templateId) {
        detail = await apiClient.projects.changeTemplate(activeProject.id, projectFormState.templateId);
      }

      setActiveProjectDetail(detail);
      setProjects((current) => sortProjectSummaries(current.map((project) => (project.id === detail.summary.id ? detail.summary : project))));
      postNotice("success", "项目设置已保存。");
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "template_locked") {
        setAccountOpen(true);
      }
      handleApiError(error, "保存项目失败。");
    } finally {
      setSavingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm("确认删除当前项目？")) {
      return;
    }

    try {
      const result = await apiClient.projects.remove(projectId);
      const nextProjects = sortProjectSummaries(await apiClient.projects.list());
      setProjects(nextProjects);
      setSession((current) =>
        current
          ? {
              ...current,
              activeProjectId: result.activeProjectId,
              projectCount: Math.max(0, current.projectCount - 1)
            }
          : current
      );

      const nextProjectId = result.activeProjectId ?? nextProjects[0]?.id ?? null;
      if (nextProjectId) {
        await loadProjectDetail(nextProjectId);
      } else {
        setActiveProjectId(null);
        setActiveProjectDetail(null);
        setSelectedItemId(null);
      }
      postNotice("info", "项目已删除。");
    } catch (error) {
      handleApiError(error, "删除项目失败。");
    }
  };

  const handleSelectProject = (projectId: string) => {
    startTransition(() => {
      void loadProjectDetail(projectId).catch((error) => {
        handleApiError(error, "加载项目详情失败。");
      });
    });
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !activeProject) {
      return;
    }

    const files = Array.from(fileList);
    if (!files.length) {
      return;
    }

    setUploading(true);
    try {
      const uploadAssetsPayload: Array<{
        name: string;
        dataUrl?: string;
        kind?: UploadKind;
        ringNumber?: string;
      }> = [];
      const csvRows: Array<{
        ringNumber?: string;
        gender?: string;
        owner?: string;
        region?: string;
        raceRank?: string;
        windSpeed?: string;
        basketCount?: string;
        note?: string;
      }> = [];
      const unsupportedSheets: string[] = [];
      const ignoredFiles: string[] = [];

      for (const file of files) {
        const kind = inferUploadKind(file.name);
        if (kind === "eye" || kind === "body") {
          uploadAssetsPayload.push({
            name: file.name,
            dataUrl: await readFileAsDataUrl(file),
            kind,
            ringNumber: inferRingNumber(file.name)
          });
          continue;
        }

        if (kind === "archive") {
          uploadAssetsPayload.push({
            name: file.name,
            kind
          });
          continue;
        }

        if (kind === "sheet") {
          if (file.name.toLowerCase().endsWith(".csv")) {
            csvRows.push(...parseCsvRows(await file.text()));
          } else {
            unsupportedSheets.push(file.name);
          }
          continue;
        }

        ignoredFiles.push(file.name);
      }

      let latestDetail: ProjectDetailPayload | null = null;

      if (uploadAssetsPayload.length) {
        const uploadResult = await apiClient.projects.uploadAssets(activeProject.id, {
          action: "append",
          assets: uploadAssetsPayload
        });
        latestDetail = {
          project: uploadResult.project,
          summary: uploadResult.summary
        };
      }

      if (csvRows.length) {
        const importResult = await apiClient.projects.importExcel(activeProject.id, {
          fileName: "records.csv",
          rows: csvRows
        });
        latestDetail = {
          project: importResult.project,
          summary: importResult.summary
        };
        postNotice(
          "success",
          `CSV 已导入，新增 ${importResult.importSummary.createdCount} 条，更新 ${importResult.importSummary.updatedCount} 条。`
        );
      }

      if (latestDetail) {
        setActiveProjectDetail(latestDetail);
        setProjects((current) =>
          sortProjectSummaries(current.map((project) => (project.id === latestDetail?.summary.id ? latestDetail.summary : project)))
        );
        setSelectedItemId(latestDetail.project.activeItemId ?? latestDetail.project.items[0]?.id ?? null);
      }

      if (unsupportedSheets.length) {
        postNotice("info", `当前前端已接入 CSV 导入；以下文件仅登记未解析：${unsupportedSheets.join("、")}`);
      } else if (ignoredFiles.length) {
        postNotice("info", `以下文件未识别，已忽略：${ignoredFiles.join("、")}`);
      } else if (!csvRows.length && !uploadAssetsPayload.length) {
        postNotice("error", "没有可上传的有效文件。");
      } else if (!csvRows.length) {
        postNotice("success", "素材上传完成，项目记录已刷新。");
      }
    } catch (error) {
      handleApiError(error, "上传素材失败。");
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceItemAsset = async (kind: "eye" | "body", file?: File) => {
    if (!file || !activeProject || !activeItem) {
      return;
    }

    try {
      const uploadResult = await apiClient.projects.uploadAssets(activeProject.id, {
        action: "supplement",
        targetItemId: activeItem.id,
        assets: [
          {
            name: file.name,
            dataUrl: await readFileAsDataUrl(file),
            kind,
            ringNumber: activeItem.ringNumber
          }
        ]
      });
      setActiveProjectDetail({
        project: uploadResult.project,
        summary: uploadResult.summary
      });
      postNotice("success", `${kind === "eye" ? "鸽眼图" : "外形图"} 已替换。`);
    } catch (error) {
      handleApiError(error, "替换图片失败。");
    }
  };

  const handleSaveItem = async () => {
    if (!activeProject || !activeItem || !itemFormState) {
      return;
    }

    setSavingItem(true);
    try {
      const result = await apiClient.projects.updateItem(activeProject.id, activeItem.id, itemFormState);
      setActiveProjectDetail((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          summary: result.summary,
          project: {
            ...current.project,
            items: current.project.items.map((item) => (item.id === result.item.id ? result.item : item))
          }
        };
      });
      setProjects((current) => sortProjectSummaries(current.map((project) => (project.id === activeProject.id ? result.summary : project))));
      postNotice("success", "记录已更新。");
    } catch (error) {
      handleApiError(error, "保存记录失败。");
    } finally {
      setSavingItem(false);
    }
  };

  const handleRetryItem = async (itemId: string) => {
    if (!activeProject) {
      return;
    }

    try {
      await apiClient.projects.retryItem(activeProject.id, itemId);
      await loadProjectDetail(activeProject.id);
      postNotice("info", "已重新触发记录校验。");
    } catch (error) {
      handleApiError(error, "重试失败。");
    }
  };

  const handleCreateOrder = async (productId: string) => {
    try {
      const order = await apiClient.orders.create(productId);
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
      setPaymentOrder(order);
    } catch (error) {
      handleApiError(error, "创建订单失败。");
    }
  };

  const handlePayOrder = async () => {
    if (!paymentOrder) {
      return;
    }

    setPaymentLoading(true);
    try {
      const result = await apiClient.orders.pay(paymentOrder.id);
      setEntitlements(result.entitlement);
      setPaymentOrder(result.order);
      setOrders(await apiClient.orders.list());
      setPaymentOrder(null);
      postNotice("success", "支付成功，账户权益已刷新。");
    } catch (error) {
      handleApiError(error, "支付失败。");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleExport = async (itemIds?: string[]) => {
    if (!activeProject) {
      return;
    }

    const exportableItems = itemIds?.length
      ? activeProject.items.filter((item) => itemIds.includes(item.id))
      : activeProject.items.filter((item) => item.status === "success");

    if (!exportableItems.length) {
      postNotice("error", "当前没有可导出的成功记录。");
      return;
    }

    setExporting(true);
    try {
      const result = await apiClient.projects.exportItems(activeProject.id, {
        itemIds: exportableItems.map((item) => item.id),
        format: exportFormat
      });
      const template = getTemplate(templates, activeProject.templateId);

      if (exportFormat === "zip") {
        const files = await Promise.all(
          exportableItems.map(async (item) => ({
            name: getExportFileName(activeProject.name, item.ringNumber, "jpg"),
            blob: await exportPosterBlob(
              {
                template,
                projectName: activeProject.name,
                fields: activeProject.fields,
                item,
                watermarked: result.ticket.watermarked
              },
              "jpg"
            )
          }))
        );
        await downloadZip(`${activeProject.name || "project"}-bundle.zip`, files);
      } else {
        for (const item of exportableItems) {
          const blob = await exportPosterBlob(
            {
              template,
              projectName: activeProject.name,
              fields: activeProject.fields,
              item,
              watermarked: result.ticket.watermarked
            },
            exportFormat
          );
          downloadBlob(blob, getExportFileName(activeProject.name, item.ringNumber, exportFormat));
        }
      }

      setEntitlements(result.entitlement);
      setLastExportTicket(result.ticket);
      await loadProjectDetail(activeProject.id);
      postNotice("success", `导出已完成，工单号 ${result.ticket.id}。`);
    } catch (error) {
      handleApiError(error, "导出失败。");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1280px] items-center justify-center rounded-[34px] border border-white/80 bg-white/90 px-6 py-24 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#1764ff]" />
          <span className="text-sm text-slate-500">正在加载工作台接口数据...</span>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen px-4 py-5 text-slate-900 md:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
          <section className="rounded-[30px] border border-white/80 bg-white/92 px-5 py-4 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#1764ff] text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-slate-900">鸽眼海报工作台</div>
                  <div className="text-sm text-slate-500">项目、模板、权益、订单、导出均已改为接口驱动</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900">
                  返回首页
                </Link>
                {session ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAccountOpen(true)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600"
                    >
                      {entitlements ? getPlanLabel(entitlements.account.plan) : "账户"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600"
                    >
                      <LogOut className="mr-2 inline h-4 w-4" />
                      退出
                    </button>
                  </>
                ) : (
                  <Button onClick={() => setAuthOpen(true)}>登录工作台</Button>
                )}
              </div>
            </div>
          </section>

          <NoticeBanner notice={notice} />

          {!session ? (
            <section className="rounded-[34px] border border-white/80 bg-white px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="grid gap-6 lg:grid-cols-[1fr,360px] lg:items-center">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#e9f2ff] px-4 py-2 text-sm font-medium text-[#1764ff]">
                    <ShieldCheck className="h-4 w-4" />
                    需要用户登录态
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900">工作台已接入私有接口</h1>
                    <p className="max-w-2xl text-base leading-8 text-slate-500">
                      项目、记录、导出、订单和权益都依赖用户会话。普通用户通过手机号登录，首次登录会自动建号；管理员注册与登录入口也已经补上。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => setAuthOpen(true)}>打开登录 / 注册弹窗</Button>
                    <Link
                      href="/"
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      先看首页接口概览
                    </Link>
                  </div>
                </div>

                <div className="rounded-[28px] bg-[#f7f9fc] p-5">
                  <div className="text-lg font-semibold text-slate-900">已接入的关键接口</div>
                  <div className="mt-4 space-y-3 text-sm text-slate-500">
                    <div className="rounded-[18px] bg-white px-4 py-3">POST /api/auth/login</div>
                    <div className="rounded-[18px] bg-white px-4 py-3">GET /api/projects</div>
                    <div className="rounded-[18px] bg-white px-4 py-3">POST /api/projects/:projectId/uploads</div>
                    <div className="rounded-[18px] bg-white px-4 py-3">PATCH /api/projects/:projectId/items/:itemId</div>
                    <div className="rounded-[18px] bg-white px-4 py-3">POST /api/projects/:projectId/exports</div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-4 lg:grid-cols-4">
                <Card className="border-slate-200 bg-white/94">
                  <CardHeader className="pb-4">
                    <CardDescription>当前用户</CardDescription>
                    <CardTitle className="text-2xl text-slate-900">{session.user.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-500">{session.user.phone ?? session.user.username ?? "无"}</CardContent>
                </Card>
                <Card className="border-slate-200 bg-white/94">
                  <CardHeader className="pb-4">
                    <CardDescription>剩余导出</CardDescription>
                    <CardTitle className="text-2xl text-slate-900">{formatExportCount(remainingExports)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-500">{entitlements ? getPlanLabel(entitlements.account.plan) : "未加载"}</CardContent>
                </Card>
                <Card className="border-slate-200 bg-white/94">
                  <CardHeader className="pb-4">
                    <CardDescription>模板数量</CardDescription>
                    <CardTitle className="text-2xl text-slate-900">{templates.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-500">由 `GET /api/templates` 返回</CardContent>
                </Card>
                <Card className="border-slate-200 bg-white/94">
                  <CardHeader className="pb-4">
                    <CardDescription>订单数量</CardDescription>
                    <CardTitle className="text-2xl text-slate-900">{orders.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-500">支付后自动刷新权益</CardContent>
                </Card>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr),360px]">
                <div className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-3xl font-semibold text-slate-900">项目列表</div>
                      <div className="mt-2 text-sm text-slate-500">项目数据来自 `GET /api/projects`，创建和删除都会立即刷新。</div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        value={projectSearch}
                        onChange={(event) => setProjectSearch(event.target.value)}
                        placeholder="搜索项目名称"
                        className="w-full sm:w-[280px]"
                      />
                      <Button
                        onClick={() => {
                          setCreateProjectFormState(emptyProjectForm(templates[0]?.id));
                          setCreateProjectOpen(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        新建项目
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {filteredProjects.map((project) => {
                      const template = getTemplate(templates, project.templateId);
                      const isActive = project.id === activeProjectId;
                      const progress = project.itemCount ? Math.round((project.successCount / project.itemCount) * 100) : 0;

                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => handleSelectProject(project.id)}
                          className={cn(
                            "rounded-[28px] border p-5 text-left transition-all",
                            isActive ? "border-[#1764ff] bg-[#f4f8ff]" : "border-slate-200 bg-white hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold text-slate-900">{project.name}</div>
                              <div className="mt-2 text-sm leading-6 text-slate-500">{project.description || "暂无项目说明"}</div>
                            </div>
                            <Badge variant={template.tier === "free" ? "secondary" : "accent"}>
                              {template.tier === "free" ? "免费" : "付费"}
                            </Badge>
                          </div>
                          <div className="mt-4 text-xs text-slate-400">{template.name}</div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-[#1764ff]" style={{ width: `${progress}%` }} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                            <span>
                              {project.successCount}/{project.itemCount} 成功
                            </span>
                            <span>{formatDateTime(project.updatedAt)}</span>
                          </div>
                          <div className="mt-5 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => handleSelectProject(project.id)}>
                              继续处理
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteProject(project.id);
                              }}
                            >
                              删除
                            </Button>
                          </div>
                        </button>
                      );
                    })}
                    {!filteredProjects.length ? (
                      <div className="rounded-[28px] border border-dashed border-slate-200 bg-[#f9fbfd] p-8 text-center text-sm text-slate-500 md:col-span-2">
                        还没有项目，或者当前搜索没有命中结果。
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5">
                  <Card className="border-slate-200 bg-[linear-gradient(180deg,#1968ff_0%,#1559db_100%)] text-white">
                    <CardHeader>
                      <CardDescription className="text-white/80">账户权益</CardDescription>
                      <CardTitle className="text-3xl">{entitlements ? getPlanLabel(entitlements.account.plan) : "-"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-white/85">
                      <div>剩余导出：{formatExportCount(remainingExports)}</div>
                      <div>下次重置：{formatDateTime(entitlements?.nextResetAt)}</div>
                      <Button variant="secondary" className="w-full" onClick={() => setAccountOpen(true)}>
                        <Wallet className="mr-2 h-4 w-4" />
                        查看账户
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 bg-white/94">
                    <CardHeader>
                      <CardTitle className="text-xl">接口梳理</CardTitle>
                      <CardDescription>本页已打通的主要能力</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-500">
                      <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3">`GET /api/projects` 项目列表</div>
                      <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3">`POST /api/projects` 新建项目</div>
                      <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3">`POST /api/projects/:id/uploads` 素材上传</div>
                      <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3">`PATCH /api/projects/:id/items/:itemId` 记录编辑</div>
                      <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3">`POST /api/orders/:orderId/pay` 支付生效</div>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
                {!activeProject ? (
                  <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center">
                    <FolderKanban className="h-14 w-14 text-slate-300" />
                    <div className="text-2xl font-semibold text-slate-900">先选择一个项目</div>
                    <div className="text-sm text-slate-500">选中项目后，这里会展示模板、素材、记录编辑和导出入口。</div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-sm text-[#1764ff]">当前项目</div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <div className="text-3xl font-semibold text-slate-900">{activeProject.name}</div>
                          <Badge variant={activeTemplate.tier === "free" ? "secondary" : "accent"}>{activeTemplate.name}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-slate-500">{activeProject.description || "暂无项目说明"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setAccountOpen(true)}>
                          查看权益
                        </Button>
                        <Button onClick={() => void handleExport()}>
                          <Download className="mr-2 h-4 w-4" />
                          一键导出成功记录
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
                      <div className="space-y-5">
                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">项目设置</CardTitle>
                            <CardDescription>对应 `PATCH /api/projects/:projectId` 与模板切换接口</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-5">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="space-y-2">
                                <FieldLabel title="项目名称" />
                                <Input
                                  value={projectFormState.name}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      name: event.target.value
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel title="模板" />
                                <select
                                  value={projectFormState.templateId}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      templateId: event.target.value
                                    }))
                                  }
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800"
                                >
                                  {templates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                      {template.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <FieldLabel title="项目说明" />
                              <TextArea
                                value={projectFormState.description}
                                onChange={(event) =>
                                  setProjectFormState((current) => ({
                                    ...current,
                                    description: event.target.value
                                  }))
                                }
                              />
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="space-y-2">
                                <FieldLabel title="主标题" />
                                <Input
                                  value={projectFormState.fields.title}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      fields: {
                                        ...current.fields,
                                        title: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel title="副标题" />
                                <Input
                                  value={projectFormState.fields.subtitle}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      fields: {
                                        ...current.fields,
                                        subtitle: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-3">
                              <div className="space-y-2">
                                <FieldLabel title="联系人" />
                                <Input
                                  value={projectFormState.fields.contactName}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      fields: {
                                        ...current.fields,
                                        contactName: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel title="手机号" />
                                <Input
                                  value={projectFormState.fields.phone}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      fields: {
                                        ...current.fields,
                                        phone: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel title="微信号" />
                                <Input
                                  value={projectFormState.fields.wechat}
                                  onChange={(event) =>
                                    setProjectFormState((current) => ({
                                      ...current,
                                      fields: {
                                        ...current.fields,
                                        wechat: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Button onClick={() => void handleSaveProject()} disabled={savingProject}>
                                {savingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                保存项目设置
                              </Button>
                              <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-500">
                                当前 API 尚未提供 Logo / 二维码上传入口，这里先接入文本字段与模板切换。
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">模板选择</CardTitle>
                            <CardDescription>模板列表来自 `GET /api/templates`</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {templates.map((template) => (
                              <ProjectTemplateCard
                                key={template.id}
                                template={template}
                                selected={projectFormState.templateId === template.id}
                                onSelect={() =>
                                  setProjectFormState((current) => ({
                                    ...current,
                                    templateId: template.id
                                  }))
                                }
                              />
                            ))}
                          </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">上传素材与导入数据</CardTitle>
                            <CardDescription>图片/压缩包走上传接口，CSV 走 Excel 导入接口</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-[#cfd8e6] bg-[#fafcff] px-6 text-center transition hover:border-[#1764ff] hover:bg-white">
                              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#edf4ff] text-[#1764ff]">
                                <Upload className="h-6 w-6" />
                              </div>
                              <div className="text-xl font-semibold text-slate-900">{uploading ? "处理中..." : "拖入文件，或点击上传"}</div>
                              <div className="mt-3 max-w-[320px] text-sm leading-6 text-slate-500">
                                图片与 ZIP 走 `POST /api/projects/:id/uploads`。
                                <br />
                                CSV 走 `POST /api/projects/:id/excel`。
                              </div>
                              <Button className="mt-6" variant="secondary" type="button">
                                选择文件
                              </Button>
                              <input
                                type="file"
                                multiple
                                accept="image/*,.zip,.csv,.xls,.xlsx"
                                className="hidden"
                                onChange={(event) => {
                                  void handleUploadFiles(event.target.files);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-[22px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-600">`足环号_eye.jpg` 自动识别为鸽眼图</div>
                              <div className="rounded-[22px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-600">`足环号_body.jpg` 自动识别为外形图</div>
                              <div className="rounded-[22px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-600">CSV 表头支持足环号、鸽主、地区、成绩等字段</div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="space-y-5">
                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">记录列表</CardTitle>
                            <CardDescription>成功、处理中、失败状态均来自项目详情接口</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {activeProject.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedItemId(item.id)}
                                className={cn(
                                  "w-full rounded-[24px] border p-4 text-left transition-all",
                                  item.id === activeItem?.id ? "border-[#1764ff] bg-[#f4f8ff]" : "border-slate-200 bg-white hover:border-slate-300"
                                )}
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-base font-semibold text-slate-900">{item.ringNumber}</div>
                                    <div className="mt-1 text-sm text-slate-500">{item.owner || "暂无鸽主信息"}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <StatusPill tone={getRecordTone(item)}>{getRecordStatusLabel(item)}</StatusPill>
                                    {item.exportStatus === "exported" ? <StatusPill tone="neutral">已导出</StatusPill> : null}
                                  </div>
                                </div>
                                {item.failureReason ? <div className="mt-3 text-sm text-rose-500">{item.failureReason}</div> : null}
                              </button>
                            ))}
                            {!activeProject.items.length ? (
                              <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f9fbfd] px-4 py-6 text-center text-sm text-slate-500">
                                暂无记录，先上传素材或导入 CSV。
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">记录编辑</CardTitle>
                            <CardDescription>对应 `PATCH /api/projects/:projectId/items/:itemId`</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {activeItem && itemFormState ? (
                              <>
                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="space-y-2">
                                    <FieldLabel title="足环号" hint="当前 API 不支持前端修改足环号" />
                                    <Input value={activeItem.ringNumber} readOnly className="bg-[#f7f9fc]" />
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel title="性别" />
                                    <select
                                      value={itemFormState.gender}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                gender: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800"
                                    >
                                      <option value="雄">雄</option>
                                      <option value="雌">雌</option>
                                      <option value="未知">未知</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="space-y-2">
                                    <FieldLabel title="鸽眼方向" />
                                    <select
                                      value={itemFormState.eyeDirectionFinal}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                eyeDirectionFinal: event.target.value as ProjectItem["eyeDirectionFinal"]
                                              }
                                            : current
                                        )
                                      }
                                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800"
                                    >
                                      <option value="左">左</option>
                                      <option value="右">右</option>
                                      <option value="居中">居中</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel title="外形方向" />
                                    <select
                                      value={itemFormState.bodyDirectionFinal}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                bodyDirectionFinal: event.target.value as ProjectItem["bodyDirectionFinal"]
                                              }
                                            : current
                                        )
                                      }
                                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800"
                                    >
                                      <option value="左">左</option>
                                      <option value="右">右</option>
                                      <option value="居中">居中</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="space-y-2">
                                    <FieldLabel title="鸽主" />
                                    <Input
                                      value={itemFormState.owner}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                owner: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel title="地区" />
                                    <Input
                                      value={itemFormState.region}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                region: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <FieldLabel title="赛绩" />
                                  <Input
                                    value={itemFormState.raceRank}
                                    onChange={(event) =>
                                      setItemFormState((current) =>
                                        current
                                          ? {
                                              ...current,
                                              raceRank: event.target.value
                                            }
                                          : current
                                      )
                                    }
                                  />
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="space-y-2">
                                    <FieldLabel title="风速" />
                                    <Input
                                      value={itemFormState.windSpeed}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                windSpeed: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel title="上笼羽数" />
                                    <Input
                                      value={itemFormState.basketCount}
                                      onChange={(event) =>
                                        setItemFormState((current) =>
                                          current
                                            ? {
                                                ...current,
                                                basketCount: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <FieldLabel title="备注" />
                                  <TextArea
                                    value={itemFormState.note}
                                    onChange={(event) =>
                                      setItemFormState((current) =>
                                        current
                                          ? {
                                              ...current,
                                              note: event.target.value
                                            }
                                          : current
                                      )
                                    }
                                  />
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                                    <FieldLabel title="替换鸽眼图" />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                                      onChange={(event) => {
                                        void handleReplaceItemAsset("eye", event.target.files?.[0]);
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                  </div>
                                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                                    <FieldLabel title="替换外形图" />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                                      onChange={(event) => {
                                        void handleReplaceItemAsset("body", event.target.files?.[0]);
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                  <Button onClick={() => void handleSaveItem()} disabled={savingItem}>
                                    {savingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    保存记录
                                  </Button>
                                  <Button variant="outline" onClick={() => void handleRetryItem(activeItem.id)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    重新校验
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f9fbfd] px-4 py-6 text-center text-sm text-slate-500">
                                请选择一条记录开始编辑。
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),380px]">
                      <div className="space-y-5">
                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">海报预览</CardTitle>
                            <CardDescription>前端保留预览与本地生成能力，导出前先调用接口扣减权益</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {activeItem ? (
                              <PosterPreviewCanvas
                                template={activeTemplate}
                                project={{
                                  ...activeProject,
                                  name: projectFormState.name,
                                  description: projectFormState.description,
                                  templateId: projectFormState.templateId,
                                  fields: projectFormState.fields
                                }}
                                item={{
                                  ...activeItem,
                                  ...(itemFormState ?? {})
                                }}
                                watermarked={Boolean(entitlements?.watermarked)}
                              />
                            ) : (
                              <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-[#f7f9fc] text-sm text-slate-500">
                                当前没有可预览记录
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="space-y-5">
                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">导出设置</CardTitle>
                            <CardDescription>接口成功后，前端立即生成并下载文件</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-5">
                            <div className="space-y-2">
                              <FieldLabel title="导出格式" />
                              <div className="flex flex-wrap gap-2">
                                {(["png", "jpg", "zip"] as ExportFormat[]).map((format) => (
                                  <button
                                    key={format}
                                    type="button"
                                    onClick={() => setExportFormat(format)}
                                    className={cn(
                                      "rounded-full border px-3 py-1.5 text-sm font-medium",
                                      exportFormat === format ? "border-[#1764ff] bg-[#edf4ff] text-[#1764ff]" : "border-slate-200 text-slate-500"
                                    )}
                                  >
                                    {format.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[22px] bg-[#f7f9fc] px-4 py-3 text-sm text-slate-600">
                              当前模板：{activeTemplate.name}
                              <br />
                              剩余导出：{formatExportCount(remainingExports)}
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Button onClick={() => void handleExport()} disabled={exporting || !activeSummary?.successCount}>
                                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                导出成功记录
                              </Button>
                              {activeItem ? (
                                <Button variant="outline" onClick={() => void handleExport([activeItem.id])} disabled={exporting || activeItem.status !== "success"}>
                                  导出当前记录
                                </Button>
                              ) : null}
                            </div>
                            {lastExportTicket ? (
                              <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                                工单号：{lastExportTicket.id}
                                <br />
                                下载地址：{lastExportTicket.downloadUrl}
                                <br />
                                水印状态：{lastExportTicket.watermarked ? "带水印" : "无水印"}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>

                        <Card className="border-slate-200 bg-white/94">
                          <CardHeader>
                            <CardTitle className="text-xl">项目快照</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm text-slate-500">
                            <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                              素材数：{activeSummary?.assetCount ?? 0}
                            </div>
                            <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                              成功记录：{activeSummary?.successCount ?? 0}
                            </div>
                            <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                              处理中：{activeSummary?.processingCount ?? 0}
                            </div>
                            <div className="rounded-[20px] bg-[#f7f9fc] px-4 py-3">
                              失败记录：{activeSummary?.failedCount ?? 0}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={async ({ mode, session: nextSession, adminSession }) => {
          if (mode === "user-login") {
            if (nextSession) {
              setSession(nextSession);
            }
            await loadDashboard(undefined, nextSession ?? null);
            return;
          }
          postNotice(
            "info",
            `管理员 ${adminSession?.user.name ?? ""} 已登录；管理员会话请使用 /api/admin/auth/session，用户工作台仍需 /api/auth/login。`
          );
        }}
      />

      <ModalShell
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        title="创建项目"
        description="对应 `POST /api/projects`，创建后会自动切到该项目。"
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <FieldLabel title="项目名称" />
            <Input
              value={createProjectFormState.name}
              onChange={(event) =>
                setCreateProjectFormState((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <FieldLabel title="项目说明" />
            <TextArea
              value={createProjectFormState.description}
              onChange={(event) =>
                setCreateProjectFormState((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <FieldLabel title="初始模板" />
            <select
              value={createProjectFormState.templateId}
              onChange={(event) =>
                setCreateProjectFormState((current) => ({
                  ...current,
                  templateId: event.target.value
                }))
              }
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel title="主标题" />
              <Input
                value={createProjectFormState.fields.title}
                onChange={(event) =>
                  setCreateProjectFormState((current) => ({
                    ...current,
                    fields: {
                      ...current.fields,
                      title: event.target.value
                    }
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <FieldLabel title="副标题" />
              <Input
                value={createProjectFormState.fields.subtitle}
                onChange={(event) =>
                  setCreateProjectFormState((current) => ({
                    ...current,
                    fields: {
                      ...current.fields,
                      subtitle: event.target.value
                    }
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCreateProjectOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreateProject()} disabled={savingProject}>
              {savingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建项目
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="账户与权益"
        description="查看 `GET /api/account/entitlements`、商品与订单接口返回的数据。"
      >
        <div className="space-y-6 p-7">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[28px] bg-[linear-gradient(180deg,#1968ff_0%,#1459dc_100%)] p-5 text-white">
              <div className="text-sm text-white/80">当前权益</div>
              <div className="mt-3 text-3xl font-semibold">{entitlements ? getPlanLabel(entitlements.account.plan) : "-"}</div>
              <div className="mt-2 text-sm text-white/80">剩余导出 {formatExportCount(remainingExports)}</div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
              <div className="text-sm text-slate-500">已解锁模板</div>
              <div className="mt-3 text-lg font-semibold text-slate-900">{entitlements?.unlockedTemplateIds.length ?? 0}</div>
              <div className="mt-2 text-sm text-slate-500">{entitlements?.watermarked ? "当前导出带平台水印" : "当前导出无平台水印"}</div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
              <div className="text-sm text-slate-500">下次重置</div>
              <div className="mt-3 text-lg font-semibold text-slate-900">{formatDateTime(entitlements?.nextResetAt)}</div>
              <div className="mt-2 text-sm text-slate-500">免费额度：{entitlements?.freeQuota ?? "-"}</div>
            </div>
          </div>

          <div>
            <div className="text-xl font-semibold text-slate-900">购买商品</div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf4ff] text-[#1764ff]">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-900">{product.name}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">{product.description}</div>
                  <div className="mt-5 text-3xl font-semibold text-slate-900">{product.priceLabel}</div>
                  <Button className="mt-5 w-full" onClick={() => void handleCreateOrder(product.id)}>
                    立即下单
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xl font-semibold text-slate-900">订单记录</div>
            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-[24px] border border-slate-200 bg-[#f7f9fc] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{order.productName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        创建于 {formatDateTime(order.createdAt)} · {order.amountLabel}
                      </div>
                    </div>
                    <StatusPill tone={order.status === "paid" ? "success" : "warning"}>
                      {order.status === "paid" ? "已支付" : "待支付"}
                    </StatusPill>
                  </div>
                </div>
              ))}
              {!orders.length ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4 text-sm text-slate-500">
                  暂无订单记录。
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(paymentOrder)}
        onClose={() => setPaymentOrder(null)}
        title="支付弹窗"
        description="订单已创建，对应 `POST /api/orders`；支付确认对应 `POST /api/orders/:orderId/pay`。"
        maxWidthClassName="max-w-3xl"
      >
        {paymentOrder ? (
          <div className="grid gap-6 p-7 lg:grid-cols-[1fr,320px]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6">
              <div className="text-xl font-semibold text-slate-900">{paymentOrder.productName}</div>
              <div className="mt-2 text-sm text-slate-500">订单号：{paymentOrder.id}</div>
              <div className="mt-6 rounded-[26px] bg-[#f7f9fc] p-6 text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] bg-[#1764ff] text-white">
                  <Wallet className="h-12 w-12" />
                </div>
                <div className="mt-4 text-2xl font-semibold text-slate-900">{paymentOrder.amountLabel}</div>
                <div className="mt-2 break-all text-sm text-slate-500">二维码地址：{paymentOrder.qrCodeUrl}</div>
              </div>
              <Button className="mt-6 w-full" onClick={() => void handlePayOrder()} disabled={paymentLoading}>
                {paymentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                模拟支付成功
              </Button>
            </div>

            <div className="space-y-4 rounded-[30px] bg-[#f7f9fc] p-6">
              <div className="text-lg font-semibold text-slate-900">支付后行为</div>
              <div className="rounded-[22px] bg-white p-4 text-sm text-slate-600">
                支付完成后将重新请求权益与订单接口，当前工作台中的导出额度和订单状态会同步更新。
              </div>
              <div className="rounded-[22px] bg-white p-4 text-sm text-slate-600">
                如果是次卡商品，会增加导出次数；如果是月付商品，会切换到无限导出且去水印状态。
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </>
  );
}
