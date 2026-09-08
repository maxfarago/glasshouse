import type { SignalSet } from "@glasshouse/schema";
import { DETECTORS } from "./detectors.ts";
import { present } from "./read.ts";
import type { Tell } from "./types.ts";

export type InferTell = {
  id: string;
  category: Tell["category"];
  headline: string;
  detail: string;
  evidence: string[];
};

export function detectTells(signals: SignalSet): Tell[] {
  const out: Tell[] = [];
  for (const d of DETECTORS) {
    if (d.requires.length && !present(signals, d.requires)) continue;
    const hit = d.detect(signals);
    if (hit) out.push(hit);
  }
  return out;
}

export function stripTellsForInfer(tells: Tell[]): Tell[] {
  return tells.filter((t) => t.category !== "withheld");
}

export function tellPointer(id: string): string {
  return id.startsWith("tell.") ? id : `tell.${id}`;
}

export function tellsForInfer(tells: Tell[]): InferTell[] {
  return stripTellsForInfer(tells).map((t) => ({
    id: tellPointer(t.id),
    category: t.category,
    headline: t.headline,
    detail: t.detail,
    evidence: t.evidence,
  }));
}
