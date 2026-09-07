export type ClientSuppression = "suppressed" | "intact" | "indeterminate";

function empty(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (typeof value === "number" && value === 0) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "apple gpu" || s === "google swiftshader" || s === "blocked";
  }
  return false;
}

export function clientSuppression(input: {
  canvas: unknown;
  audio: unknown;
  fontsCount: unknown;
  webglRenderer: unknown;
  calendar: unknown;
  numbering: unknown;
  firstDay: unknown;
}): ClientSuppression {
  const fp = [input.canvas, input.audio, input.fontsCount, input.webglRenderer];
  const fpEmpty = fp.filter(empty).length >= 3;
  const intlOn = input.calendar != null || input.numbering != null || input.firstDay != null;
  if (fpEmpty && intlOn) return "suppressed";
  if (fpEmpty && !intlOn) return "indeterminate";
  return "intact";
}