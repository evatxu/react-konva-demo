"use client";

import {
  ArrowRight,
  Camera,
  Crown,
  Download,
  FileArchive,
  FileImage,
  FolderKanban,
  ImagePlus,
  Layers3,
  ListChecks,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  buildExportSignature,
  buildRecordStatus,
  canUsePaidTemplates,
  createEmptyProjectFields,
  createId,
  createInitialWorkspace,
  formatBeijingDateTime,
  getAvailableExportCount,
  getBusinessWindowKey,
  getNextResetAt,
  getPlanLabel,
  getRecordDefaults,
  getTemplateById,
  normalizeProject,
  PRODUCT_OPTIONS,
  resolvePlan,
  shouldApplyWatermark,
  syncAccountByBusinessWindow,
  TEMPLATE_OPTIONS,
  type AccountState,
  type ExportFormat,
  type Order,
  type PosterTemplate,
  type ProductOption,
  type Project,
  type ProjectFields,
  type ProjectItem,
  type RecordStatus,
  type UploadKind,
  type UploadedAsset,
  type WorkspaceState,
  type WorkspaceTab
} from "@/lib/pigeon-studio";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "success" | "error";

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

interface ProjectDraft {
  name: string;
  description: string;
  templateId: string;
  fields: ProjectFields;
}

interface ProjectModalState {
  mode: "create" | "template";
  projectId?: string;
  draft: ProjectDraft;
}

interface PaymentState {
  product: ProductOption;
  orderId: string;
}

type WorkspaceView = "home" | "projects" | "templates" | WorkspaceTab;

function formatCountdown(target: Date, nowMs: number) {
  const diff = Math.max(0, target.getTime() - nowMs);
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} 小时 ${minutes} 分`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid-file-result"));
    };
    reader.onerror = () => reject(new Error("file-read-failed"));
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

function inferDirection(name: string, fallback: "左" | "右" | "居中") {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("left") || lowerName.includes("左")) {
    return "左" as const;
  }
  if (lowerName.includes("right") || lowerName.includes("右")) {
    return "右" as const;
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

function makeProjectDraft(project?: Project): ProjectDraft {
  if (!project) {
    return {
      name: "新建赛绩项目",
      description: "",
      templateId: TEMPLATE_OPTIONS[0].id,
      fields: createEmptyProjectFields()
    };
  }

  return {
    name: project.name,
    description: project.description,
    templateId: project.templateId,
    fields: { ...project.fields }
  };
}

function createRecordFromUpload(
  ringNumber: string,
  partial: Partial<ProjectItem>,
  orderIndex: number,
  sheetUploaded: boolean
): ProjectItem {
  const defaults = getRecordDefaults(ringNumber);
  const item: ProjectItem = {
    id: createId("item"),
    ringNumber,
    eyeDirectionAuto: partial.eyeDirectionAuto ?? (orderIndex % 2 === 0 ? "左" : "右"),
    eyeDirectionFinal: partial.eyeDirectionFinal ?? (orderIndex % 2 === 0 ? "左" : "右"),
    bodyDirectionAuto: partial.bodyDirectionAuto ?? (orderIndex % 2 === 0 ? "右" : "左"),
    bodyDirectionFinal: partial.bodyDirectionFinal ?? (orderIndex % 2 === 0 ? "右" : "左"),
    eyeImageSrc: partial.eyeImageSrc,
    bodyImageSrc: partial.bodyImageSrc,
    gender: orderIndex % 2 === 0 ? "雄" : "雌",
    owner: sheetUploaded ? ["高定鸽业", "华东铭鸽", "竞翔俱乐部"][orderIndex % 3] : defaults.owner,
    region: sheetUploaded ? ["上海", "江苏", "浙江"][orderIndex % 3] : defaults.region,
    raceRank: sheetUploaded ? ["300 公里 8 名", "500 公里 19 名", "资格赛待录入"][orderIndex % 3] : defaults.raceRank,
    windSpeed: sheetUploaded ? ["顺风 2.0m/s", "侧风 3.5m/s", "逆风 1.8m/s"][orderIndex % 3] : defaults.windSpeed,
    basketCount: sheetUploaded ? ["上笼 1360 羽", "上笼 980 羽", "上笼 1620 羽"][orderIndex % 3] : defaults.basketCount,
    note: sheetUploaded ? "已根据表格回填部分展示字段，可继续微调。" : defaults.note,
    status: "processing",
    exportStatus: "idle",
    exportedSignatures: []
  };

  const status = buildRecordStatus(item);
  return {
    ...item,
    status,
    failureReason: status === "success" ? undefined : getFailureReason(item)
  };
}

function mergeRecord(existing: ProjectItem, incoming: ProjectItem) {
  const merged: ProjectItem = {
    ...existing,
    eyeImageSrc: incoming.eyeImageSrc ?? existing.eyeImageSrc,
    bodyImageSrc: incoming.bodyImageSrc ?? existing.bodyImageSrc,
    eyeDirectionAuto: incoming.eyeDirectionAuto,
    bodyDirectionAuto: incoming.bodyDirectionAuto,
    eyeDirectionFinal: existing.eyeDirectionFinal || incoming.eyeDirectionFinal,
    bodyDirectionFinal: existing.bodyDirectionFinal || incoming.bodyDirectionFinal,
    owner: existing.owner || incoming.owner,
    region: existing.region || incoming.region,
    raceRank: existing.raceRank === "待填写" ? incoming.raceRank : existing.raceRank,
    windSpeed: existing.windSpeed === "待填写" ? incoming.windSpeed : existing.windSpeed,
    basketCount: existing.basketCount === "待填写" ? incoming.basketCount : existing.basketCount,
    note: existing.note || incoming.note
  };

  const status = buildRecordStatus(merged);
  return {
    ...merged,
    status,
    failureReason: status === "success" ? undefined : getFailureReason(merged)
  };
}

function getRecordStatusLabel(status: RecordStatus) {
  switch (status) {
    case "success":
      return "成功";
    case "processing":
      return "处理中";
    case "failed":
      return "失败";
  }
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cn(
        "min-h-[88px] w-full rounded-[22px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...rest}
    />
  );
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function StatusDot({
  text,
  tone
}: {
  text: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    neutral: "bg-slate-100 text-slate-700"
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", styles[tone])}>{text}</span>;
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

function ModalShell({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-5">
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">{title}</div>
            <div className="text-sm text-slate-500">{description}</div>
          </div>
          <Button variant="secondary" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ScrollArea className="max-h-[calc(90vh-96px)]">{children}</ScrollArea>
      </div>
    </div>
  );
}

function PosterPreviewCanvas({
  template,
  project,
  item,
  watermarked
}: {
  template: PosterTemplate;
  project: Project;
  item: ProjectItem;
  watermarked: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
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
          setPreviewError("预览渲染失败，请检查素材是否可用。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item, project.fields, project.name, template, watermarked]);

  return (
    <div className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,#f7fbff_0%,#eef2f9_100%)] p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="rounded-[22px] border border-slate-200/80 bg-white p-5">
        <canvas
          ref={canvasRef}
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

function PosterCardMockup({
  template,
  item,
  className,
  locked,
  title,
  subtitle
}: {
  template: PosterTemplate;
  item?: ProjectItem | null;
  className?: string;
  locked?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm", className)}>
      <div
        className="relative aspect-[0.72] overflow-hidden rounded-[18px] border border-slate-200"
        style={{
          background: `linear-gradient(180deg, ${template.backgroundFrom} 0%, ${template.backgroundTo} 100%)`
        }}
      >
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-white/90" />
          <div className="text-sm font-semibold" style={{ color: template.accent }}>
            海报制作
          </div>
        </div>
        <div
          className="absolute left-4 top-14 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-[4px] bg-white"
          style={{ borderColor: template.accent }}
        >
          {item?.eyeImageSrc ? (
            <img src={item.eyeImageSrc} alt={item.ringNumber} className="h-full w-full object-cover" />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `radial-gradient(circle, #0f1014 18%, ${template.accent} 48%, #ffd17e 100%)`
              }}
            />
          )}
        </div>
        <div className="absolute inset-x-[35%] bottom-20 top-10">
          {item?.bodyImageSrc ? (
            <img src={item.bodyImageSrc} alt={item.ringNumber} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">待补充外形图</div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-16 flex items-center gap-2 px-4">
          <div className="rounded-[10px] bg-[#f7dfa3] px-3 py-1 text-sm font-bold" style={{ color: template.accent }}>
            冠军
          </div>
          <div className="h-8 flex-1 rounded-[10px]" style={{ backgroundColor: template.accent }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">{title ?? template.name}</div>
          <div className="mt-1 text-xs text-slate-500">{subtitle ?? template.description}</div>
        </div>
        {locked ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/36 text-white backdrop-blur-[2px]">
            <div className="rounded-full bg-black/35 px-4 py-2 text-sm font-semibold">无权限使用</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PosterEditor() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createInitialWorkspace());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("upload");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("home");
  const [projectSearch, setProjectSearch] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [busyUpload, setBusyUpload] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [clock, setClock] = useState(Date.now());

  const deferredProjectSearch = useDeferredValue(projectSearch);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setWorkspace((current) => {
      const nextAccount = syncAccountByBusinessWindow(current.account, new Date(clock));
      if (nextAccount === current.account) {
        return current;
      }
      return {
        ...current,
        account: nextAccount
      };
    });
  }, [clock]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const now = new Date(clock);
  const syncedAccount = syncAccountByBusinessWindow(workspace.account, now);
  const currentPlan = resolvePlan(syncedAccount, now);
  const remainingExports = getAvailableExportCount(syncedAccount, now);
  const nextResetAt = getNextResetAt(now);

  const filteredProjects = useMemo(() => {
    const keyword = deferredProjectSearch.trim().toLowerCase();
    if (!keyword) {
      return workspace.projects;
    }
    return workspace.projects.filter(
      (project) =>
        project.name.toLowerCase().includes(keyword) ||
        project.description.toLowerCase().includes(keyword) ||
        getTemplateById(project.templateId).name.toLowerCase().includes(keyword)
    );
  }, [deferredProjectSearch, workspace.projects]);

  const activeProject = useMemo(
    () => workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null,
    [workspace.activeProjectId, workspace.projects]
  );
  const activeTemplate = activeProject ? getTemplateById(activeProject.templateId) : TEMPLATE_OPTIONS[0];
  const activeItem = activeProject?.items.find((item) => item.id === activeProject.activeItemId) ?? null;
  const successItems = activeProject?.items.filter((item) => item.status === "success") ?? [];

  const postNotice = (tone: NoticeTone, text: string) => {
    setNotice({ tone, text });
  };

  const patchWorkspace = (producer: (current: WorkspaceState) => WorkspaceState) => {
    setWorkspace((current) => producer(current));
  };

  const patchProject = (projectId: string, producer: (project: Project) => Project) => {
    patchWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? normalizeProject({
              ...producer(project),
              updatedAt: new Date().toISOString()
            })
          : project
      )
    }));
  };

  const patchActiveProject = (producer: (project: Project) => Project) => {
    if (!activeProject) {
      return;
    }
    patchProject(activeProject.id, producer);
  };

  const navigateToView = (view: WorkspaceView) => {
    setWorkspaceView(view);
    if (view === "upload" || view === "edit" || view === "export") {
      setActiveTab(view);
    }
  };

  const selectProject = (projectId: string) => {
    startTransition(() => {
      setWorkspace((current) => ({
        ...current,
        activeProjectId: projectId
      }));
    });
    setWorkspaceView("projects");
  };

  const openCreateProject = () => {
    setWorkspaceView("projects");
    setProjectModal({
      mode: "create",
      draft: makeProjectDraft()
    });
  };

  const openTemplateModal = (project: Project, templateId?: string) => {
    navigateToView("templates");
    setProjectModal({
      mode: "template",
      projectId: project.id,
      draft: {
        ...makeProjectDraft(project),
        templateId: templateId ?? project.templateId
      }
    });
  };

  const updateProjectDraft = (patch: Partial<ProjectDraft>) => {
    setProjectModal((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        draft: {
          ...current.draft,
          ...patch,
          fields: patch.fields ?? current.draft.fields
        }
      };
    });
  };

  const updateProjectDraftField = <K extends keyof ProjectFields>(key: K, value: ProjectFields[K]) => {
    setProjectModal((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        draft: {
          ...current.draft,
          fields: {
            ...current.draft.fields,
            [key]: value
          }
        }
      };
    });
  };

  const handleProjectDraftLogo = async (file?: File) => {
    if (!file) {
      return;
    }
    try {
      const src = await readFileAsDataUrl(file);
      updateProjectDraftField("logoSrc", src);
      postNotice("success", "项目 Logo 已加入创建表单。");
    } catch {
      postNotice("error", "Logo 读取失败，请重试。");
    }
  };

  const saveProjectModal = () => {
    if (!projectModal) {
      return;
    }

    const targetTemplate = getTemplateById(projectModal.draft.templateId);
    if (targetTemplate.tier === "paid" && !canUsePaidTemplates(syncedAccount, now)) {
      setAccountOpen(true);
      postNotice("error", "当前账号仍为免费版，付费模板需要先购买次卡或月付。");
      return;
    }

    if (!projectModal.draft.name.trim()) {
      postNotice("error", "项目名称不能为空。");
      return;
    }

    if (projectModal.mode === "create") {
      const createdAt = new Date().toISOString();
      const newProject = normalizeProject({
        id: createId("project"),
        name: projectModal.draft.name.trim(),
        description: projectModal.draft.description.trim(),
        templateId: projectModal.draft.templateId,
        fields: { ...projectModal.draft.fields },
        uploadedAssets: [],
        items: [],
        activeItemId: null,
        createdAt,
        updatedAt: createdAt
      });

      patchWorkspace((current) => ({
        ...current,
        projects: [newProject, ...current.projects],
        activeProjectId: newProject.id
      }));
      navigateToView("templates");
      postNotice("success", "项目已创建，请继续选择海报模板。");
    } else if (projectModal.projectId) {
      patchProject(projectModal.projectId, (project) => ({
        ...project,
        name: projectModal.draft.name.trim(),
        description: projectModal.draft.description.trim(),
        templateId: projectModal.draft.templateId,
        fields: {
          ...project.fields,
          ...projectModal.draft.fields
        }
      }));
      navigateToView("upload");
      postNotice("success", "模板已确认，继续上传素材即可进入编辑。");
    }

    setProjectModal(null);
  };

  const deleteProject = (projectId: string) => {
    patchWorkspace((current) => {
      const nextProjects = current.projects.filter((project) => project.id !== projectId);
      return {
        ...current,
        projects: nextProjects,
        activeProjectId:
          current.activeProjectId === projectId ? nextProjects[0]?.id ?? null : current.activeProjectId
      };
    });
    postNotice("info", "项目已删除。");
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !activeProject) {
      return;
    }

    const files = Array.from(fileList);
    if (!files.length) {
      return;
    }

    setBusyUpload(true);

    try {
      let sheetUploaded = false;
      const assets: UploadedAsset[] = [];
      const incomingItems: ProjectItem[] = [];
      const grouped = new Map<string, Partial<ProjectItem>>();

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const kind = inferUploadKind(file.name);
        let note = "文件类型暂不支持。";
        let status: UploadedAsset["status"] = "failed";

        if (kind === "sheet") {
          sheetUploaded = true;
          status = "success";
          note = "已识别为结构化表格，可回填展示字段。";
        } else if (kind === "archive") {
          status = "success";
          note = "演示原型已接收压缩包，请补充单图或表格完成识别。";
        } else if (kind === "eye" || kind === "body") {
          status = "success";
          note = kind === "eye" ? "已识别为鸽眼图。" : "已识别为外形图。";
        }

        assets.push({
          id: createId("asset"),
          name: file.name,
          kind,
          status,
          note
        });

        if (status !== "success" || (kind !== "eye" && kind !== "body")) {
          continue;
        }

        const ringNumber = inferRingNumber(file.name) || `AUTO-${activeProject.items.length + index + 1}`;
        const current = grouped.get(ringNumber) ?? {};
        const src = await readFileAsDataUrl(file);

        if (kind === "eye") {
          current.eyeImageSrc = src;
          current.eyeDirectionAuto = inferDirection(file.name, "左");
          current.eyeDirectionFinal = current.eyeDirectionAuto;
        } else {
          current.bodyImageSrc = src;
          current.bodyDirectionAuto = inferDirection(file.name, "右");
          current.bodyDirectionFinal = current.bodyDirectionAuto;
        }
        grouped.set(ringNumber, current);
      }

      Array.from(grouped.entries()).forEach(([ringNumber, partial], index) => {
        incomingItems.push(createRecordFromUpload(ringNumber, partial, activeProject.items.length + index, sheetUploaded));
      });

      patchActiveProject((project) => {
        const mergedItems = [...project.items];

        incomingItems.forEach((item) => {
          const existingIndex = mergedItems.findIndex((record) => record.ringNumber === item.ringNumber);
          if (existingIndex >= 0) {
            mergedItems[existingIndex] = mergeRecord(mergedItems[existingIndex], item);
          } else {
            mergedItems.push(item);
          }
        });

        return {
          ...project,
          uploadedAssets: [...assets, ...project.uploadedAssets],
          items: mergedItems,
          activeItemId: project.activeItemId ?? mergedItems[0]?.id ?? null
        };
      });

      postNotice("success", `本次接入 ${files.length} 个文件，生成或更新 ${incomingItems.length} 条记录。`);
    } catch {
      postNotice("error", "素材处理失败，请检查文件格式后重试。");
    } finally {
      setBusyUpload(false);
    }
  };

  const updateProjectField = <K extends keyof ProjectFields>(key: K, value: ProjectFields[K]) => {
    patchActiveProject((project) => ({
      ...project,
      fields: {
        ...project.fields,
        [key]: value
      }
    }));
  };

  const updateActiveItem = (patch: Partial<ProjectItem>) => {
    if (!activeProject || !activeItem) {
      return;
    }

    patchProject(activeProject.id, (project) => ({
      ...project,
      items: project.items.map((item) => {
        if (item.id !== activeItem.id) {
          return item;
        }
        const nextItem = {
          ...item,
          ...patch
        };
        const nextStatus = buildRecordStatus(nextItem);
        return {
          ...nextItem,
          status: nextStatus,
          failureReason: nextStatus === "success" ? undefined : getFailureReason(nextItem)
        };
      })
    }));
  };

  const selectActiveItem = (itemId: string) => {
    patchActiveProject((project) => ({
      ...project,
      activeItemId: itemId
    }));
  };

  const resetActiveItem = () => {
    if (!activeItem) {
      return;
    }

    const defaults = getRecordDefaults(activeItem.ringNumber);
    updateActiveItem({
      eyeDirectionFinal: activeItem.eyeDirectionAuto,
      bodyDirectionFinal: activeItem.bodyDirectionAuto,
      gender: "雄",
      owner: defaults.owner,
      region: defaults.region,
      raceRank: defaults.raceRank,
      windSpeed: defaults.windSpeed,
      basketCount: defaults.basketCount,
      note: defaults.note
    });
    postNotice("info", "当前记录已恢复默认值。");
  };

  const applyProjectFieldsToAll = () => {
    postNotice("success", "项目公共字段已实时同步到全部记录预览。");
  };

  const handleProjectImageField = async (field: "logoSrc" | "qrCodeSrc", file?: File) => {
    if (!file) {
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      updateProjectField(field, src);
      postNotice("success", `${field === "logoSrc" ? "Logo" : "二维码"} 已更新。`);
    } catch {
      postNotice("error", "图片读取失败，请重试。");
    }
  };

  const handleRecordImageField = async (itemId: string, field: "eyeImageSrc" | "bodyImageSrc", file?: File) => {
    if (!file || !activeProject) {
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      patchProject(activeProject.id, (project) => ({
        ...project,
        items: project.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const nextItem = {
            ...item,
            [field]: src
          };
          const nextStatus = buildRecordStatus(nextItem);
          return {
            ...nextItem,
            status: nextStatus,
            failureReason: nextStatus === "success" ? undefined : getFailureReason(nextItem)
          };
        })
      }));
      postNotice("success", `${field === "eyeImageSrc" ? "鸽眼图" : "外形图"} 已补充。`);
    } catch {
      postNotice("error", "图片读取失败，请重试。");
    }
  };

  const deleteItem = (itemId: string) => {
    patchActiveProject((project) => ({
      ...project,
      items: project.items.filter((item) => item.id !== itemId)
    }));
    postNotice("info", "记录已删除。");
  };

  const retryItem = (itemId: string) => {
    patchActiveProject((project) => ({
      ...project,
      items: project.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const nextStatus = buildRecordStatus(item);
        return {
          ...item,
          status: nextStatus,
          failureReason: nextStatus === "success" ? undefined : getFailureReason(item)
        };
      })
    }));
    postNotice("info", "已重新校验当前记录状态。");
  };

  const startPurchase = (product: ProductOption) => {
    const orderId = createId("order");
    const createdAt = new Date().toISOString();
    const order: Order = {
      id: orderId,
      productId: product.id,
      productName: product.name,
      amountLabel: product.priceLabel,
      status: "pending",
      createdAt
    };

    patchWorkspace((current) => ({
      ...current,
      account: {
        ...current.account,
        orders: [order, ...current.account.orders]
      }
    }));

    setPaymentState({
      product,
      orderId
    });
  };

  const confirmPayment = () => {
    if (!paymentState) {
      return;
    }

    const paidAt = new Date().toISOString();

    patchWorkspace((current) => {
      const account: AccountState = {
        ...current.account,
        orders: current.account.orders.map((order) =>
          order.id === paymentState.orderId
            ? {
                ...order,
                status: "paid",
                paidAt
              }
            : order
        )
      };

      if (paymentState.product.kind === "pack") {
        account.plan = "pack";
        account.packCredits += paymentState.product.credits ?? 0;
      } else {
        const days = paymentState.product.days ?? 30;
        account.plan = "monthly";
        account.monthlyExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }

      return {
        ...current,
        account
      };
    });

    setPaymentState(null);
    setAccountOpen(false);
    postNotice("success", `支付成功，${paymentState.product.name} 权益已生效。`);
  };

  const exportItems = async (items: ProjectItem[]) => {
    if (!activeProject) {
      return;
    }

    if (!items.length) {
      postNotice("error", "当前没有可导出的成功记录。");
      return;
    }

    const lockedPaidTemplate = activeTemplate.tier === "paid" && !canUsePaidTemplates(syncedAccount, now);
    if (lockedPaidTemplate) {
      setAccountOpen(true);
      postNotice("error", "当前项目使用付费模板，免费版不可导出，请先升级。");
      return;
    }

    if (currentPlan === "free" && items.length > 1) {
      postNotice("error", "免费版每次仅可导出 1 条成功记录。");
      return;
    }

    const watermarked = shouldApplyWatermark(syncedAccount, now);
    const signatures = new Map<string, string>();
    const chargeableIds = new Set<string>();

    items.forEach((item) => {
      const signature = buildExportSignature(activeProject, item, watermarked);
      signatures.set(item.id, signature);
      if (!item.exportedSignatures.includes(signature)) {
        chargeableIds.add(item.id);
      }
    });

    if (remainingExports !== Number.POSITIVE_INFINITY && chargeableIds.size > remainingExports) {
      if (currentPlan === "pack") {
        postNotice("error", `次卡剩余 ${remainingExports} 次，本次最多可导出 ${remainingExports} 条新成品。`);
      } else {
        postNotice("error", "免费版剩余次数不足，本次导出无法完成。");
      }
      return;
    }

    setBusyExport(true);

    try {
      const imageFormat = exportFormat === "jpg" ? "jpg" : "png";
      const exportedFiles: Array<{ itemId: string; signature: string; fileName: string; blob: Blob; isNew: boolean }> = [];
      const failedIds: string[] = [];

      for (const item of items) {
        try {
          const blob = await exportPosterBlob(
            {
              template: activeTemplate,
              projectName: activeProject.name,
              fields: activeProject.fields,
              item,
              watermarked
            },
            imageFormat
          );
          const signature = signatures.get(item.id) ?? "";
          exportedFiles.push({
            itemId: item.id,
            signature,
            blob,
            fileName: getExportFileName(activeProject.name, item.ringNumber, imageFormat),
            isNew: chargeableIds.has(item.id)
          });
        } catch {
          failedIds.push(item.id);
        }
      }

      if (!exportedFiles.length) {
        postNotice("error", "导出失败，请检查预览或素材状态。");
        return;
      }

      if (exportFormat === "zip") {
        await downloadZip(
          `${activeProject.name.replace(/\s+/g, "-").toLowerCase() || "project"}-bundle.zip`,
          exportedFiles.map((file) => ({
            name: file.fileName,
            blob: file.blob
          }))
        );
      } else {
        exportedFiles.forEach((file) => downloadBlob(file.blob, file.fileName));
      }

      patchWorkspace((current) => {
        const synced = syncAccountByBusinessWindow(current.account, new Date());
        const resolved = resolvePlan(synced, new Date());
        const nextAccount = { ...synced };
        const chargedCount = exportedFiles.filter((file) => file.isNew).length;

        if (resolved === "free") {
          nextAccount.freeUsed += chargedCount;
        } else if (resolved === "pack") {
          nextAccount.packCredits = Math.max(0, nextAccount.packCredits - chargedCount);
        }

        return {
          ...current,
          account: nextAccount,
          projects: current.projects.map((project) => {
            if (project.id !== activeProject.id) {
              return project;
            }

            return normalizeProject({
              ...project,
              updatedAt: new Date().toISOString(),
              items: project.items.map((item) => {
                const successFile = exportedFiles.find((file) => file.itemId === item.id);
                if (successFile) {
                  return {
                    ...item,
                    exportStatus: "exported",
                    lastExportedAt: new Date().toISOString(),
                    exportedSignatures: successFile.isNew
                      ? [...item.exportedSignatures, successFile.signature]
                      : item.exportedSignatures
                  };
                }
                if (failedIds.includes(item.id)) {
                  return {
                    ...item,
                    exportStatus: "failed"
                  };
                }
                return item;
              })
            });
          })
        };
      });

      const newCount = exportedFiles.filter((file) => file.isNew).length;
      postNotice(
        "success",
        newCount > 0
          ? `已导出 ${exportedFiles.length} 条记录，本次新增扣减 ${newCount} 次。`
          : `已重复下载 ${exportedFiles.length} 条已导出成品，不重复扣减次数。`
      );
    } finally {
      setBusyExport(false);
    }
  };

  const showcaseProject = activeProject ?? workspace.projects[0] ?? null;
  const showcaseItem = activeItem ?? activeProject?.items[0] ?? workspace.projects[0]?.items[0] ?? null;
  const showcaseTemplate = showcaseProject ? getTemplateById(showcaseProject.templateId) : TEMPLATE_OPTIONS[0];
  const modalPreviewProject = projectModal?.projectId
    ? workspace.projects.find((project) => project.id === projectModal.projectId) ?? showcaseProject
    : showcaseProject;
  const modalPreviewItem = modalPreviewProject?.items.find((item) => item.id === modalPreviewProject.activeItemId) ?? showcaseItem;

  return (
    <main className="min-h-screen px-4 py-5 text-slate-900 md:px-6 xl:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
        <section className="glass-card rounded-[30px] border border-white/80 px-5 py-4 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#1764ff] text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">鸽眼海报</div>
                <div className="text-sm text-slate-500">工作台</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-full bg-[#eff4fb] p-1">
              {[
                { id: "home" as WorkspaceView, label: "首页" },
                { id: "projects" as WorkspaceView, label: "项目列表" },
                { id: "templates" as WorkspaceView, label: "模板库" },
                { id: "upload" as WorkspaceView, label: "素材处理" },
                { id: "edit" as WorkspaceView, label: "海报编辑" },
                { id: "export" as WorkspaceView, label: "导出成品" }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToView(item.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all",
                    workspaceView === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600"
              >
                {getPlanLabel(currentPlan)}
              </button>
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700"
              >
                鸽
              </button>
            </div>
          </div>
        </section>

        <NoticeBanner notice={notice} />

        {workspaceView === "home" ? (
          <>
            <section className="overflow-hidden rounded-[34px] border border-white/80 bg-white px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:px-8 lg:py-10">
              <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
                <div className="space-y-6">
                  <div className="inline-flex rounded-full bg-[#dff7f6] px-3 py-1 text-sm font-medium text-[#0f9a92]">AI 鸽眼识别工作流</div>
                  <div className="space-y-4">
                    <h1 className="max-w-xl text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
                      重新定义赛鸽
                      <br />
                      海报生成
                    </h1>
                    <p className="max-w-xl text-base leading-7 text-slate-500">
                      从项目创建、模板选择到素材上传、成品导出，整套交付流程现在已经按设计稿切成清晰的工作台视图。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => navigateToView("projects")}>立即开始制作</Button>
                    <Button variant="outline" onClick={() => navigateToView("templates")}>
                      浏览模板库
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[24px] bg-[#f3f7fd] p-4">
                      <div className="text-2xl font-semibold text-slate-900">{workspace.projects.length}</div>
                      <div className="mt-1 text-sm text-slate-500">在管项目</div>
                    </div>
                    <div className="rounded-[24px] bg-[#f3f7fd] p-4">
                      <div className="text-2xl font-semibold text-slate-900">{TEMPLATE_OPTIONS.length}</div>
                      <div className="mt-1 text-sm text-slate-500">模板样式</div>
                    </div>
                    <div className="rounded-[24px] bg-[#f3f7fd] p-4">
                      <div className="text-2xl font-semibold text-slate-900">
                        {remainingExports === Number.POSITIVE_INFINITY ? "∞" : remainingExports}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">当前剩余导出</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] bg-[linear-gradient(180deg,#f5f8fc_0%,#edf2f9_100%)] p-4 md:p-6">
                  {showcaseProject && showcaseItem ? (
                    <PosterPreviewCanvas
                      template={showcaseTemplate}
                      project={showcaseProject}
                      item={showcaseItem}
                      watermarked={shouldApplyWatermark(syncedAccount, now)}
                    />
                  ) : (
                    <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                      暂无可预览海报
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[34px] border border-white/80 bg-white px-6 py-8 shadow-[0_20px_70px_rgba(15,23,42,0.06)] lg:px-8">
              <div className="text-center">
                <div className="text-3xl font-semibold text-slate-900">核心功能</div>
                <div className="mt-2 text-sm text-slate-500">从素材识别到模板应用，关键节点都拆成可落地页面。</div>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                {[
                  { icon: Layers3, title: "上架项目", desc: "统一管理赛季、赛事和海报批次，便于后续追踪与复用。" },
                  { icon: Camera, title: "鸽眼识别", desc: "基于命名规则接入眼砂与外形图片，自动完成归组。" },
                  { icon: FileArchive, title: "Excel 导入", desc: "上传表格后自动回填鸽主、地区、成绩等展示字段。" },
                  { icon: Download, title: "批量成品", desc: "按权益规则导出 PNG、JPG 或 ZIP，并保留导出状态。" }
                ].map((feature) => (
                  <div key={feature.title} className="rounded-[24px] border border-slate-200 bg-[#fbfcff] p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf4ff] text-[#1764ff]">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">{feature.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[34px] border border-white/80 bg-white px-6 py-8 shadow-[0_20px_70px_rgba(15,23,42,0.06)] lg:px-8">
              <div className="text-center">
                <div className="text-3xl font-semibold text-slate-900">四步完成专业交付</div>
                <div className="mt-2 text-sm text-slate-500">按设计稿整理成明确的页面顺序，避免原来信息过密的一屏工作台。</div>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                {[
                  ["新建项目并选择模板", "先确定项目名称和说明，再从模板库挑选最终视觉风格。"],
                  ["上传素材并校验", "支持单图、压缩包和 Excel，自动识别足环号与素材类型。"],
                  ["编辑信息与实时预览", "项目级和单羽级字段分列展示，右侧直接看到成品效果。"],
                  ["导出成品与留痕", "按成功记录导出并保留导出状态、失败原因和重复下载规则。"]
                ].map(([title, desc], index) => (
                  <div key={title} className="rounded-[24px] bg-[#f7f9fc] p-5">
                    <div className="text-sm font-semibold text-[#1764ff]">0{index + 1}</div>
                    <div className="mt-3 text-lg font-semibold text-slate-900">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">{desc}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[34px] border border-white/80 bg-white px-6 py-8 shadow-[0_20px_70px_rgba(15,23,42,0.06)] lg:px-8">
              <div className="text-center">
                <div className="text-3xl font-semibold text-slate-900">成品效果展示</div>
                <div className="mt-2 text-sm text-slate-500">模板卡片现在和编辑器预览统一到同一套视觉语言。</div>
              </div>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {TEMPLATE_OPTIONS.slice(0, 3).map((template) => (
                  <div key={template.id} className="space-y-3">
                    <PosterCardMockup template={template} item={showcaseItem} />
                    <div className="px-1">
                      <div className="text-base font-semibold text-slate-900">{template.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{template.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {workspaceView === "projects" ? (
          <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-3xl font-semibold text-slate-900">项目列表</div>
                <div className="mt-2 text-sm text-slate-500">用于查看、管理和继续处理你的赛绩项目。</div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="搜索项目名称"
                  className="w-full sm:w-[280px]"
                />
                <Button onClick={openCreateProject}>
                  <Plus className="mr-2 h-4 w-4" />
                  新建项目
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr),300px]">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredProjects.map((project) => {
                  const template = getTemplateById(project.templateId);
                  const isActive = project.id === activeProject?.id;
                  const successCount = project.items.filter((item) => item.status === "success").length;
                  const progress = project.items.length ? Math.round((successCount / project.items.length) * 100) : 0;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => selectProject(project.id)}
                      className={cn(
                        "rounded-[28px] border p-5 text-left transition-all",
                        isActive ? "border-[#1764ff] bg-[#f4f8ff] shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">{project.name}</div>
                          <div className="mt-2 text-sm leading-6 text-slate-500">{project.description || "暂无项目说明"}</div>
                        </div>
                        <Badge variant={template.tier === "free" ? "secondary" : "accent"}>{template.tier === "free" ? "免费" : "付费"}</Badge>
                      </div>
                      <div className="mt-4 text-xs text-slate-400">{template.name}</div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#1764ff]" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                        <span>{successCount} / {project.items.length || 0} 条成功</span>
                        <span>{formatBeijingDateTime(project.updatedAt)}</span>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectProject(project.id);
                            navigateToView("edit");
                          }}
                        >
                          继续编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectProject(project.id);
                            navigateToView("templates");
                          }}
                        >
                          选择模板
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteProject(project.id);
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
                    没有匹配项目，点击右上角继续创建。
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] bg-[linear-gradient(180deg,#1968ff_0%,#1559db_100%)] p-5 text-white shadow-[0_20px_40px_rgba(25,104,255,0.22)]">
                  <div className="text-sm text-white/80">当前权益</div>
                  <div className="mt-3 text-2xl font-semibold">{getPlanLabel(currentPlan)}</div>
                  <div className="mt-2 text-sm text-white/80">
                    {remainingExports === Number.POSITIVE_INFINITY ? "导出额度不限" : `剩余导出 ${remainingExports} 次`}
                  </div>
                  <Button variant="secondary" className="mt-5 w-full" onClick={() => setAccountOpen(true)}>
                    <Wallet className="mr-2 h-4 w-4" />
                    查看账户
                  </Button>
                </div>
                <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
                  <div className="text-base font-semibold text-slate-900">规则提示</div>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
                    <div>免费版每日 3 次，单次仅允许 1 条成功记录。</div>
                    <div>次卡按新导出成品数量扣减，重复下载不重复计费。</div>
                    <div>月付版无水印，可使用全部模板与批量导出。</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {workspaceView === "templates" ? (
          <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-3xl font-semibold text-slate-900">选择海报模板</div>
                <div className="mt-2 text-sm text-slate-500">
                  探索由真稿校正过的模板风格，支持高分辨率海报输出与社交媒体自动适配。
                </div>
              </div>
              <div className="text-sm text-slate-500">
                {activeProject ? `当前项目：${activeProject.name}` : "请先创建项目，再确认模板。"}
              </div>
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {TEMPLATE_OPTIONS.map((template) => {
                const locked = template.tier === "paid" && !canUsePaidTemplates(syncedAccount, now);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      if (!activeProject) {
                        openCreateProject();
                        return;
                      }
                      if (locked) {
                        setAccountOpen(true);
                        postNotice("error", "当前模板需要先升级权益。");
                        return;
                      }
                      openTemplateModal(activeProject, template.id);
                    }}
                    className="text-left"
                  >
                    <PosterCardMockup
                      template={template}
                      item={showcaseItem}
                      locked={locked}
                      className={cn(activeProject?.templateId === template.id && "ring-2 ring-[#1764ff] ring-offset-2")}
                    />
                    <div className="mt-3 px-1">
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold text-slate-900">{template.name}</div>
                        <Badge variant={template.tier === "free" ? "secondary" : "accent"}>{template.tier === "free" ? "免费模板" : "付费模板"}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{template.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {!activeProject ? (
              <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-[#f9fbfd] p-8 text-center text-sm text-slate-500">
                还没有可编辑项目，先创建项目再进入模板确认流程。
              </div>
            ) : null}
          </section>
        ) : null}

        {workspaceView === "upload" ? (
          <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            {!activeProject ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
                <FolderKanban className="h-14 w-14 text-slate-300" />
                <div className="text-2xl font-semibold text-slate-900">还没有可用项目</div>
                <div className="text-sm text-slate-500">请先创建项目并确认模板，再上传素材。</div>
                <Button onClick={openCreateProject}>新建项目</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-3xl font-semibold text-slate-900">素材上传与处理</div>
                    <div className="mt-2 text-sm text-slate-500">上传素材后，系统将自动识别、配对并生成鸽眼记录。</div>
                  </div>
                  <div className="rounded-full bg-[#f3f7fd] px-4 py-2 text-sm text-slate-500">{activeProject.name}</div>
                </div>

                <div className="mt-8 grid gap-5 xl:grid-cols-[360px,minmax(0,1fr)]">
                  <div className="space-y-4">
                    <label className="flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-[#cfd8e6] bg-[#fafcff] px-6 text-center transition hover:border-[#1764ff] hover:bg-white">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#edf4ff] text-[#1764ff]">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div className="text-xl font-semibold text-slate-900">{busyUpload ? "处理中..." : "拖入文件，或点击上传"}</div>
                      <div className="mt-3 max-w-[220px] text-sm leading-6 text-slate-500">
                        支持 JPG、PNG、Excel、ZIP 格式。
                        <br />
                        单张图片最大 20MB。
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

                    <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <ShieldCheck className="h-4 w-4 text-[#1764ff]" />
                        命名规则建议
                      </div>
                      <div className="mt-3 space-y-3 text-sm text-slate-500">
                        <div className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3">
                          <span>足环号_a.jpg</span>
                          <StatusDot text="鸽眼" tone="success" />
                        </div>
                        <div className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3">
                          <span>足环号_b.jpg</span>
                          <StatusDot text="外形" tone="neutral" />
                        </div>
                        <div className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3">
                          <span>records.xlsx</span>
                          <StatusDot text="表格" tone="warning" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-slate-200 bg-[#fbfcff] p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xl font-semibold text-slate-900">处理队列</div>
                          <div className="mt-1 text-sm text-slate-500">{activeProject.items.length} 条记录</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => navigateToView("edit")} disabled={!activeProject.items.length}>
                          进入编辑
                        </Button>
                      </div>
                      <div className="mt-5 space-y-4">
                        {activeProject.items.map((item) => (
                          <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex gap-2">
                                  <div className="h-20 w-20 overflow-hidden rounded-[18px] bg-[#f4f7fb]">
                                    {item.eyeImageSrc ? <img src={item.eyeImageSrc} alt={item.ringNumber} className="h-full w-full object-cover" /> : null}
                                  </div>
                                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[18px] bg-[#f4f7fb]">
                                    {item.bodyImageSrc ? (
                                      <img src={item.bodyImageSrc} alt={item.ringNumber} className="h-full w-full object-contain" />
                                    ) : (
                                      <span className="text-xs text-slate-400">待补</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-lg font-semibold text-slate-900">{item.ringNumber}</div>
                                  <div className="mt-1 text-sm text-slate-500">{item.owner}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <StatusDot
                                      text={getRecordStatusLabel(item.status)}
                                      tone={item.status === "success" ? "success" : item.status === "processing" ? "warning" : "danger"}
                                    />
                                    {item.exportStatus === "exported" ? <StatusDot text="已导出" tone="neutral" /> : null}
                                  </div>
                                  {item.failureReason ? <div className="mt-2 text-sm text-rose-500">{item.failureReason}</div> : null}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    selectActiveItem(item.id);
                                    navigateToView("edit");
                                  }}
                                >
                                  补充素材
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => retryItem(item.id)}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  重新校验
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  删除
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {!activeProject.items.length ? (
                          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                            暂无识别记录，先从左侧上传素材。
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Button variant="ghost" onClick={() => navigateToView("templates")}>
                        返回上一步
                      </Button>
                      <div className="text-sm text-slate-400">
                        1 / 3 记录就绪
                      </div>
                      <Button onClick={() => navigateToView("edit")} disabled={!activeProject.items.length}>
                        进入基础编辑
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {workspaceView === "edit" ? (
          <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            {!activeProject ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
                <FolderKanban className="h-14 w-14 text-slate-300" />
                <div className="text-2xl font-semibold text-slate-900">暂无可编辑项目</div>
                <div className="text-sm text-slate-500">请先创建项目并上传素材。</div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm text-[#1764ff]">项目 / {activeProject.name} / 基础编辑</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <div className="text-3xl font-semibold text-slate-900">{activeProject.name}</div>
                      <Badge variant={activeTemplate.tier === "free" ? "secondary" : "accent"}>{activeTemplate.name}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input placeholder="搜索足环号..." className="w-full sm:w-[260px]" />
                    <Button onClick={() => navigateToView("export")}>去导出</Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[240px,420px,minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f7f9fc]">
                    <div className="border-b border-slate-200 px-4 py-4 text-sm font-semibold text-slate-900">所选记录 ({activeProject.items.length})</div>
                    <div className="divide-y divide-slate-200">
                      {activeProject.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectActiveItem(item.id)}
                          className={cn(
                            "flex w-full gap-3 px-4 py-4 text-left transition-colors",
                            item.id === activeItem?.id ? "bg-white" : "hover:bg-white/70"
                          )}
                        >
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[14px] bg-white">
                            {item.eyeImageSrc ? (
                              <img src={item.eyeImageSrc} alt={item.ringNumber} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full bg-slate-100" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">{item.ringNumber}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.owner}</div>
                            <div className="mt-2">
                              <StatusDot
                                text={getRecordStatusLabel(item.status)}
                                tone={item.status === "success" ? "success" : item.status === "processing" ? "warning" : "danger"}
                              />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white">
                    <div className="flex gap-2 border-b border-slate-100 px-5 py-4 text-sm">
                      <div className="rounded-full bg-[#edf4ff] px-4 py-2 font-semibold text-[#1764ff]">公共信息</div>
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-slate-500">单羽信息</div>
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-slate-500">展示信息</div>
                    </div>
                    <div className="space-y-5 px-5 py-5">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <FieldLabel title="标题" />
                          <Input value={activeProject.fields.title} onChange={(event) => updateProjectField("title", event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <FieldLabel title="副标题" />
                          <Input value={activeProject.fields.subtitle} onChange={(event) => updateProjectField("subtitle", event.target.value)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FieldLabel title="联系人" />
                            <Input value={activeProject.fields.contactName} onChange={(event) => updateProjectField("contactName", event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <FieldLabel title="手机号" />
                            <Input value={activeProject.fields.phone} onChange={(event) => updateProjectField("phone", event.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <FieldLabel title="微信号" />
                          <Input value={activeProject.fields.wechat} onChange={(event) => updateProjectField("wechat", event.target.value)} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                            <FieldLabel title="鸽舍 Logo" />
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                              onChange={(event) => {
                                void handleProjectImageField("logoSrc", event.target.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                            />
                          </div>
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                            <FieldLabel title="二维码" />
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                              onChange={(event) => {
                                void handleProjectImageField("qrCodeSrc", event.target.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {activeItem ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel title="足环号" />
                              <Input value={activeItem.ringNumber} onChange={(event) => updateActiveItem({ ringNumber: event.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel title="性别" />
                              <select
                                value={activeItem.gender}
                                onChange={(event) => updateActiveItem({ gender: event.target.value })}
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-[#f7f9fc] px-4 text-sm text-slate-800"
                              >
                                <option value="雄">雄</option>
                                <option value="雌">雌</option>
                                <option value="未知">未知</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel title="鸽眼方向" hint={`自动识别 ${activeItem.eyeDirectionAuto}`} />
                              <select
                                value={activeItem.eyeDirectionFinal}
                                onChange={(event) => updateActiveItem({ eyeDirectionFinal: event.target.value as ProjectItem["eyeDirectionFinal"] })}
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-[#f7f9fc] px-4 text-sm text-slate-800"
                              >
                                <option value="左">左</option>
                                <option value="右">右</option>
                                <option value="居中">居中</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <FieldLabel title="外形方向" hint={`自动识别 ${activeItem.bodyDirectionAuto}`} />
                              <select
                                value={activeItem.bodyDirectionFinal}
                                onChange={(event) => updateActiveItem({ bodyDirectionFinal: event.target.value as ProjectItem["bodyDirectionFinal"] })}
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-[#f7f9fc] px-4 text-sm text-slate-800"
                              >
                                <option value="左">左</option>
                                <option value="右">右</option>
                                <option value="居中">居中</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                              <FieldLabel title="补充 / 替换鸽眼图" />
                              <input
                                type="file"
                                accept="image/*"
                                className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                                onChange={(event) => {
                                  void handleRecordImageField(activeItem.id, "eyeImageSrc", event.target.files?.[0]);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </div>
                            <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4">
                              <FieldLabel title="补充 / 替换外形图" />
                              <input
                                type="file"
                                accept="image/*"
                                className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                                onChange={(event) => {
                                  void handleRecordImageField(activeItem.id, "bodyImageSrc", event.target.files?.[0]);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel title="鸽主名称" />
                              <Input value={activeItem.owner} onChange={(event) => updateActiveItem({ owner: event.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel title="所属地区" />
                              <Input value={activeItem.region} onChange={(event) => updateActiveItem({ region: event.target.value })} />
                            </div>
                          </div>
                          <div className="grid gap-3">
                            <div className="space-y-2">
                              <FieldLabel title="赛事成绩" />
                              <Input value={activeItem.raceRank} onChange={(event) => updateActiveItem({ raceRank: event.target.value })} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <FieldLabel title="风速" />
                                <Input value={activeItem.windSpeed} onChange={(event) => updateActiveItem({ windSpeed: event.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <FieldLabel title="上笼羽数" />
                                <Input value={activeItem.basketCount} onChange={(event) => updateActiveItem({ basketCount: event.target.value })} />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <FieldLabel title="备注说明" />
                            <TextArea value={activeItem.note} onChange={(event) => updateActiveItem({ note: event.target.value })} />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#f7f9fc] p-5 text-sm text-slate-500">
                          暂无记录，请先上传素材。
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={applyProjectFieldsToAll}>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          应用字段
                        </Button>
                        <Button variant="outline" onClick={resetActiveItem} disabled={!activeItem}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          恢复默认
                        </Button>
                        <Button variant="outline" onClick={() => navigateToView("templates")}>
                          <Layers3 className="mr-2 h-4 w-4" />
                          切换模板
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activeItem ? (
                      <>
                        <PosterPreviewCanvas
                          template={activeTemplate}
                          project={activeProject}
                          item={activeItem}
                          watermarked={shouldApplyWatermark(syncedAccount, now)}
                        />
                        <div className="rounded-[24px] border border-slate-200 bg-[#f7f9fc] p-4 text-sm leading-6 text-slate-500">
                          右侧预览已经切成接近设计稿的海报排版。修改方向、标题、联系人或素材后，会立即反馈到版面中。
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[480px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-[#f7f9fc] text-sm text-slate-500">
                        选择左侧记录后查看预览
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {workspaceView === "export" ? (
          <section className="rounded-[34px] border border-white/80 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            {!activeProject ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
                <FolderKanban className="h-14 w-14 text-slate-300" />
                <div className="text-2xl font-semibold text-slate-900">暂无导出项目</div>
                <div className="text-sm text-slate-500">先完成模板确认、素材上传与基础编辑。</div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-3xl font-semibold text-slate-900">导出成品</div>
                    <div className="mt-2 text-sm text-slate-500">按当前权益规则导出记录，并保留失败原因和已导出状态。</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => navigateToView("edit")}>
                      返回编辑
                    </Button>
                    <Button onClick={() => void exportItems(successItems)} disabled={!successItems.length || busyExport}>
                      <Download className="mr-2 h-4 w-4" />
                      {busyExport ? "批量导出中..." : "批量导出"}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] bg-[#f7f9fc] p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-[22px] bg-white p-4">
                      <div className="text-sm text-slate-500">当前模板</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{activeTemplate.name}</div>
                    </div>
                    <div className="rounded-[22px] bg-white p-4">
                      <div className="text-sm text-slate-500">导出格式</div>
                      <div className="mt-2 flex flex-wrap gap-2">
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
                    <div className="rounded-[22px] bg-white p-4">
                      <div className="text-sm text-slate-500">权益说明</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">
                        {currentPlan === "free"
                          ? "免费版单次仅允许 1 条成功记录，且导出强制附带平台水印。"
                          : currentPlan === "pack"
                            ? `次卡剩余 ${remainingExports} 次，本次按新导出成品数量扣减。`
                            : "月付版不限导出张数，无平台水印。"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {activeProject.items.map((item) => (
                    <div key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="w-[120px] shrink-0">
                            <PosterCardMockup
                              template={activeTemplate}
                              item={item}
                              title={item.ringNumber}
                              subtitle={item.owner}
                              className="p-2"
                            />
                          </div>
                          <div>
                            <div className="text-xl font-semibold text-slate-900">{item.ringNumber}</div>
                            <div className="mt-1 text-sm text-slate-500">
                              {item.lastExportedAt ? `生成于 ${formatBeijingDateTime(item.lastExportedAt)}` : "尚未生成导出成品"}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <StatusDot
                                text={getRecordStatusLabel(item.status)}
                                tone={item.status === "success" ? "success" : item.status === "processing" ? "warning" : "danger"}
                              />
                              <StatusDot
                                text={item.exportStatus === "exported" ? "已导出" : item.exportStatus === "failed" ? "导出失败" : "未导出"}
                                tone={item.exportStatus === "exported" ? "neutral" : item.exportStatus === "failed" ? "danger" : "neutral"}
                              />
                            </div>
                            {item.failureReason ? <div className="mt-3 text-sm text-rose-500">{item.failureReason}</div> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={item.status !== "success" || busyExport} onClick={() => void exportItems([item])}>
                            <FileImage className="mr-2 h-4 w-4" />
                            下载
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              selectActiveItem(item.id);
                              navigateToView("edit");
                            }}
                          >
                            返回编辑
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => retryItem(item.id)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            重试
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>

      {projectModal ? (
        <ModalShell
          title={projectModal.mode === "create" ? "创建海报项目" : "确认模板"}
          description={projectModal.mode === "create" ? "先建立项目，再进入模板确认与素材处理流程。" : "补充基础信息后确认模板，即可进入上传阶段。"}
          onClose={() => setProjectModal(null)}
        >
          {projectModal.mode === "create" ? (
            <div className="grid gap-8 p-7 lg:grid-cols-[minmax(0,1fr),320px]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <FieldLabel title="项目名称" />
                  <Input value={projectModal.draft.name} onChange={(event) => updateProjectDraft({ name: event.target.value })} placeholder="例如：2024 秋季公棚冠军赛海报" />
                </div>
                <div className="space-y-2">
                  <FieldLabel title="项目备注 / 描述" />
                  <TextArea
                    value={projectModal.draft.description}
                    onChange={(event) => updateProjectDraft({ description: event.target.value })}
                    placeholder="在此输入项目背景、海报要求或赛事说明..."
                    className="min-h-[180px] bg-[#f7f9fc]"
                  />
                </div>
                <div className="rounded-[24px] bg-[#eafcff] p-4 text-sm text-[#0d7e9f]">
                  推荐先建立项目，再在下一步选择专业模板并补充主标题、联系人和 Logo。
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setProjectModal(null)}>
                    取消
                  </Button>
                  <Button onClick={saveProjectModal}>创建</Button>
                </div>
              </div>

              <div className="rounded-[30px] bg-[linear-gradient(180deg,#f5f7fb_0%,#eff3f9_100%)] p-5">
                <div className="text-lg font-semibold text-slate-900">专业赛鸽模板</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">
                  创建后将默认进入模板确认页，可继续挑选风格并补充展示信息。
                </div>
                <div className="mt-6">
                  <PosterCardMockup template={TEMPLATE_OPTIONS[0]} item={showcaseItem} />
                </div>
                <div className="mt-6 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-300">
                  <span>V2.4 Optical Lens</span>
                  <span>Confidential Studio Data</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-0 lg:grid-cols-[420px,minmax(0,1fr)]">
              <div className="border-b border-slate-100 p-7 lg:border-b-0 lg:border-r">
                <div className="space-y-5">
                  <div className="rounded-[22px] bg-[#f4f8ff] px-4 py-3 text-sm font-medium text-[#1764ff]">
                    当前模板：{getTemplateById(projectModal.draft.templateId).name}
                  </div>
                  <div className="space-y-2">
                    <FieldLabel title="海报主标题" />
                    <Input value={projectModal.draft.fields.title} onChange={(event) => updateProjectDraftField("title", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel title="副标题 / 赛事信息" />
                    <Input value={projectModal.draft.fields.subtitle} onChange={(event) => updateProjectDraftField("subtitle", event.target.value)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel title="联系人" />
                      <Input value={projectModal.draft.fields.contactName} onChange={(event) => updateProjectDraftField("contactName", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel title="手机号" />
                      <Input value={projectModal.draft.fields.phone} onChange={(event) => updateProjectDraftField("phone", event.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel title="微信号" />
                    <Input value={projectModal.draft.fields.wechat} onChange={(event) => updateProjectDraftField("wechat", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel title="项目名称" />
                    <Input value={projectModal.draft.name} onChange={(event) => updateProjectDraft({ name: event.target.value })} />
                  </div>
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f7f9fc] p-5">
                    <FieldLabel title="品牌标识" hint="支持 PNG、JPG、SVG" />
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2"
                      onChange={(event) => {
                        void handleProjectDraftLogo(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setProjectModal(null)}>
                      取消
                    </Button>
                    <Button onClick={saveProjectModal}>确认</Button>
                  </div>
                </div>
              </div>

              <div className="bg-[linear-gradient(180deg,#f3f6fb_0%,#eceff5_100%)] p-7">
                {modalPreviewProject && (modalPreviewItem ?? showcaseItem) ? (
                  <PosterPreviewCanvas
                    template={getTemplateById(projectModal.draft.templateId)}
                    project={{
                      ...modalPreviewProject,
                      name: projectModal.draft.name,
                      description: projectModal.draft.description,
                      templateId: projectModal.draft.templateId,
                      fields: {
                        ...modalPreviewProject.fields,
                        ...projectModal.draft.fields
                      }
                    }}
                    item={(modalPreviewItem ?? showcaseItem)!}
                    watermarked={shouldApplyWatermark(syncedAccount, now)}
                  />
                ) : (
                  <div className="flex min-h-[560px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                    当前暂无可用于预览的素材
                  </div>
                )}
              </div>
            </div>
          )}
        </ModalShell>
      ) : null}

      {accountOpen ? (
        <ModalShell title="我的 / 账户" description="查看免费额度、模板权限和购买记录。" onClose={() => setAccountOpen(false)}>
          <div className="space-y-6 p-7">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-[28px] bg-[linear-gradient(180deg,#1968ff_0%,#1459dc_100%)] p-5 text-white">
                <div className="text-sm text-white/80">当前权益</div>
                <div className="mt-3 text-3xl font-semibold">{getPlanLabel(currentPlan)}</div>
                <div className="mt-2 text-sm text-white/80">
                  {remainingExports === Number.POSITIVE_INFINITY ? "不限导出" : `剩余 ${remainingExports} 次`}
                </div>
              </div>
              <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
                <div className="text-sm text-slate-500">模板权限</div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  {canUsePaidTemplates(syncedAccount, now) ? "全部模板已解锁" : "当前仅免费模板"}
                </div>
                <div className="mt-2 text-sm text-slate-500">{shouldApplyWatermark(syncedAccount, now) ? "导出含平台水印" : "导出无平台水印"}</div>
              </div>
              <div className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-5">
                <div className="text-sm text-slate-500">重置时间</div>
                <div className="mt-3 text-lg font-semibold text-slate-900">{formatCountdown(nextResetAt, clock)}</div>
                <div className="mt-2 text-sm text-slate-500">北京时间 {formatBeijingDateTime(nextResetAt)}</div>
              </div>
            </div>

            <div>
              <div className="text-xl font-semibold text-slate-900">购买商品</div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {PRODUCT_OPTIONS.map((product) => (
                  <div key={product.id} className="rounded-[28px] border border-slate-200 bg-white p-5">
                    <div className="text-lg font-semibold text-slate-900">{product.name}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">{product.description}</div>
                    <div className="mt-5 text-3xl font-semibold text-slate-900">{product.priceLabel}</div>
                    <Button className="mt-5 w-full" onClick={() => startPurchase(product)}>
                      立即购买
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xl font-semibold text-slate-900">订单记录</div>
              <div className="mt-4 space-y-3">
                {workspace.account.orders.map((order) => (
                  <div key={order.id} className="rounded-[24px] border border-slate-200 bg-[#f7f9fc] p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{order.productName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          创建于 {formatBeijingDateTime(order.createdAt)} · {order.amountLabel}
                        </div>
                      </div>
                      <StatusDot text={order.status === "paid" ? "已支付" : "待支付"} tone={order.status === "paid" ? "success" : "warning"} />
                    </div>
                  </div>
                ))}
                {!workspace.account.orders.length ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#f7f9fc] p-4 text-sm text-slate-500">
                    暂无订单记录。
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {paymentState ? (
        <ModalShell title="支付弹窗" description="创建订单后展示二维码，模拟支付成功即可刷新权益。" onClose={() => setPaymentState(null)}>
          <div className="grid gap-6 p-7 lg:grid-cols-[1fr,360px]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6">
              <div className="text-xl font-semibold text-slate-900">{paymentState.product.name}</div>
              <div className="mt-2 text-sm text-slate-500">{paymentState.product.description}</div>
              <div className="mt-6 rounded-[26px] bg-[#f7f9fc] p-6 text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[24px] bg-[#1764ff] text-white">
                  <QrCode className="h-12 w-12" />
                </div>
                <div className="mt-4 text-2xl font-semibold text-slate-900">{paymentState.product.priceLabel}</div>
                <div className="mt-2 text-sm text-slate-500">订单号：{paymentState.orderId}</div>
              </div>
              <Button className="mt-6 w-full" onClick={confirmPayment}>
                模拟支付成功
              </Button>
            </div>

            <div className="space-y-4 rounded-[30px] bg-[#f7f9fc] p-6">
              <div className="text-lg font-semibold text-slate-900">支付后生效</div>
              <div className="rounded-[22px] bg-white p-4 text-sm text-slate-600">
                {paymentState.product.kind === "pack"
                  ? `次卡将增加 ${paymentState.product.credits ?? 0} 次导出额度，并解锁全部模板。`
                  : `月付版将生效 ${paymentState.product.days ?? 30} 天，导出不限量且无水印。`}
              </div>
              <div className="rounded-[22px] bg-white p-4 text-sm text-slate-600">支付完成后，当前账户状态和订单列表会立即刷新。</div>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}
