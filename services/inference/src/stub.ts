import { randomUUID } from "node:crypto";
import type { Claim, ClaimType, Declined, Portrait, SignalSet } from "@glasshouse/schema";
import { hashSignalSet } from "@glasshouse/schema/hash";
import type { InferInput, Inference } from "./types.ts";

const MODEL_ID = "stub-v0";
const PROMPT_VERSION = "stub";

function str(signals: SignalSet, id: keyof SignalSet): string | null {
  const v = signals[id];
  return typeof v === "string" ? v : null;
}

function num(signals: SignalSet, id: keyof SignalSet): number | null {
  const v = signals[id];
  return typeof v === "number" ? v : null;
}

function langs(signals: SignalSet): string[] {
  const v = signals["sig.client.langs"];
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function localTime(signals: SignalSet): { weekday: string; hour: number; timezone: string } | null {
  const v = signals["sig.derived.local_time"];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const rec = v as { weekday?: unknown; hour?: unknown; timezone?: unknown };
  if (typeof rec.weekday !== "string" || typeof rec.hour !== "number" || typeof rec.timezone !== "string") {
    return null;
  }
  return { weekday: rec.weekday, hour: rec.hour, timezone: rec.timezone };
}

function claim(
  type: ClaimType,
  confidence: Claim["confidence"],
  statement: string,
  evidence: string[],
  reasoning: string,
  falsifier: string,
): Claim {
  return {
    claim_id: randomUUID(),
    claim_type: type,
    confidence,
    statement,
    evidence,
    reasoning,
    falsifier,
  };
}

function buildClaims(signals: SignalSet): { claims: Claim[]; declined: Declined[]; thin: string | null } {
  const claims: Claim[] = [];
  const declined: Declined[] = [];
  const city = str(signals, "sig.edge.geo.city");
  const country = str(signals, "sig.edge.geo.country");
  const asnType = str(signals, "sig.derived.asn_type");
  const asOrg = str(signals, "sig.edge.as_org");
  const tz = str(signals, "sig.client.timezone");
  const family = str(signals, "sig.derived.device_family");
  const ua = str(signals, "sig.hdr.ua");
  const posture = num(signals, "sig.derived.privacy_posture") ?? 0;
  const language = langs(signals);
  const time = localTime(signals);

  const tzLooksNl = tz?.includes("Amsterdam") === true || tz?.includes("Brussels") === true;
  const geoUs = country === "US";
  const vpnish = asnType === "datacenter" && tzLooksNl && geoUs;

  if (vpnish) {
    claims.push(
      claim(
        "connection_context",
        "LIKELY",
        "vpn or datacenter exit: edge geo is us while the timezone is dutch",
        ["sig.derived.asn_type", "sig.edge.geo.country", "sig.client.timezone"],
        "asn type is datacenter and country/timezone disagree.",
        "a residential asn in the same country as the timezone",
      ),
      claim(
        "location_region",
        "PLAUSIBLE",
        "visitor is more likely in the netherlands than in the advertised us exit city",
        ["sig.client.timezone", "sig.hdr.accept_language", "sig.edge.geo.city"],
        "timezone and language stack point at nl; the us city is the vpn egress.",
        "timezone matching the us colo, or a dutch residential asn with no contradiction",
      ),
      claim(
        "location_precision",
        "HUNCH",
        "city-level placement is not available; the edge city is an exit, not a person",
        ["sig.edge.geo.city", "sig.derived.asn_type"],
        "datacenter geo is cheap to spoof; do not treat it as presence.",
        "a gps sample or a residential asn in-country",
      ),
    );
  } else if (city || country) {
    const where = city ? `${city}, ${country ?? "unknown country"}` : (country ?? "unknown");
    claims.push(
      claim(
        "location_region",
        city ? "LIKELY" : "PLAUSIBLE",
        `edge geo places them in ${where.toLowerCase()}`,
        city ? ["sig.edge.geo.city", "sig.edge.geo.country"] : ["sig.edge.geo.country"],
        "cloudflare edge geo is coarse and can be wrong near borders, but it is a real observation.",
        "a gps sample or a language/timezone stack that contradicts this country",
      ),
      claim(
        "location_precision",
        city ? "PLAUSIBLE" : "HUNCH",
        city
          ? `city is named (${city.toLowerCase()}); that is still a metro, not a building`
          : "only a country code is present; city is absent",
        city ? ["sig.edge.geo.city"] : ["sig.edge.geo.country"],
        "cf city is a bucket, not a coordinate.",
        "gps or a building-level reverse geocode",
      ),
    );
  } else {
    declined.push({ claim_type: "location_region", reason: "no geo signals" });
    declined.push({ claim_type: "location_precision", reason: "no geo signals" });
  }

  if (asnType && asnType !== "unknown" && !vpnish) {
    const homeish = asnType === "residential" || asnType === "mobile";
    claims.push(
      claim(
        "connection_context",
        homeish ? "PLAUSIBLE" : "LIKELY",
        homeish
          ? `connection looks ${asnType}, consistent with home or pocket rather than a hosted exit`
          : `connection looks ${asnType} (${asOrg ?? "unknown org"})`,
        ["sig.derived.asn_type", "sig.edge.as_org"],
        "asn type is a string-match on as_org, not an rDNS lookup.",
        "an as_org that classifies as a different asn type",
      ),
    );
  } else if (!vpnish) {
    declined.push({ claim_type: "connection_context", reason: "asn type unknown" });
  }

  if (family) {
    claims.push(
      claim(
        "device_family",
        "PLAUSIBLE",
        `hardware class is ${family.toLowerCase()}`,
        ["sig.derived.device_family", "sig.client.screen", "sig.client.dpr"],
        "resolution bucket plus touch points; not a specific sku.",
        "a screen size that lands in a different bucket",
      ),
    );
  } else {
    declined.push({ claim_type: "device_family", reason: "no screen/dpr" });
  }

  if (ua) {
    const chrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
    const safari = /Safari\//.test(ua) && !/Chrome\//.test(ua);
    const mac = /Macintosh/.test(ua);
    const ios = /iPhone|iPad/.test(ua);
    const label = [
      ios ? "ios" : mac ? "mac" : null,
      chrome ? "chrome" : safari ? "safari" : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (label) {
      claims.push(
        claim(
          "os_browser_posture",
          "LIKELY",
          `ua reads as ${label}`,
          ["sig.hdr.ua"],
          "ua is generic on ios and spoofable everywhere; still the observation we have.",
          "a client hint platform that contradicts the ua token",
        ),
      );
    }
  }

  if (language.length) {
    const joined = language.join(", ").toLowerCase();
    claims.push(
      claim(
        "language_profile",
        "PLAUSIBLE",
        `accept/client languages are ${joined}`,
        language.length && signals["sig.hdr.accept_language"]
          ? ["sig.client.langs", "sig.hdr.accept_language"]
          : ["sig.client.langs"],
        "order is a preference, not proof of nativeness.",
        "a language list with a different primary tag",
      ),
    );
  }

  if (time) {
    const workish = time.hour >= 9 && time.hour < 18 && time.weekday !== "Saturday" && time.weekday !== "Sunday";
    claims.push(
      claim(
        "time_context",
        "HUNCH",
        `local time is ${time.weekday.toLowerCase()} ${time.hour}:00 (${time.timezone}), ${workish ? "inside conventional work hours" : "outside conventional work hours"}`,
        ["sig.derived.local_time", "sig.client.timezone"],
        "work-hours is a cultural default, not an employment detector.",
        "a timezone that shifts this timestamp out of the stated bucket",
      ),
    );
  }

  if (posture >= 5) {
    claims.push(
      claim(
        "privacy_posture",
        "LIKELY",
        `the client returned ${posture} empty or generic signals; this looks like deliberate hardening, not a failed collect`,
        ["sig.derived.privacy_posture"],
        "null canvas/audio/fonts/geo is itself a signal.",
        "a dense canvas/font/webgl set on a later pass",
      ),
    );
  } else if (posture <= 1) {
    claims.push(
      claim(
        "privacy_posture",
        "HUNCH",
        "almost every collector returned a value; this looks like default browser posture, not lockdown",
        ["sig.derived.privacy_posture"],
        "low null count is the inverse of the empty-state screen.",
        "randomized canvas or a fonts.count of zero",
      ),
    );
  }

  claims.push(
    claim(
      "visit_intent",
      "CONFIDENT",
      "they are here to see what this site says about them",
      [],
      "barnum: this would apply to anyone who loaded the page.",
      "a referer from a specific campaign",
    ),
  );

  declined.push(
    { claim_type: "age_cohort", reason: "no signal supports an age band" },
    { claim_type: "employment_sector", reason: "no employer-grade asn or rDNS" },
    { claim_type: "employer_or_org", reason: "no employer-grade asn or rDNS" },
  );

  if (!claims.some((c) => c.claim_type === "residency_status")) {
    declined.push({
      claim_type: "residency_status",
      reason: "stub does not infer tenure or mobility",
    });
  }
  if (!claims.some((c) => c.claim_type === "device_tier")) {
    declined.push({ claim_type: "device_tier", reason: "stub does not price hardware" });
  }
  if (!claims.some((c) => c.claim_type === "technical_sophistication")) {
    declined.push({
      claim_type: "technical_sophistication",
      reason: "stub leaves sophistication to a real model",
    });
  }

  const present = Object.values(signals).filter((v) => v != null && v !== "").length;
  const thin =
    posture >= 5 || present < 8
      ? "sparse input: most collectors returned null, generic, or randomized values"
      : null;

  return { claims, declined, thin };
}

export const stubInference: Inference = {
  model_id: MODEL_ID,
  async infer(input) {
    const { claims, declined, thin } = buildClaims(input.signals);
    const portrait: Portrait = {
      portrait_id: randomUUID(),
      session_id: input.session_id,
      pass_index: input.pass_index,
      prompt_version: input.prompt_version || PROMPT_VERSION,
      model_id: MODEL_ID,
      sampling: input.sampling,
      signal_set_hash: hashSignalSet(input.signals),
      tiers_available: input.tiers_available,
      claims,
      declined,
      thin_signal_note: thin,
      behavior_sparse: input.behavior_sparse,
    };
    return portrait;
  },
};
