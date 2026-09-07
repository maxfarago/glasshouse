export function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

export type AgreeVerdict = "agree" | "contradict" | "indeterminate";

export function agreeSets(a: Set<string> | null, b: Set<string> | null): AgreeVerdict {
  if (!a || !b || a.size === 0 || b.size === 0) return "indeterminate";
  for (const x of a) if (b.has(x)) return "agree";
  return "contradict";
}

export const TZ_COUNTRIES: Record<string, string[]> = {
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

const SUNDAY_FIRST = [
  "US", "CA", "JP", "IL", "MX", "BR", "KR", "TW", "PH", "GT", "HN", "SV", "NI", "CR", "PA",
  "CO", "VE", "EC", "PE", "BO", "PY", "UY", "CL", "AR", "DO", "PR",
];

const SATURDAY_FIRST = ["AF", "BH", "DJ", "EG", "IQ", "IR", "JO", "KW", "LY", "OM", "QA", "SA", "SD", "SY", "YE"];

const H12 = ["US", "CA", "AU", "NZ", "IN", "PH", "MX", "PR", "IE", "GB"];

const IMPERIAL = ["US", "LR", "MM", "PR", "GU", "VI"];

const WEEKEND_FRI_SAT = [
  "AE", "SA", "EG", "IQ", "JO", "KW", "BH", "QA", "LY", "OM", "SD", "YE", "AF", "IR", "IL",
];

const RTL = [
  "SA", "AE", "EG", "IQ", "IR", "IL", "PK", "AF", "YE", "SY", "JO", "LB", "PS", "KW", "QA",
  "BH", "OM", "LY", "TN", "DZ", "MA", "SD",
];

function asSet(codes: string[]): Set<string> {
  return new Set(codes);
}

export function timezoneCountries(tz: string | null): Set<string> | null {
  if (!tz) return null;
  const codes = TZ_COUNTRIES[tz];
  return codes ? asSet(codes) : null;
}

export function firstDayCountries(day: number | null): Set<string> | null {
  if (day === 7) return asSet(SUNDAY_FIRST);
  if (day === 6) return asSet(SATURDAY_FIRST);
  return null;
}

export function hourCycleCountries(cycle: string | null): Set<string> | null {
  if (cycle === "h12" || cycle === "h11") return asSet(H12);
  return null;
}

export function measurementCountries(system: string | null): Set<string> | null {
  if (system === "imperial" || system === "uss") return asSet(IMPERIAL);
  return null;
}

export function weekendCountries(days: number[] | null): Set<string> | null {
  if (!days || days.length === 0) return null;
  const key = [...days].sort((a, b) => a - b).join(",");
  if (key === "5,6") return asSet(WEEKEND_FRI_SAT);
  return null;
}

export function calendarCountries(cal: string | null): Set<string> | null {
  if (!cal) return null;
  if (cal === "buddhist") return asSet(["TH"]);
  if (cal === "japanese") return asSet(["JP"]);
  if (cal === "persian") return asSet(["IR", "AF"]);
  if (cal.startsWith("islamic")) return asSet(["SA", "AE", "EG", "IQ", "JO", "KW", "BH", "QA", "YE"]);
  if (cal === "chinese") return asSet(["CN", "TW", "HK"]);
  return null;
}

export function numberingCountries(sys: string | null): Set<string> | null {
  if (!sys || sys === "latn") return null;
  if (sys === "arab") return asSet(["SA", "AE", "EG", "IQ", "JO", "KW", "BH", "QA", "YE", "LY"]);
  if (sys === "arabext") return asSet(["IR", "AF", "PK"]);
  if (sys === "deva") return asSet(["IN", "NP"]);
  if (sys === "beng") return asSet(["BD", "IN"]);
  return null;
}

export function directionCountries(dir: string | null): Set<string> | null {
  if (dir === "rtl") return asSet(RTL);
  return null;
}

export function installRegionSet(input: {
  firstDay: number | null;
  hourCycle: string | null;
  measurement: string | null;
  weekend: number[] | null;
  calendar: string | null;
  numbering: string | null;
  direction: string | null;
}): Set<string> | null {
  const parts = [
    firstDayCountries(input.firstDay),
    hourCycleCountries(input.hourCycle),
    measurementCountries(input.measurement),
    weekendCountries(input.weekend),
    calendarCountries(input.calendar),
    numberingCountries(input.numbering),
    directionCountries(input.direction),
  ].filter((s): s is Set<string> => s != null);
  const first = parts[0];
  if (!first) return null;
  let acc = new Set(first);
  for (const next of parts.slice(1)) acc = intersect(acc, next);
  return acc;
}