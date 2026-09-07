import type { SignalSet } from "@glasshouse/schema";
import { asnType } from "./asn-type.ts";
import { clientSuppression } from "./client-suppression.ts";
import { connectionQuality } from "./connection-quality.ts";
import { deviceFamily, type Screen } from "./device-family.ts";
import { localTime } from "./local-time.ts";
import { netVsTz } from "./net-vs-tz.ts";
import { pathVsBody } from "./path-vs-body.ts";
import { privacyPosture } from "./privacy.ts";
import { softwareImplied } from "./software-implied.ts";
import { stickiness } from "./stickiness.ts";

export type DeriveClock = { now: Date };

function asScreen(value: unknown): Screen | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { w?: unknown; h?: unknown };
  if (typeof rec.w !== "number" || typeof rec.h !== "number") return null;
  return { w: rec.w, h: rec.h };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asNumberArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((x) => typeof x === "number") ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((x) => typeof x === "string") ? value : null;
}

const PRIVACY_KEYS = [
  "sig.client.canvas_hash",
  "sig.client.audio_hash",
  "sig.client.webgl_renderer",
  "sig.client.webgl_vendor",
  "sig.client.fonts.count",
  "sig.client.timezone",
  "sig.edge.geo.city",
  "sig.edge.geo.postal",
  "sig.tls.ja4",
  "sig.hdr.ua_ch_platform",
] as const;

export function derive(signals: SignalSet, clock: DeriveClock): SignalSet {
  const family = deviceFamily(
    asScreen(signals["sig.client.screen"]),
    asNumber(signals["sig.client.dpr"]),
    asNumber(signals["sig.client.max_touch"]),
  );
  const asn = asnType(asString(signals["sig.edge.as_org"]));
  const time = localTime(asString(signals["sig.client.timezone"]), clock.now);
  const posture = privacyPosture(PRIVACY_KEYS.map((k) => signals[k]));
  const net = netVsTz({
    timezone: asString(signals["sig.client.timezone"]),
    country: asString(signals["sig.edge.geo.country"]),
    city: asString(signals["sig.edge.geo.city"]),
    asnType: asn,
  });
  const quality = connectionQuality(asString(signals["sig.client.netinfo.effective_type"]));
  const sticky = stickiness({
    country: asString(signals["sig.edge.geo.country"]),
    city: asString(signals["sig.edge.geo.city"]),
    asnType: asn,
    timezone: asString(signals["sig.client.timezone"]),
    firstDay: asNumber(signals["sig.client.intl.first_day"]),
    hourCycle: asString(signals["sig.client.intl.hour_cycle"]),
    measurement: asString(signals["sig.client.intl.measurement"]),
    weekend: asNumberArray(signals["sig.client.intl.weekend"]),
    calendar: asString(signals["sig.client.intl.calendar"]),
    numbering: asString(signals["sig.client.intl.numbering"]),
    direction: asString(signals["sig.client.intl.direction"]),
  });
  const path = pathVsBody(family, asn);
  const suppression = clientSuppression({
    canvas: signals["sig.client.canvas_hash"],
    audio: signals["sig.client.audio_hash"],
    fontsCount: signals["sig.client.fonts.count"],
    webglRenderer: signals["sig.client.webgl_renderer"],
    calendar: signals["sig.client.intl.calendar"],
    numbering: signals["sig.client.intl.numbering"],
    firstDay: signals["sig.client.intl.first_day"],
  });
  const implied = softwareImplied(asStringArray(signals["sig.client.fonts.probe_hits"]));

  const out: SignalSet = {
    ...signals,
    "sig.derived.device_family": family,
    "sig.derived.asn_type": asn,
    "sig.derived.privacy_posture": posture,
    "sig.derived.agree.volatile_fast": sticky.volatileFast,
    "sig.derived.agree.volatile_install": sticky.volatileInstall,
    "sig.derived.agree.fast_install": sticky.fastInstall,
    "sig.derived.path_vs_body": path,
    "sig.derived.client_suppression": suppression,
  };
  if (time) out["sig.derived.local_time"] = time;
  if (net) out["sig.derived.net_vs_tz"] = net;
  if (quality) out["sig.derived.connection_quality"] = quality;
  if (sticky.installRegions) out["sig.derived.install_regions"] = sticky.installRegions;
  if (implied.length) out["sig.derived.software_implied"] = implied;
  return out;
}