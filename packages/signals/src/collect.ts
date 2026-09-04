import type { SignalSet } from "@glasshouse/schema";

export type T1Host = {
  screen: { width: number; height: number };
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  languages?: readonly string[];
  timeZone?: string;
  matchMedia: (query: string) => { matches: boolean };
};

export function collectT1(host: T1Host): SignalSet {
  return {
    "sig.client.screen": { w: host.screen.width, h: host.screen.height },
    "sig.client.dpr": host.devicePixelRatio,
    "sig.client.hw_concurrency": host.hardwareConcurrency ?? null,
    "sig.client.device_memory": host.deviceMemory ?? null,
    "sig.client.max_touch": host.maxTouchPoints ?? 0,
    "sig.client.langs": host.languages ? [...host.languages] : null,
    "sig.client.timezone": host.timeZone ?? null,
    "sig.client.prefers_reduced_motion": host.matchMedia("(prefers-reduced-motion: reduce)").matches,
    "sig.client.prefers_color_scheme": host.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  };
}

export type T2Host = {
  canvasHash: () => string | null;
  webgl: () => { vendor: string | null; renderer: string | null };
  audioHash: () => string | null;
  fonts: () => { count: number; notable: string[] };
};

export function collectT2(host: T2Host): SignalSet {
  const gl = host.webgl();
  const fonts = host.fonts();
  return {
    "sig.client.canvas_hash": host.canvasHash(),
    "sig.client.webgl_vendor": gl.vendor,
    "sig.client.webgl_renderer": gl.renderer,
    "sig.client.audio_hash": host.audioHash(),
    "sig.client.fonts.count": fonts.count,
    "sig.client.fonts.notable": fonts.notable,
  };
}
