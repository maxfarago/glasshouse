import type { SignalSet } from "@glasshouse/schema";

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

export function browserWebgl(): { vendor: string | null; renderer: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) return { vendor: null, renderer: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER) };
    return {
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    };
  } catch {
    return { vendor: null, renderer: null };
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

export async function browserFonts(): Promise<{ count: number; notable: string[] }> {
  const notable: string[] = [];
  try {
    await document.fonts.ready;
    for (const name of NOTABLE) {
      if (document.fonts.check(`12px "${name}"`)) notable.push(name);
    }
    return { count: notable.length, notable };
  } catch {
    return { count: 0, notable };
  }
}

export async function collectBrowserT2(): Promise<SignalSet> {
  const gl = browserWebgl();
  const fonts = await browserFonts();
  return {
    "sig.client.canvas_hash": browserCanvasHash(),
    "sig.client.webgl_vendor": gl.vendor,
    "sig.client.webgl_renderer": gl.renderer,
    "sig.client.audio_hash": await browserAudioHash(),
    "sig.client.fonts.count": fonts.count,
    "sig.client.fonts.notable": fonts.notable,
  };
}
