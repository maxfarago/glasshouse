import type { SignalSet } from "@glasshouse/schema";

export type TellCategory = "rare" | "contradictory" | "mapped" | "withheld";

export type Tell = {
  id: string;
  category: TellCategory;
  headline: string;
  detail: string;
  evidence: string[];
};

export type Detector = {
  id: string;
  category: TellCategory;
  requires: string[];
  detect: (s: SignalSet) => Tell | null;
};
