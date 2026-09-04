export const CLAIM_TYPES = [
  "location_region",
  "location_precision",
  "residency_status",
  "connection_context",
  "time_context",
  "device_tier",
  "device_family",
  "os_browser_posture",
  "privacy_posture",
  "technical_sophistication",
  "language_profile",
  "age_cohort",
  "employment_sector",
  "employer_or_org",
  "visit_intent",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];
