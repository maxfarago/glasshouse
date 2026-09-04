export type LocalTime = {
  timezone: string;
  weekday: string;
  hour: number;
  iso: string;
};

export function localTime(timezone: string | null | undefined, now: Date): LocalTime | null {
  if (!timezone) return null;
  let weekday: string;
  let hour: string;
  try {
    weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: timezone }).format(now);
    hour = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now);
  } catch {
    return null;
  }
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now).replace(" ", "T");
  return { timezone, weekday, hour: Number.parseInt(hour, 10), iso };
}
