import type { AsnType } from "./asn-type.ts";

export type NetVsTz = "agree" | "geo_absent" | "contradict";

const TZ_COUNTRIES: Record<string, string[]> = {
  "Africa/Cairo": ["EG"],
  "Africa/Johannesburg": ["ZA"],
  "Africa/Lagos": ["NG"],
  "Africa/Nairobi": ["KE"],
  "America/Anchorage": ["US"],
  "America/Argentina/Buenos_Aires": ["AR"],
  "America/Bogota": ["CO"],
  "America/Chicago": ["US"],
  "America/Denver": ["US"],
  "America/Detroit": ["US"],
  "America/Edmonton": ["CA"],
  "America/Halifax": ["CA"],
  "America/Indiana/Indianapolis": ["US"],
  "America/Juneau": ["US"],
  "America/Los_Angeles": ["US"],
  "America/Mexico_City": ["MX"],
  "America/New_York": ["US"],
  "America/Phoenix": ["US"],
  "America/Santiago": ["CL"],
  "America/Sao_Paulo": ["BR"],
  "America/Toronto": ["CA"],
  "America/Vancouver": ["CA"],
  "America/Winnipeg": ["CA"],
  "Asia/Bangkok": ["TH"],
  "Asia/Dubai": ["AE"],
  "Asia/Hong_Kong": ["HK"],
  "Asia/Jakarta": ["ID"],
  "Asia/Jerusalem": ["IL"],
  "Asia/Kolkata": ["IN"],
  "Asia/Seoul": ["KR"],
  "Asia/Shanghai": ["CN"],
  "Asia/Singapore": ["SG"],
  "Asia/Taipei": ["TW"],
  "Asia/Tokyo": ["JP"],
  "Australia/Adelaide": ["AU"],
  "Australia/Brisbane": ["AU"],
  "Australia/Melbourne": ["AU"],
  "Australia/Perth": ["AU"],
  "Australia/Sydney": ["AU"],
  "Europe/Amsterdam": ["NL"],
  "Europe/Athens": ["GR"],
  "Europe/Berlin": ["DE"],
  "Europe/Brussels": ["BE"],
  "Europe/Bucharest": ["RO"],
  "Europe/Budapest": ["HU"],
  "Europe/Copenhagen": ["DK"],
  "Europe/Dublin": ["IE"],
  "Europe/Helsinki": ["FI"],
  "Europe/Istanbul": ["TR"],
  "Europe/Kyiv": ["UA"],
  "Europe/Lisbon": ["PT"],
  "Europe/London": ["GB"],
  "Europe/Madrid": ["ES"],
  "Europe/Moscow": ["RU"],
  "Europe/Oslo": ["NO"],
  "Europe/Paris": ["FR"],
  "Europe/Prague": ["CZ"],
  "Europe/Rome": ["IT"],
  "Europe/Stockholm": ["SE"],
  "Europe/Vienna": ["AT"],
  "Europe/Warsaw": ["PL"],
  "Europe/Zurich": ["CH"],
  "Pacific/Auckland": ["NZ"],
  "Pacific/Honolulu": ["US"],
};

export function netVsTz(input: {
  timezone: string | null;
  country: string | null;
  city: string | null;
  asnType: AsnType;
}): NetVsTz | null {
  if (!input.timezone) return null;

  const cityMissing = input.city == null || input.city === "";
  if (input.asnType === "datacenter" && cityMissing) return "geo_absent";

  const countries = TZ_COUNTRIES[input.timezone];
  if (!countries) return null;

  const cc = input.country?.toUpperCase() ?? null;
  if (!cc) return "geo_absent";
  return countries.includes(cc) ? "agree" : "contradict";
}
