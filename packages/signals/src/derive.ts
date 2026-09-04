import type { SignalSet } from "@glasshouse/schema";
import { asnType } from "./asn-type.ts";
import { deviceFamily, type Screen } from "./device-family.ts";
import { localTime } from "./local-time.ts";
import { netVsTz } from "./net-vs-tz.ts";
import { privacyPosture } from "./privacy.ts";

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

  const out: SignalSet = {
    ...signals,
    "sig.derived.device_family": family,
    "sig.derived.asn_type": asn,
    "sig.derived.privacy_posture": posture,
  };
  if (time) out["sig.derived.local_time"] = time;
  if (net) out["sig.derived.net_vs_tz"] = net;
  return out;
}
