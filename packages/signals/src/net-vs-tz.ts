import type { AsnType } from "./asn-type.ts";
import { TZ_COUNTRIES } from "./region-sets.ts";

export type NetVsTz = "agree" | "geo_absent" | "contradict";

export function netVsTz(input: {
  timezone: string | null;
  country: string | null;
  city: string | null;
  asnType: AsnType;
}): NetVsTz | null {
  if (!input.timezone) return null;
  if (input.asnType === "datacenter") return "geo_absent";

  const countries = TZ_COUNTRIES[input.timezone];
  if (!countries) return null;

  const cc = input.country?.toUpperCase() ?? null;
  if (!cc) return "geo_absent";
  return countries.includes(cc) ? "agree" : "contradict";
}