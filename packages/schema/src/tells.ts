export const TELL_IDS = [
  "tell.install_vs_geo",
  "tell.timezone_vs_geo",
  "tell.path_vs_body",
  "tell.client_suppression",
  "tell.evasion_incomplete",
  "tell.advertised_exit",
  "tell.ua_vs_gpu",
  "tell.header_vs_client_langs",
  "tell.intl_vs_ui_locale",
  "tell.software_from_font",
  "tell.asn_names_org",
  "tell.calendar_non_gregorian",
  "tell.direction_rtl",
  "tell.numbering_non_latin",
  "tell.weekend_non_standard",
  "tell.pwa_standalone",
  "tell.blocker_vs_fp",
  "tell.high_refresh",
  "tell.withheld",
] as const;

export type TellId = (typeof TELL_IDS)[number];

const TELL_SET = new Set<string>(TELL_IDS);

export function isTellId(id: string): id is TellId {
  return TELL_SET.has(id);
}

export function isCitableTellId(id: string): boolean {
  return isTellId(id) && id !== "tell.withheld";
}

export function isNonCitableEvidence(id: string): boolean {
  return id === "tell.withheld";
}
