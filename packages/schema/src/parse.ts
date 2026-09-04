import { isSignalId, type SignalSet, type SignalValue } from "./signals.ts";

export function asSignalSet(raw: Record<string, unknown>): SignalSet {
  const out: SignalSet = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSignalId(key)) throw new Error(`unknown signal id: ${key}`);
    out[key] = value as SignalValue;
  }
  return out;
}
