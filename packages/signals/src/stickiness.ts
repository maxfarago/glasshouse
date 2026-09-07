import type { AsnType } from "./asn-type.ts";
import { agreeSets, installRegionSet, timezoneCountries, type AgreeVerdict } from "./region-sets.ts";

export type StickinessInput = {
  country: string | null;
  city: string | null;
  asnType: AsnType;
  timezone: string | null;
  firstDay: number | null;
  hourCycle: string | null;
  measurement: string | null;
  weekend: number[] | null;
  calendar: string | null;
  numbering: string | null;
  direction: string | null;
};

export type Stickiness = {
  volatileFast: AgreeVerdict;
  volatileInstall: AgreeVerdict;
  fastInstall: AgreeVerdict;
  installRegions: string[] | null;
};

function volatileRegion(input: StickinessInput): Set<string> | null {
  if (input.asnType === "datacenter") return null;
  const cc = input.country?.toUpperCase() ?? null;
  return cc ? new Set([cc]) : null;
}

export function stickiness(input: StickinessInput): Stickiness {
  const volatile = volatileRegion(input);
  const fast = timezoneCountries(input.timezone);
  const install = installRegionSet({
    firstDay: input.firstDay,
    hourCycle: input.hourCycle,
    measurement: input.measurement,
    weekend: input.weekend,
    calendar: input.calendar,
    numbering: input.numbering,
    direction: input.direction,
  });
  const installRegions = install ? [...install].sort() : null;
  return {
    volatileFast: agreeSets(volatile, fast),
    volatileInstall: agreeSets(volatile, install),
    fastInstall: agreeSets(fast, install),
    installRegions,
  };
}