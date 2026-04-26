export type LayerKind = "text" | "rect" | "image" | "ellipse" | "line";

export interface BaseLayer {
  id: string;
  name: string;
  kind: LayerKind;
  section: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked?: boolean;
}

export interface PosterTextLayer extends BaseLayer {
  kind: "text";
  text: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: string;
  textDecoration?: string;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
}

export interface PosterRectLayer extends BaseLayer {
  kind: "rect";
  width: number;
  height: number;
  fill: string;
  fillEnabled?: boolean;
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface PosterImageLayer extends BaseLayer {
  kind: "image";
  width: number;
  height: number;
  src: string;
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface PosterEllipseLayer extends BaseLayer {
  kind: "ellipse";
  radiusX: number;
  radiusY: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface PosterLineLayer extends BaseLayer {
  kind: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
  tension?: number;
  dash?: number[];
}

export type PosterLayer =
  | PosterTextLayer
  | PosterRectLayer
  | PosterImageLayer
  | PosterEllipseLayer
  | PosterLineLayer;

export interface PosterPage {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  layers: PosterLayer[];
}

export interface PosterDocument {
  id: string;
  name: string;
  pages: PosterPage[];
}

export interface BackdropVariant {
  id: string;
  name: string;
  preview: string;
  src: string;
  overlay: string;
}

export interface ColorSwatch {
  name: string;
  fill: string;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createBackdropSvg(options: {
  leafA: string;
  leafB: string;
  fruitA: string;
  fruitB: string;
  glow: string;
  watermark: string;
}) {
  const { leafA, leafB, fruitA, fruitB, glow, watermark } = options;
  return svgToDataUrl(`
    <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${leafA}" />
          <stop offset="42%" stop-color="${leafB}" />
          <stop offset="100%" stop-color="#0b361f" />
        </linearGradient>
        <radialGradient id="sun" cx="78%" cy="18%" r="56%">
          <stop offset="0%" stop-color="${glow}" stop-opacity="0.95" />
          <stop offset="65%" stop-color="${glow}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="orange" cx="32%" cy="28%" r="76%">
          <stop offset="0%" stop-color="${fruitA}" />
          <stop offset="82%" stop-color="${fruitB}" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <rect width="1280" height="720" fill="url(#sun)" />
      <g opacity="0.18" stroke="#ffffff" stroke-width="2">
        <path d="M0 0L420 360L0 720" fill="none" />
        <path d="M180 0L720 540L540 720" fill="none" />
        <path d="M520 0L1160 640L980 720" fill="none" />
        <path d="M1280 90L890 420L1280 720" fill="none" />
      </g>
      <g>
        <ellipse cx="1030" cy="110" rx="220" ry="180" fill="#163f1f" opacity="0.45" />
        <ellipse cx="1120" cy="270" rx="210" ry="240" fill="#0f2f18" opacity="0.38" />
      </g>
      <g fill="#f0f6dc" opacity="0.92">
        <path d="M880 120C870 70 930 35 978 52C946 88 928 124 880 120Z" />
        <path d="M930 138C920 78 978 48 1022 64C996 101 980 134 930 138Z" />
        <path d="M975 160C966 109 1021 85 1064 102C1036 134 1022 167 975 160Z" />
        <path d="M1010 196C1004 146 1060 126 1090 141C1070 175 1056 199 1010 196Z" />
      </g>
      <g>
        <circle cx="978" cy="138" r="72" fill="url(#orange)" />
        <circle cx="1086" cy="156" r="82" fill="url(#orange)" />
        <circle cx="1168" cy="118" r="64" fill="url(#orange)" />
        <circle cx="1016" cy="286" r="58" fill="url(#orange)" />
        <circle cx="1128" cy="292" r="70" fill="url(#orange)" />
        <circle cx="996" cy="472" r="52" fill="url(#orange)" />
      </g>
      <g fill="#1e5a22" opacity="0.95">
        <path d="M928 92C900 56 904 12 944 0C958 38 958 68 928 92Z" />
        <path d="M1016 82C1002 38 1018 10 1064 0C1064 40 1056 68 1016 82Z" />
        <path d="M1100 104C1084 72 1090 32 1128 14C1138 54 1132 82 1100 104Z" />
        <path d="M992 238C960 222 942 184 958 146C996 168 1010 192 992 238Z" />
        <path d="M1084 250C1046 240 1018 208 1022 170C1062 184 1088 206 1084 250Z" />
        <path d="M1042 378C1010 360 986 326 988 286C1026 300 1054 330 1042 378Z" />
      </g>
      <g opacity="0.22" fill="#ffc933">
        <circle cx="1012" cy="584" r="74" />
        <circle cx="1156" cy="490" r="52" />
        <circle cx="1208" cy="612" r="42" />
      </g>
      <text x="1002" y="206" font-size="86" font-weight="700" fill="${watermark}" font-family="PingFang SC, Microsoft YaHei, sans-serif">稿定</text>
      <text x="1000" y="640" font-size="18" letter-spacing="6" fill="#ffffff" opacity="0.85" font-family="PingFang SC, Microsoft YaHei, sans-serif">CITRUS HARVEST</text>
    </svg>
  `);
}

export const BACKDROP_VARIANTS: BackdropVariant[] = [
  {
    id: "orchard",
    name: "柑橘果园",
    preview: "from-[#5d970e] via-[#7bb51f] to-[#1d6f32]",
    src: createBackdropSvg({
      leafA: "#5b980f",
      leafB: "#6cab1b",
      fruitA: "#ffd766",
      fruitB: "#f19b08",
      glow: "#ffd45e",
      watermark: "rgba(255,255,255,0.36)"
    }),
    overlay: "#5a9809"
  },
  {
    id: "sunset",
    name: "夕照农场",
    preview: "from-[#658507] via-[#f0ac0a] to-[#d87d08]",
    src: createBackdropSvg({
      leafA: "#52780c",
      leafB: "#9b7d13",
      fruitA: "#ffe091",
      fruitB: "#e67d11",
      glow: "#ffe8a9",
      watermark: "rgba(255,255,255,0.32)"
    }),
    overlay: "#7d6208"
  },
  {
    id: "fresh",
    name: "清新绿幕",
    preview: "from-[#3fa26d] via-[#96ca2d] to-[#1d6f63]",
    src: createBackdropSvg({
      leafA: "#338c60",
      leafB: "#77b41c",
      fruitA: "#ffe07c",
      fruitB: "#f9a01a",
      glow: "#fff5c8",
      watermark: "rgba(255,255,255,0.28)"
    }),
    overlay: "#3e8f5c"
  }
];

export const OVERLAY_SWATCHES: ColorSwatch[] = [
  { name: "青柑绿", fill: "#5a9809" },
  { name: "秋收橙", fill: "#866208" },
  { name: "湖畔青", fill: "#1f8267" },
  { name: "柔白纱", fill: "#d6dfcc" }
];

export function cloneDocument(document: PosterDocument) {
  return JSON.parse(JSON.stringify(document)) as PosterDocument;
}

export function buildStarterDocument(): PosterDocument {
  const posterFont = "YouSheBiaoTiHei, Alibaba PuHuiTi, PingFang SC, sans-serif";

  return {
    id: "doc-citrus-launch",
    name: "水果农产丰收绿色海报",
    pages: [
      {
        id: "page-cover",
        name: "封面海报",
        width: 1280,
        height: 720,
        backgroundColor: "#ffffff",
        layers: [
          {
            id: "hero-photo",
            name: "果园主图",
            kind: "image",
            section: "背景",
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            visible: true,
            width: 1280,
            height: 720,
            src: BACKDROP_VARIANTS[0].src
          },
          {
            id: "green-overlay",
            name: "绿色叠层",
            kind: "rect",
            section: "背景",
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 0.3,
            visible: true,
            width: 1280,
            height: 720,
            fill: BACKDROP_VARIANTS[0].overlay
          },
          {
            id: "frame-left",
            name: "左侧构图线",
            kind: "line",
            section: "小装饰",
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 0.18,
            visible: true,
            stroke: "#ffffff",
            strokeWidth: 2,
            points: [0, 0, 430, 360, 0, 720]
          },
          {
            id: "frame-right",
            name: "右侧构图线",
            kind: "line",
            section: "小装饰",
            x: 980,
            y: 0,
            rotation: 0,
            opacity: 0.18,
            visible: true,
            stroke: "#ffffff",
            strokeWidth: 2,
            points: [300, 0, 0, 350, 300, 720]
          },
          {
            id: "accent-dot",
            name: "柠黄圆点",
            kind: "ellipse",
            section: "小装饰",
            x: 118,
            y: 168,
            rotation: 0,
            opacity: 0.96,
            visible: true,
            radiusX: 32,
            radiusY: 32,
            fill: "#ffd63c"
          },
          {
            id: "title-main",
            name: "标题",
            kind: "text",
            section: "标题",
            x: 134,
            y: 152,
            rotation: 0,
            opacity: 1,
            visible: true,
            text: "科技润果\n丰饶满仓",
            width: 530,
            fontSize: 104,
            fontFamily: posterFont,
            fontStyle: "bold italic",
            fill: "#ffffff",
            align: "left",
            lineHeight: 0.92,
            letterSpacing: 1
          },
          {
            id: "title-outline",
            name: "标题边框",
            kind: "rect",
            section: "标题",
            x: 204,
            y: 250,
            rotation: 0,
            opacity: 1,
            visible: true,
            width: 444,
            height: 126,
            fill: "#ffffff",
            fillEnabled: false,
            cornerRadius: 0,
            stroke: "#3c6bff",
            strokeWidth: 4
          },
          {
            id: "swoosh-line",
            name: "金色动线",
            kind: "line",
            section: "小装饰",
            x: 130,
            y: 348,
            rotation: 0,
            opacity: 1,
            visible: true,
            stroke: "#ffd84f",
            strokeWidth: 3,
            tension: 0.68,
            points: [0, 12, 90, 34, 210, 6, 324, 26, 398, 0]
          },
          {
            id: "subtitle-strip",
            name: "副标题底线",
            kind: "rect",
            section: "副标题",
            x: 196,
            y: 435,
            rotation: 0,
            opacity: 0.92,
            visible: true,
            width: 404,
            height: 3,
            fill: "#ffffff"
          },
          {
            id: "subtitle-text",
            name: "副标题",
            kind: "text",
            section: "副标题",
            x: 184,
            y: 392,
            rotation: 0,
            opacity: 1,
            visible: true,
            text: "农业科技果植项目汇报",
            width: 430,
            fontSize: 27,
            fontFamily: "Alibaba PuHuiTi, PingFang SC, sans-serif",
            fontStyle: "bold",
            fill: "#ffffff",
            align: "center",
            lineHeight: 1.1,
            letterSpacing: 2
          },
          {
            id: "reporter-marker",
            name: "身份标识",
            kind: "rect",
            section: "信息",
            x: 258,
            y: 548,
            rotation: 0,
            opacity: 1,
            visible: true,
            width: 6,
            height: 82,
            fill: "#ffd84f",
            cornerRadius: 999
          },
          {
            id: "reporter-text",
            name: "汇报人",
            kind: "text",
            section: "信息",
            x: 286,
            y: 575,
            rotation: 0,
            opacity: 0.96,
            visible: true,
            text: "汇报人：高小定",
            width: 270,
            fontSize: 24,
            fontFamily: "Alibaba PuHuiTi, PingFang SC, sans-serif",
            fill: "#f9fafb",
            align: "left",
            lineHeight: 1.1
          },
          {
            id: "english-tag",
            name: "英文标签",
            kind: "text",
            section: "信息",
            x: 958,
            y: 612,
            rotation: 0,
            opacity: 0.94,
            visible: true,
            text: "KE JI RUI GUO\nFENG RAO MAN CANG",
            width: 252,
            fontSize: 19,
            fontFamily: "Avenir Next, Helvetica Neue, sans-serif",
            fill: "#ffffff",
            align: "right",
            lineHeight: 0.92,
            letterSpacing: 4
          }
        ]
      }
    ]
  };
}
