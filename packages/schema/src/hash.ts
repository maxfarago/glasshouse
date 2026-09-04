import { createHash } from "node:crypto";
import type { SignalSet } from "./signals.ts";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function hashSignalSet(signals: SignalSet): string {
  return createHash("sha256").update(canonicalize(signals)).digest("hex");
}
