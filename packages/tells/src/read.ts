import type { SignalId, SignalSet } from "@glasshouse/schema";

export function present(s: SignalSet, ids: readonly string[]): boolean {
  return ids.every((id) => s[id as SignalId] !== undefined);
}

export function asString(s: SignalSet, id: SignalId): string | null {
  const v = s[id];
  return typeof v === "string" && v !== "" ? v : null;
}

export function asNumber(s: SignalSet, id: SignalId): number | null {
  const v = s[id];
  return typeof v === "number" ? v : null;
}

export function asStringArray(s: SignalSet, id: SignalId): string[] | null {
  const v = s[id];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
}

export function asNumberArray(s: SignalSet, id: SignalId): number[] | null {
  const v = s[id];
  return Array.isArray(v) && v.every((x) => typeof x === "number") ? v : null;
}

export function langSubtag(tag: string | null): string | null {
  if (!tag) return null;
  const primary = tag.split(",")[0]?.split(";")[0]?.trim();
  if (!primary) return null;
  const sub = primary.split("-")[0]?.toLowerCase();
  return sub || null;
}

export function regionSubtag(tag: string | null): string | null {
  if (!tag) return null;
  const primary = tag.split(",")[0]?.split(";")[0]?.trim();
  if (!primary) return null;
  const parts = primary.split("-");
  const region = parts[1];
  if (!region || region.length !== 2) return null;
  return region.toUpperCase();
}

export function uaPlatform(ua: string | null): string | null {
  if (!ua) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return "apple";
  if (/macintosh|mac os/i.test(ua)) return "apple";
  if (/windows/i.test(ua)) return "windows";
  if (/android/i.test(ua)) return "android";
  if (/cros/i.test(ua)) return "chromeos";
  if (/linux/i.test(ua)) return "linux";
  return null;
}

export function gpuPlatform(vendor: string | null, renderer: string | null): string | null {
  const blob = `${vendor ?? ""} ${renderer ?? ""}`.toLowerCase();
  if (!blob.trim()) return null;
  if (blob.includes("swiftshader")) return "software";
  if (blob.includes("apple")) return "apple";
  if (blob.includes("nvidia") || blob.includes("geforce")) return "nvidia";
  if (blob.includes("amd") || blob.includes("radeon")) return "amd";
  if (blob.includes("intel")) return "intel";
  if (blob.includes("adreno") || blob.includes("mali") || blob.includes("powervr")) return "mobile-gpu";
  return null;
}
