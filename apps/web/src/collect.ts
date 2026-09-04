import type { SignalSet } from "@glasshouse/schema";
import { collectT1 } from "@glasshouse/signals";
import { collectBrowserT2 } from "@glasshouse/signals/browser";

export function collectT1Now(): SignalSet {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return collectT1({
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    ...(nav.deviceMemory != null ? { deviceMemory: nav.deviceMemory } : {}),
    maxTouchPoints: navigator.maxTouchPoints,
    languages: navigator.languages,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    matchMedia: (q) => window.matchMedia(q),
  });
}

export { collectBrowserT2 };
