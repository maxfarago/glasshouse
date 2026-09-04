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

function firstMatch(
  mm: (query: string) => { matches: boolean },
  options: Array<[query: string, value: string]>,
): string | null {
  for (const [query, value] of options) {
    try {
      if (mm(query).matches) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function collectCss(mm: T1Host["matchMedia"]): SignalSet {
  return {
    "sig.client.css.forced_colors": firstMatch(mm, [
      ["(forced-colors: active)", "active"],
      ["(forced-colors: none)", "none"],
    ]),
    "sig.client.css.inverted_colors": firstMatch(mm, [
      ["(inverted-colors: inverted)", "inverted"],
      ["(inverted-colors: none)", "none"],
    ]),
    "sig.client.css.prefers_contrast": firstMatch(mm, [
      ["(prefers-contrast: more)", "more"],
      ["(prefers-contrast: less)", "less"],
      ["(prefers-contrast: custom)", "custom"],
      ["(prefers-contrast: no-preference)", "no-preference"],
    ]),
    "sig.client.css.prefers_reduced_transparency": firstMatch(mm, [
      ["(prefers-reduced-transparency: reduce)", "reduce"],
      ["(prefers-reduced-transparency: no-preference)", "no-preference"],
    ]),
    "sig.client.css.prefers_reduced_data": firstMatch(mm, [
      ["(prefers-reduced-data: reduce)", "reduce"],
      ["(prefers-reduced-data: no-preference)", "no-preference"],
    ]),
    "sig.client.css.pointer": firstMatch(mm, [
      ["(pointer: fine)", "fine"],
      ["(pointer: coarse)", "coarse"],
      ["(pointer: none)", "none"],
    ]),
    "sig.client.css.any_pointer": firstMatch(mm, [
      ["(any-pointer: fine)", "fine"],
      ["(any-pointer: coarse)", "coarse"],
      ["(any-pointer: none)", "none"],
    ]),
    "sig.client.css.hover": firstMatch(mm, [
      ["(hover: hover)", "hover"],
      ["(hover: none)", "none"],
    ]),
    "sig.client.css.any_hover": firstMatch(mm, [
      ["(any-hover: hover)", "hover"],
      ["(any-hover: none)", "none"],
    ]),
    "sig.client.css.dynamic_range": firstMatch(mm, [
      ["(dynamic-range: high)", "high"],
      ["(dynamic-range: standard)", "standard"],
    ]),
    "sig.client.css.video_dynamic_range": firstMatch(mm, [
      ["(video-dynamic-range: high)", "high"],
      ["(video-dynamic-range: standard)", "standard"],
    ]),
    "sig.client.css.color_gamut": firstMatch(mm, [
      ["(color-gamut: rec2020)", "rec2020"],
      ["(color-gamut: p3)", "p3"],
      ["(color-gamut: srgb)", "srgb"],
    ]),
    "sig.client.css.display_mode": firstMatch(mm, [
      ["(display-mode: fullscreen)", "fullscreen"],
      ["(display-mode: standalone)", "standalone"],
      ["(display-mode: minimal-ui)", "minimal-ui"],
      ["(display-mode: browser)", "browser"],
    ]),
    "sig.client.css.scripting": firstMatch(mm, [
      ["(scripting: enabled)", "enabled"],
      ["(scripting: initial-only)", "initial-only"],
      ["(scripting: none)", "none"],
    ]),
    "sig.client.css.update": firstMatch(mm, [
      ["(update: fast)", "fast"],
      ["(update: slow)", "slow"],
      ["(update: none)", "none"],
    ]),
    "sig.client.css.orientation": firstMatch(mm, [
      ["(orientation: landscape)", "landscape"],
      ["(orientation: portrait)", "portrait"],
    ]),
  };
}

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
    ...collectCss(host.matchMedia),
  };
}

export type T2Host = {
  canvasHash: () => string | null;
  webgl: () => {
    vendor: string | null;
    renderer: string | null;
    extHash: string | null;
    maxTexture: number | null;
    precision: number | null;
    webgl2: boolean | null;
  };
  audioHash: () => string | null;
  fonts: () => { count: number; notable: string[]; probeHits: string[] };
  intl: () => {
    calendar: string | null;
    numbering: string | null;
    firstDay: number | null;
    weekend: number[] | null;
    tzCount: number | null;
  };
  devices: () => string[] | null;
  netinfo: () => {
    effectiveType: string | null;
    rtt: number | null;
    downlink: number | null;
    saveData: boolean | null;
  };
};

export function collectT2(host: T2Host): SignalSet {
  const gl = host.webgl();
  const fonts = host.fonts();
  const intl = host.intl();
  const net = host.netinfo();
  return {
    "sig.client.canvas_hash": host.canvasHash(),
    "sig.client.webgl_vendor": gl.vendor,
    "sig.client.webgl_renderer": gl.renderer,
    "sig.client.webgl.ext_hash": gl.extHash,
    "sig.client.webgl.max_texture": gl.maxTexture,
    "sig.client.webgl.precision": gl.precision,
    "sig.client.webgl2_available": gl.webgl2,
    "sig.client.audio_hash": host.audioHash(),
    "sig.client.fonts.count": fonts.count,
    "sig.client.fonts.notable": fonts.notable,
    "sig.client.fonts.probe_hits": fonts.probeHits,
    "sig.client.intl.calendar": intl.calendar,
    "sig.client.intl.numbering": intl.numbering,
    "sig.client.intl.first_day": intl.firstDay,
    "sig.client.intl.weekend": intl.weekend,
    "sig.client.intl.tz_count": intl.tzCount,
    "sig.client.devices.kinds": host.devices(),
    "sig.client.netinfo.effective_type": net.effectiveType,
    "sig.client.netinfo.rtt": net.rtt,
    "sig.client.netinfo.downlink": net.downlink,
    "sig.client.netinfo.save_data": net.saveData,
  };
}
