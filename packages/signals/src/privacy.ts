const GENERIC = new Set([
  "apple gpu",
  "google swiftshader",
  "blocked",
  "not available",
  "null",
  "undefined",
]);

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string" && GENERIC.has(value.trim().toLowerCase())) return true;
  if (typeof value === "number" && value === 0) return true;
  return false;
}

export function privacyPosture(values: unknown[]): number {
  return values.filter(isEmpty).length;
}
