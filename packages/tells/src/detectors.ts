import { WITHHELD_SIGNAL_IDS, type SignalSet } from "@glasshouse/schema";
import { weekStartForCountry, weekStartName } from "@glasshouse/signals";
import {
  asNumber,
  asNumberArray,
  asString,
  asStringArray,
  gpuPlatform,
  langSubtag,
  present,
  regionSubtag,
  uaPlatform,
} from "./read.ts";
import type { Detector, Tell } from "./types.ts";

function tell(
  id: string,
  category: Tell["category"],
  headline: string,
  detail: string,
  evidence: string[],
): Tell {
  return { id, category, headline, detail, evidence };
}

function datacenter(s: SignalSet): boolean {
  return asString(s, "sig.derived.asn_type") === "datacenter";
}

function suppressed(s: SignalSet): boolean {
  return asString(s, "sig.derived.client_suppression") === "suppressed";
}

function intact(s: SignalSet): boolean {
  return asString(s, "sig.derived.client_suppression") === "intact";
}

const installVsGeo: Detector = {
  id: "install_vs_geo",
  category: "contradictory",
  requires: [
    "sig.derived.agree.volatile_install",
    "sig.edge.geo.country",
    "sig.derived.install_regions",
    "sig.client.intl.first_day",
  ],
  detect(s) {
    if (datacenter(s)) return null;
    if (asString(s, "sig.derived.agree.volatile_install") !== "contradict") return null;
    const geo = asString(s, "sig.edge.geo.country");
    const day = asNumber(s, "sig.client.intl.first_day");
    const regions = asStringArray(s, "sig.derived.install_regions");
    const installWeek = weekStartName(day);
    const geoWeek = weekStartForCountry(geo);
    if (!geo || !installWeek || !geoWeek || !regions?.length) return null;
    const regionLabel = regions.length > 8 ? `${regions.length} countries` : regions.join(", ");
    return tell(
      "install_vs_geo",
      "contradictory",
      `Week starts on ${installWeek}. Edge geo ${geo} starts on ${geoWeek}.`,
      `first_day is ${day}. install_regions is ${regionLabel}. geo.country is ${geo}.`,
      [
        "sig.derived.agree.volatile_install",
        "sig.derived.install_regions",
        "sig.edge.geo.country",
        "sig.client.intl.first_day",
      ],
    );
  },
};

const timezoneVsGeo: Detector = {
  id: "timezone_vs_geo",
  category: "contradictory",
  requires: ["sig.derived.agree.volatile_fast", "sig.client.timezone", "sig.edge.geo.country"],
  detect(s) {
    if (datacenter(s)) return null;
    if (asString(s, "sig.derived.agree.volatile_fast") !== "contradict") return null;
    const tz = asString(s, "sig.client.timezone");
    const geo = asString(s, "sig.edge.geo.country");
    if (!tz || !geo) return null;
    return tell(
      "timezone_vs_geo",
      "contradictory",
      `Timezone ${tz} is not in ${geo}.`,
      `agree.volatile_fast is contradict. edge country is ${geo}.`,
      ["sig.derived.agree.volatile_fast", "sig.client.timezone", "sig.edge.geo.country"],
    );
  },
};

const pathMixed: Detector = {
  id: "path_vs_body",
  category: "contradictory",
  requires: ["sig.derived.path_vs_body", "sig.derived.asn_type", "sig.derived.device_family"],
  detect(s) {
    if (datacenter(s)) return null;
    if (asString(s, "sig.derived.path_vs_body") !== "mixed") return null;
    const family = asString(s, "sig.derived.device_family");
    const asn = asString(s, "sig.derived.asn_type");
    if (!family || !asn) return null;
    return tell(
      "path_vs_body",
      "contradictory",
      `Device class ${family} on a ${asn} ASN.`,
      "path_vs_body is mixed.",
      ["sig.derived.path_vs_body", "sig.derived.device_family", "sig.derived.asn_type"],
    );
  },
};

const clientSuppression: Detector = {
  id: "client_suppression",
  category: "contradictory",
  requires: ["sig.derived.client_suppression"],
  detect(s) {
    if (!suppressed(s)) return null;
    return tell(
      "client_suppression",
      "contradictory",
      "Fingerprint collectors came back empty. Intl did not.",
      "canvas, audio, fonts, or webgl are empty; calendar, numbering, or first_day are present.",
      [
        "sig.derived.client_suppression",
        "sig.client.canvas_hash",
        "sig.client.audio_hash",
        "sig.client.fonts.count",
        "sig.client.webgl_renderer",
        "sig.client.intl.first_day",
      ].filter((id) => present(s, [id])),
    );
  },
};

const evasionIncomplete: Detector = {
  id: "evasion_incomplete",
  category: "contradictory",
  requires: ["sig.derived.asn_type", "sig.derived.client_suppression", "sig.edge.as_org"],
  detect(s) {
    if (!datacenter(s) || !intact(s)) return null;
    const org = asString(s, "sig.edge.as_org");
    const city = asString(s, "sig.edge.geo.city");
    if (!org) return null;
    const where = city ? ` in ${city}` : "";
    return tell(
      "evasion_incomplete",
      "contradictory",
      `${org} exit${where}. Fingerprint collectors returned values.`,
      "asn_type is datacenter. client_suppression is intact.",
      [
        "sig.derived.asn_type",
        "sig.derived.client_suppression",
        "sig.edge.as_org",
        "sig.edge.geo.city",
        "sig.client.timezone",
      ].filter((id) => present(s, [id])),
    );
  },
};

const advertisedExit: Detector = {
  id: "advertised_exit",
  category: "contradictory",
  requires: ["sig.derived.asn_type", "sig.derived.client_suppression", "sig.edge.geo.city", "sig.edge.as_org"],
  detect(s) {
    if (!datacenter(s) || !suppressed(s)) return null;
    const city = asString(s, "sig.edge.geo.city");
    const org = asString(s, "sig.edge.as_org");
    if (!city || !org) return null;
    return tell(
      "advertised_exit",
      "contradictory",
      `Edge city is ${city} on ${org}.`,
      "asn_type is datacenter. Fingerprint collectors are empty.",
      ["sig.derived.asn_type", "sig.edge.geo.city", "sig.edge.as_org", "sig.derived.client_suppression"],
    );
  },
};

const uaVsGpu: Detector = {
  id: "ua_vs_gpu",
  category: "contradictory",
  requires: ["sig.hdr.ua", "sig.client.webgl_vendor"],
  detect(s) {
    const ua = asString(s, "sig.hdr.ua");
    const vendor = asString(s, "sig.client.webgl_vendor");
    const renderer = asString(s, "sig.client.webgl_renderer");
    const uaPlat = uaPlatform(ua);
    const gpuPlat = gpuPlatform(vendor, renderer);
    if (!uaPlat || !gpuPlat || gpuPlat === "software") return null;
    if (uaPlat === gpuPlat) return null;
    return tell(
      "ua_vs_gpu",
      "contradictory",
      `UA says ${uaPlat}. GPU says ${gpuPlat}.`,
      `${ua ?? ""} / ${vendor ?? ""} ${renderer ?? ""}`.trim(),
      ["sig.hdr.ua", "sig.client.webgl_vendor", "sig.client.webgl_renderer"].filter((id) => present(s, [id])),
    );
  },
};

const headerVsClientLangs: Detector = {
  id: "header_vs_client_langs",
  category: "contradictory",
  requires: ["sig.hdr.accept_language", "sig.client.langs"],
  detect(s) {
    const hdr = asString(s, "sig.hdr.accept_language");
    const langs = asStringArray(s, "sig.client.langs");
    const a = langSubtag(hdr);
    const b = langSubtag(langs?.[0] ?? null);
    if (!a || !b || a === b) return null;
    return tell(
      "header_vs_client_langs",
      "contradictory",
      `Accept-Language is ${hdr}. Client list starts with ${langs?.[0]}.`,
      "primary language subtags differ.",
      ["sig.hdr.accept_language", "sig.client.langs"],
    );
  },
};

const intlVsUiLocale: Detector = {
  id: "intl_vs_ui_locale",
  category: "contradictory",
  requires: ["sig.client.langs", "sig.derived.install_regions"],
  detect(s) {
    const langs = asStringArray(s, "sig.client.langs");
    const regions = asStringArray(s, "sig.derived.install_regions");
    const locale = regionSubtag(langs?.[0] ?? null);
    if (!locale || !regions?.length) return null;
    if (regions.includes(locale)) return null;
    return tell(
      "intl_vs_ui_locale",
      "contradictory",
      `UI locale region is ${locale}. Install set is ${regions.join(", ")}.`,
      `${langs?.[0]} is not in install_regions.`,
      ["sig.client.langs", "sig.derived.install_regions"],
    );
  },
};

const softwareFromFont: Detector = {
  id: "software_from_font",
  category: "mapped",
  requires: ["sig.derived.software_implied"],
  detect(s) {
    const implied = asStringArray(s, "sig.derived.software_implied");
    if (!implied?.length) return null;
    return tell(
      "software_from_font",
      "mapped",
      `${implied.join(", ")} from installed fonts.`,
      "closed font map; Inter, Arial, Menlo are not mapped.",
      ["sig.derived.software_implied", "sig.client.fonts.probe_hits"].filter((id) => present(s, [id])),
    );
  },
};

const ASN_NAMED = new Set(["corporate", "education", "government"]);

const asnNamesOrg: Detector = {
  id: "asn_names_org",
  category: "mapped",
  requires: ["sig.derived.asn_type", "sig.edge.as_org"],
  detect(s) {
    const type = asString(s, "sig.derived.asn_type");
    const org = asString(s, "sig.edge.as_org");
    if (!type || !org || !ASN_NAMED.has(type)) return null;
    return tell(
      "asn_names_org",
      "mapped",
      `ASN organisation is ${org} (${type}).`,
      "not a residential, mobile, or datacenter match.",
      ["sig.derived.asn_type", "sig.edge.as_org"],
    );
  },
};

const calendarNonGregorian: Detector = {
  id: "calendar_non_gregorian",
  category: "rare",
  requires: ["sig.client.intl.calendar"],
  detect(s) {
    const cal = asString(s, "sig.client.intl.calendar");
    if (!cal || cal === "gregory" || cal === "iso8601") return null;
    return tell(
      "calendar_non_gregorian",
      "rare",
      `Calendar is ${cal}.`,
      "not gregorian.",
      ["sig.client.intl.calendar"],
    );
  },
};

const directionRtl: Detector = {
  id: "direction_rtl",
  category: "rare",
  requires: ["sig.client.intl.direction"],
  detect(s) {
    if (asString(s, "sig.client.intl.direction") !== "rtl") return null;
    return tell(
      "direction_rtl",
      "rare",
      "Text direction is rtl.",
      "intl.direction is rtl.",
      ["sig.client.intl.direction"],
    );
  },
};

const numberingNonLatin: Detector = {
  id: "numbering_non_latin",
  category: "rare",
  requires: ["sig.client.intl.numbering"],
  detect(s) {
    const sys = asString(s, "sig.client.intl.numbering");
    if (!sys || sys === "latn") return null;
    return tell(
      "numbering_non_latin",
      "rare",
      `Numbering system is ${sys}.`,
      "not latn.",
      ["sig.client.intl.numbering"],
    );
  },
};

const weekendNonStandard: Detector = {
  id: "weekend_non_standard",
  category: "rare",
  requires: ["sig.client.intl.weekend"],
  detect(s) {
    const days = asNumberArray(s, "sig.client.intl.weekend");
    if (!days?.length) return null;
    const key = [...days].sort((a, b) => a - b).join(",");
    if (key === "6,7") return null;
    return tell(
      "weekend_non_standard",
      "rare",
      `Weekend is ${key}.`,
      "not Saturday–Sunday.",
      ["sig.client.intl.weekend"],
    );
  },
};

const pwaStandalone: Detector = {
  id: "pwa_standalone",
  category: "rare",
  requires: ["sig.client.css.display_mode"],
  detect(s) {
    if (asString(s, "sig.client.css.display_mode") !== "standalone") return null;
    return tell(
      "pwa_standalone",
      "rare",
      "Display mode is standalone.",
      "running as an installed PWA.",
      ["sig.client.css.display_mode"],
    );
  },
};

const withheld: Detector = {
  id: "withheld",
  category: "withheld",
  requires: [],
  detect(s) {
    const hit = WITHHELD_SIGNAL_IDS.filter((id) => s[id] !== undefined);
    if (hit.length === 0) return null;
    return tell(
      "withheld",
      "withheld",
      "Accessibility-adjacent signals were collected and not sent to the model.",
      "shown in the ledger, omitted from inference.",
      [...hit],
    );
  },
};

export const DETECTORS: Detector[] = [
  installVsGeo,
  timezoneVsGeo,
  pathMixed,
  clientSuppression,
  evasionIncomplete,
  advertisedExit,
  uaVsGpu,
  headerVsClientLangs,
  intlVsUiLocale,
  softwareFromFont,
  asnNamesOrg,
  calendarNonGregorian,
  directionRtl,
  numberingNonLatin,
  weekendNonStandard,
  pwaStandalone,
  withheld,
];
