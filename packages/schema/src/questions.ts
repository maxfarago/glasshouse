export const QUESTIONS = [
  "location",
  "work_or_home",
  "technical_expertise",
  "visit_reason",
  "profession",
  "age_cohort",
] as const;

export type QuestionId = (typeof QUESTIONS)[number];

export const LOCATION_GRANULARITY = ["country", "region", "city", "indeterminate"] as const;
export const WORK_OR_HOME = ["home", "work", "third_place", "transit", "indeterminate"] as const;
export const TECHNICAL_EXPERTISE = ["non_technical", "technical", "expert", "indeterminate"] as const;
export const VISIT_REASON = [
  "recruiter",
  "potential_client",
  "developer_peer",
  "press",
  "personal_contact",
  "curious_stranger",
  "self_test",
  "indeterminate",
] as const;
export const PROFESSION = [
  "software_engineering",
  "design",
  "data_analytics",
  "product",
  "marketing",
  "finance",
  "legal",
  "academia",
  "creative_media",
  "operations",
  "student",
  "indeterminate",
] as const;
export const AGE_COHORT = ["under_25", "25_34", "35_49", "50_plus", "indeterminate"] as const;

export const ANSWER_SETS = {
  location: LOCATION_GRANULARITY,
  work_or_home: WORK_OR_HOME,
  technical_expertise: TECHNICAL_EXPERTISE,
  visit_reason: VISIT_REASON,
  profession: PROFESSION,
  age_cohort: AGE_COHORT,
} as const;

export type LocationGranularity = (typeof LOCATION_GRANULARITY)[number];
export type WorkOrHome = (typeof WORK_OR_HOME)[number];
export type TechnicalExpertise = (typeof TECHNICAL_EXPERTISE)[number];
export type VisitReason = (typeof VISIT_REASON)[number];
export type Profession = (typeof PROFESSION)[number];
export type AgeCohort = (typeof AGE_COHORT)[number];

export function isQuestionId(id: string): id is QuestionId {
  return (QUESTIONS as readonly string[]).includes(id);
}

export function isAnswerValue(question: QuestionId, value: string): boolean {
  return (ANSWER_SETS[question] as readonly string[]).includes(value);
}
