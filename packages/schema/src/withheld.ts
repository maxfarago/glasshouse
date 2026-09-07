import { type SignalId, type SignalSet } from "./signals.ts";

export const WITHHELD_SIGNAL_IDS = [
  "sig.client.prefers_reduced_motion",
  "sig.client.css.forced_colors",
  "sig.client.css.inverted_colors",
  "sig.client.css.prefers_contrast",
  "sig.client.css.prefers_reduced_transparency",
] as const satisfies readonly SignalId[];

export const INFER_OMIT_SIGNAL_IDS = ["sig.client.netinfo.effective_type"] as const satisfies readonly SignalId[];

const WITHHELD = new Set<string>(WITHHELD_SIGNAL_IDS);
const INFER_OMIT = new Set<string>([...WITHHELD_SIGNAL_IDS, ...INFER_OMIT_SIGNAL_IDS]);

export function isWithheldSignalId(id: string): boolean {
  return WITHHELD.has(id);
}

export function isNonCitableSignalId(id: string): boolean {
  return INFER_OMIT.has(id);
}

function stripIds(signals: SignalSet, drop: Set<string>): SignalSet {
  const out: SignalSet = {};
  for (const key of Object.keys(signals) as SignalId[]) {
    if (drop.has(key)) continue;
    const value = signals[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function stripWithheld(signals: SignalSet): SignalSet {
  return stripIds(signals, WITHHELD);
}

export function stripForInfer(signals: SignalSet): SignalSet {
  return stripIds(signals, INFER_OMIT);
}