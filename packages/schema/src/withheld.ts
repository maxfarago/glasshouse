import { type SignalId, type SignalSet } from "./signals.ts";

export const WITHHELD_SIGNAL_IDS = [
  "sig.client.prefers_reduced_motion",
  "sig.client.css.forced_colors",
  "sig.client.css.inverted_colors",
  "sig.client.css.prefers_contrast",
  "sig.client.css.prefers_reduced_transparency",
] as const satisfies readonly SignalId[];

const WITHHELD = new Set<string>(WITHHELD_SIGNAL_IDS);

export function isWithheldSignalId(id: string): boolean {
  return WITHHELD.has(id);
}

export function stripWithheld(signals: SignalSet): SignalSet {
  const out: SignalSet = {};
  for (const key of Object.keys(signals) as SignalId[]) {
    if (WITHHELD.has(key)) continue;
    const value = signals[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
