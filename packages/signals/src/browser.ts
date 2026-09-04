import type { SignalSet } from "@glasshouse/schema";
import { collectT2 } from "./collect.ts";
import { FONT_PROBE } from "./fonts-probe.ts";

const NOTABLE = [
  "Menlo",
  "Monaco",
  "Helvetica Neue",
  "Georgia",
  "Palatino",
  "Gill Sans",
  "Futura",
  "Comic Sans MS",
  "Wingdings",
  "Papyrus",
  "American Typewriter",
  "Avenir",
  "Didot",
  "Andale Mono",
];

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function browserCanvasHash(): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "16px 'Times New Roman'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = "#069";
    ctx.fillText("glasshouse λ 🌐", 4, 8);
    return fnv1a(canvas.toDataURL());
  } catch {
    return null;
  }
}

type GlStats = { ext: string[]; maxTexture: number | null; precision: number | null };

function glStats(gl: WebGLRenderingContext): GlStats {
  const ext = gl.getSupportedExtensions() ?? [];
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const fmt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
  return {
    ext,
    maxTexture: typeof maxTexture === "number" ? maxTexture : null,
    precision: fmt?.precision ?? null,
  };
}

function unmasked(gl: WebGLRenderingContext): { vendor: string | null; renderer: string | null } {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!info) return { vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER) };
  return {
    vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL),
    renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
  };
}

export function browserWebglSweep(): {
  vendor: string | null;
  renderer: string | null;
  extHash: string | null;
  maxTexture: number | null;
  precision: number | null;
  webgl2: boolean | null;
} {
  try {
    const c1 = document.createElement("canvas");
    const gl1raw = c1.getContext("webgl") || c1.getContext("experimental-webgl");
    const gl1 = gl1raw instanceof WebGLRenderingContext ? gl1raw : null;
    const c2 = document.createElement("canvas");
    const gl2raw = c2.getContext("webgl2");
    const gl2 = gl2raw instanceof WebGL2RenderingContext ? gl2raw : null;

    const s1 = gl1 ? glStats(gl1) : null;
    const s2 = gl2 ? glStats(gl2) : null;
    const names = [...new Set([...(s1?.ext ?? []), ...(s2?.ext ?? [])])].sort();
    const maxes = [s1?.maxTexture, s2?.maxTexture].filter((n): n is number => typeof n === "number");
    const identity = gl1 ? unmasked(gl1) : gl2 ? unmasked(gl2) : { vendor: null, renderer: null };

    return {
      vendor: identity.vendor,
      renderer: identity.renderer,
      extHash: names.length ? fnv1a(names.join(",")) : null,
      maxTexture: maxes.length ? Math.max(...maxes) : null,
      precision: s2?.precision ?? s1?.precision ?? null,
      webgl2: Boolean(gl2),
    };
  } catch {
    return {
      vendor: null,
      renderer: null,
      extHash: null,
      maxTexture: null,
      precision: null,
      webgl2: null,
    };
  }
}

export async function browserAudioHash(): Promise<string | null> {
  try {
    const Ctor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i += 100) sum += Math.abs(data[i] ?? 0);
    return fnv1a(String(sum));
  } catch {
    return null;
  }
}

function measureFamily(family: string): number {
  const span = document.createElement("span");
  span.style.cssText =
    "position:absolute;left:-9999px;top:0;font-size:72px;font-style:normal;font-weight:400;letter-spacing:0;white-space:nowrap;visibility:hidden";
  span.style.fontFamily = family;
  span.textContent = "mmmmmmmmmmlli";
  document.body.appendChild(span);
  const width = span.offsetWidth;
  span.remove();
  return width;
}

function fontInstalled(name: string): boolean {
  const quoted = `"${name.replaceAll('"', "")}"`;
  for (const fallback of ["monospace", "sans-serif", "serif"]) {
    const base = measureFamily(fallback);
    const mixed = measureFamily(`${quoted}, ${fallback}`);
    if (mixed !== base) return true;
  }
  return false;
}

export async function browserFonts(): Promise<{ count: number; notable: string[]; probeHits: string[] }> {
  const notable: string[] = [];
  const probeHits: string[] = [];
  try {
    await document.fonts.ready;
    for (const name of NOTABLE) {
      if (document.fonts.check(`12px "${name}"`)) notable.push(name);
    }
    for (const name of FONT_PROBE) {
      if (fontInstalled(name)) probeHits.push(name);
    }
    return { count: notable.length, notable, probeHits };
  } catch {
    return { count: 0, notable, probeHits };
  }
}

type WeekInfo = { firstDay: number; weekend: number[] };

function weekInfoOf(tag: string): WeekInfo | null {
  try {
    const loc = new Intl.Locale(tag);
    const withGetter = loc as unknown as { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
    const wi = typeof withGetter.getWeekInfo === "function" ? withGetter.getWeekInfo() : withGetter.weekInfo;
    if (!wi || typeof wi.firstDay !== "number") return null;
    return { firstDay: wi.firstDay, weekend: Array.isArray(wi.weekend) ? wi.weekend : [] };
  } catch {
    return null;
  }
}

export function browserIntl(): {
  calendar: string | null;
  numbering: string | null;
  firstDay: number | null;
  weekend: number[] | null;
  tzCount: number | null;
} {
  try {
    const dtf = Intl.DateTimeFormat().resolvedOptions();
    const nf = Intl.NumberFormat().resolvedOptions();
    const wi = weekInfoOf(dtf.locale || navigator.language || "en");
    let tzCount: number | null = null;
    try {
      tzCount = Intl.supportedValuesOf("timeZone").length;
    } catch {
      tzCount = null;
    }
    return {
      calendar: dtf.calendar ?? null,
      numbering: nf.numberingSystem ?? dtf.numberingSystem ?? null,
      firstDay: wi?.firstDay ?? null,
      weekend: wi ? wi.weekend : null,
      tzCount,
    };
  } catch {
    return { calendar: null, numbering: null, firstDay: null, weekend: null, tzCount: null };
  }
}

export async function browserDeviceKinds(): Promise<string[] | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const list = await navigator.mediaDevices.enumerateDevices();
    return [...new Set(list.map((d) => d.kind))].sort();
  } catch {
    return null;
  }
}

type NetInfo = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
};

export function browserNetinfo(): {
  effectiveType: string | null;
  rtt: number | null;
  downlink: number | null;
  saveData: boolean | null;
} {
  const nav = navigator as Navigator & {
    connection?: NetInfo;
    mozConnection?: NetInfo;
    webkitConnection?: NetInfo;
  };
  const c = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!c) return { effectiveType: null, rtt: null, downlink: null, saveData: null };
  return {
    effectiveType: typeof c.effectiveType === "string" ? c.effectiveType : null,
    rtt: typeof c.rtt === "number" ? c.rtt : null,
    downlink: typeof c.downlink === "number" ? c.downlink : null,
    saveData: typeof c.saveData === "boolean" ? c.saveData : null,
  };
}

export async function collectBrowserT2(): Promise<SignalSet> {
  const [audio, fonts, devices] = await Promise.all([browserAudioHash(), browserFonts(), browserDeviceKinds()]);
  return collectT2({
    canvasHash: browserCanvasHash,
    webgl: browserWebglSweep,
    audioHash: () => audio,
    fonts: () => fonts,
    intl: browserIntl,
    devices: () => devices,
    netinfo: browserNetinfo,
  });
}
