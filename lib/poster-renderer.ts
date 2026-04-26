import type { PosterTemplate, ProjectFields, ProjectItem } from "@/lib/pigeon-studio";

export const POSTER_WIDTH = 1200;
export const POSTER_HEIGHT = 1680;

interface RenderPayload {
  template: PosterTemplate;
  projectName: string;
  fields: ProjectFields;
  item: ProjectItem;
  watermarked: boolean;
}

interface ExportFile {
  name: string;
  bytes: Uint8Array;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth: number
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = Infinity
) {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let currentLine = "";
    for (const char of paragraph) {
      const nextLine = `${currentLine}${char}`;
      if (ctx.measureText(nextLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = nextLine;
      }
      if (lines.length >= maxLines) {
        break;
      }
    }

    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }
  });

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (maxLines !== Infinity && lines.length === maxLines) {
    const lastLine = lines[maxLines - 1] ?? "";
    const ellipsis = "…";
    let trimmed = lastLine;
    while (trimmed && ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[maxLines - 1] = trimmed ? `${trimmed}${ellipsis}` : ellipsis;
  }

  return lines;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  options: {
    text: string;
    x: number;
    y: number;
    maxWidth: number;
    maxLines?: number;
    lineHeight: number;
    fill: string;
    align?: CanvasTextAlign;
  }
) {
  const { text, x, y, maxWidth, maxLines = Infinity, lineHeight, fill, align = "left" } = options;
  const lines = wrapText(ctx, text || "-", maxWidth, maxLines);
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  lines.forEach((line, lineIndex) => {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
  });
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  fill: string,
  textColor: string
) {
  ctx.font = '600 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  const width = ctx.measureText(label).width + 36;
  fillRoundedRect(ctx, x, y, width, 44, 22, fill);
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 18, y + 22);
  ctx.textBaseline = "alphabetic";
}

function drawStatRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) {
  ctx.font = '500 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = "rgba(28, 27, 29, 0.48)";
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#1b1c1f";
  ctx.textAlign = "right";
  ctx.fillText(value || "-", x + width, y);
  ctx.textAlign = "left";
}

function drawMedalStat(
  ctx: CanvasRenderingContext2D,
  options: {
    x: number;
    y: number;
    title: string;
    value: string;
    accent: string;
  }
) {
  const { x, y, title, value, accent } = options;

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x + 38, y + 34, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 26, y + 58);
  ctx.lineTo(x + 18, y + 84);
  ctx.lineTo(x + 38, y + 72);
  ctx.lineTo(x + 58, y + 84);
  ctx.lineTo(x + 50, y + 58);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(58,68,84,0.74)";
  ctx.font = '500 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, x + 82, y + 24);
  ctx.fillStyle = accent;
  ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(value, x + 82, y + 62);
}

function drawPlaceholderCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  label: string,
  accent: string
) {
  fillRoundedRect(ctx, x, y, width, height, 40, fill);
  strokeRoundedRect(ctx, x, y, width, height, 40, "rgba(255,255,255,0.38)", 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height / 2 - 20, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(12, 18, 16, 0.64)";
  ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(label, x + width / 2, y + height / 2 + 170);
  ctx.textAlign = "left";
}

async function loadImage(src?: string) {
  if (!src) {
    return null;
  }

  let imagePromise = imageCache.get(src);
  if (!imagePromise) {
    imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image-load-failed"));
      image.src = src;
    });
    imageCache.set(src, imagePromise);
  }

  try {
    return await imagePromise;
  } catch {
    imageCache.delete(src);
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("blob-export-failed"));
    }, mimeType, quality);
  });
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "poster";
}

async function blobToUint8Array(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toArrayBufferPart(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function renderPosterToCanvas(canvas: HTMLCanvasElement, payload: RenderPayload) {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("missing-canvas-context");
  }

  const [eyeImage, bodyImage, logoImage, qrImage] = await Promise.all([
    loadImage(payload.item.eyeImageSrc),
    loadImage(payload.item.bodyImageSrc),
    loadImage(payload.fields.logoSrc),
    loadImage(payload.fields.qrCodeSrc)
  ]);

  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const background = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
  background.addColorStop(0, payload.template.backgroundFrom);
  background.addColorStop(1, payload.template.backgroundTo);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  fillRoundedRect(ctx, 52, 40, POSTER_WIDTH - 104, POSTER_HEIGHT - 80, 42, "#ffffff");
  ctx.save();
  ctx.shadowColor = "rgba(18, 34, 67, 0.08)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 20;
  strokeRoundedRect(ctx, 52, 40, POSTER_WIDTH - 104, POSTER_HEIGHT - 80, 42, "rgba(218,226,238,0.9)", 2);
  ctx.restore();

  fillRoundedRect(ctx, 86, 82, 180, 34, 17, "#195fc8");
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("CHAMPION BREED", 108, 105);

  ctx.fillStyle = payload.template.accent;
  ctx.font = '800 62px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("海报制作", 362, 146);
  ctx.strokeStyle = payload.template.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(302, 138);
  ctx.lineTo(345, 138);
  ctx.stroke();
  ctx.strokeStyle = "#d7dfea";
  ctx.beginPath();
  ctx.moveTo(666, 138);
  ctx.lineTo(1098, 138);
  ctx.stroke();

  ctx.fillStyle = "rgba(88,105,135,0.76)";
  ctx.font = '500 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(payload.projectName, 1096, 108);
  ctx.textAlign = "left";

  const eyeOnLeft = payload.item.eyeDirectionFinal !== "右";
  const eyeCenterX = eyeOnLeft ? 250 : 930;
  const bodyX = eyeOnLeft ? 374 : 96;
  const bodyWidth = eyeOnLeft ? 692 : 720;

  ctx.save();
  ctx.beginPath();
  ctx.arc(eyeCenterX, 330, 150, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (eyeImage) {
    drawImageCover(ctx, eyeImage, eyeCenterX - 150, 180, 300, 300);
  } else {
    const eyeFallback = ctx.createRadialGradient(eyeCenterX, 330, 24, eyeCenterX, 330, 150);
    eyeFallback.addColorStop(0, "#1f1815");
    eyeFallback.addColorStop(0.4, payload.template.accent);
    eyeFallback.addColorStop(1, "#f6d385");
    ctx.fillStyle = eyeFallback;
    ctx.fillRect(eyeCenterX - 150, 180, 300, 300);
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#f1a336";
  ctx.beginPath();
  ctx.arc(eyeCenterX, 330, 156, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = payload.template.accent;
  ctx.beginPath();
  ctx.arc(eyeCenterX, 330, 170, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (bodyImage) {
    drawImageContain(ctx, bodyImage, bodyX, 144, bodyWidth, 866);
  } else {
    drawPlaceholderCard(ctx, bodyX + 68, 212, bodyWidth - 136, 580, "#faf5f3", "待补充外形图", payload.template.accent);
  }

  const titleText = payload.fields.title || "赛绩海报";
  const subTitle = payload.fields.subtitle || "鸽眼智能生成";
  ctx.fillStyle = "rgba(86,102,126,0.8)";
  ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  drawTextBlock(ctx, {
    text: titleText,
    x: 90,
    y: 574,
    maxWidth: 260,
    maxLines: 2,
    lineHeight: 30,
    fill: "rgba(79,95,119,0.88)"
  });
  drawTextBlock(ctx, {
    text: subTitle,
    x: 90,
    y: 636,
    maxWidth: 260,
    maxLines: 2,
    lineHeight: 30,
    fill: "rgba(106,120,142,0.78)"
  });

  fillRoundedRect(ctx, 88, 984, 210, 78, 12, "#f8e1a5");
  ctx.fillStyle = payload.template.accent;
  ctx.font = '800 54px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("冠军", 120, 1038);

  fillRoundedRect(ctx, 246, 994, 690, 62, 10, payload.template.accent);
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(payload.item.ringNumber || "未命名记录", 286, 1034);

  ctx.fillStyle = "#5b6474";
  ctx.font = '500 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`鸽主：${payload.item.owner || "待填写"}`, 90, 1118);
  ctx.fillText(`电话：${payload.fields.phone || "-"}`, 430, 1118);
  ctx.fillText(`地区：${payload.item.region || "待填写"}`, 772, 1118);

  ctx.strokeStyle = "#e8edf5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 1142);
  ctx.lineTo(1110, 1142);
  ctx.stroke();

  drawMedalStat(ctx, {
    x: 114,
    y: 1184,
    title: "200 公里",
    value: payload.item.raceRank || "冠军",
    accent: "#d9a126"
  });
  drawMedalStat(ctx, {
    x: 452,
    y: 1184,
    title: "300 公里",
    value: payload.item.windSpeed || "冠军",
    accent: "#d9a126"
  });
  drawMedalStat(ctx, {
    x: 790,
    y: 1184,
    title: "400 公里",
    value: payload.item.basketCount || "冠军",
    accent: "#d9a126"
  });

  fillRoundedRect(ctx, 86, 1488, 1028, 74, 0, "#ffffff");
  ctx.fillStyle = payload.template.accent;
  ctx.beginPath();
  ctx.moveTo(86, 1518);
  ctx.quadraticCurveTo(340, 1464, 632, 1514);
  ctx.quadraticCurveTo(888, 1554, 1114, 1498);
  ctx.lineTo(1114, 1562);
  ctx.lineTo(86, 1562);
  ctx.closePath();
  ctx.fill();

  if (logoImage) {
    ctx.save();
    roundedRectPath(ctx, 88, 86, 48, 48, 14);
    ctx.clip();
    drawImageCover(ctx, logoImage, 88, 86, 48, 48);
    ctx.restore();
  }

  if (qrImage) {
    fillRoundedRect(ctx, 936, 1300, 152, 152, 24, "#ffffff");
    strokeRoundedRect(ctx, 936, 1300, 152, 152, 24, "#e2e8f2", 2);
    ctx.save();
    roundedRectPath(ctx, 952, 1316, 120, 120, 18);
    ctx.clip();
    drawImageCover(ctx, qrImage, 952, 1316, 120, 120);
    ctx.restore();
  }

  ctx.fillStyle = "#243042";
  ctx.font = '700 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(payload.fields.contactName || "联系人待填写", 90, 1360);
  ctx.font = '500 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = "#6c7688";
  ctx.fillText(`微信：${payload.fields.wechat || "-"}`, 90, 1400);
  drawTextBlock(ctx, {
    text: payload.item.note || "暂无补充说明",
    x: 90,
    y: 1450,
    maxWidth: 760,
    maxLines: 3,
    lineHeight: 32,
    fill: "#788297"
  });

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = '600 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("鸽眼海报工作台", 940, 1588);

  if (payload.watermarked) {
    ctx.save();
    ctx.translate(610, 840);
    ctx.rotate(-Math.PI / 6);
    ctx.font = '700 92px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "rgba(22,56,116,0.08)";
    ctx.textAlign = "center";
    ctx.fillText("免费版预览水印", 0, 0);
    ctx.restore();
    fillRoundedRect(ctx, 840, 80, 274, 44, 22, "#eef4ff");
    ctx.fillStyle = "#3564c2";
    ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("免费版导出附带平台水印", 870, 108);
  }
}

export async function exportPosterBlob(payload: RenderPayload, format: "png" | "jpg") {
  const canvas = document.createElement("canvas");
  await renderPosterToCanvas(canvas, payload);
  return canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", format === "png" ? undefined : 0.92);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getExportFileName(projectName: string, ringNumber: string, extension: "png" | "jpg") {
  return `${sanitizeFileName(projectName)}-${sanitizeFileName(ringNumber)}.${extension}`;
}

export async function downloadZip(fileName: string, files: Array<{ name: string; blob: Blob }>) {
  const entries: ExportFile[] = [];
  for (const file of files) {
    entries.push({
      name: file.name,
      bytes: await blobToUint8Array(file.blob)
    });
  }

  let localSectionLength = 0;
  let centralSectionLength = 0;
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localSectionLength, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localSectionLength += localHeader.length + entry.bytes.length;
    centralSectionLength += centralHeader.length;
  });

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSectionLength, true);
  endView.setUint32(16, localSectionLength, true);
  endView.setUint16(20, 0, true);

  const zipBlob = new Blob(
    [...localParts, ...centralParts, endRecord].map((part) => toArrayBufferPart(part)),
    { type: "application/zip" }
  );
  downloadBlob(zipBlob, fileName);
}
