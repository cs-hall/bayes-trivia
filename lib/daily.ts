export const DAILY_DIFFICULTY = "easy";

/** The daily game rolls over at midnight in this time zone (DST-aware). */
export const DAILY_TIME_ZONE = "America/New_York";

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: DAILY_TIME_ZONE,
  year: "numeric",
});

/** The wall-clock date and time in the daily time zone. */
function zonedParts(now: Date) {
  const parts: Record<string, number> = {};
  for (const part of zoneFormatter.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    second: parts.second,
    year: parts.year,
  };
}

/** How far the daily time zone is ahead of UTC at this moment, in ms. */
function zoneOffsetMs(at: Date): number {
  const p = zonedParts(at);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Today's daily key ("YYYY-MM-DD"), by the date in the daily time zone. */
export function getCurrentDailyDateKey(now: Date = new Date()): string {
  const { day, month, year } = zonedParts(now);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The moment the next daily starts: the coming midnight in the daily time
 * zone. */
export function getNextDailyStart(now: Date = new Date()): Date {
  const { day, month, year } = zonedParts(now);
  const midnightAsUtc = Date.UTC(year, month - 1, day + 1);
  // Offset at the guess, then again at the result in case DST changes between.
  let start = midnightAsUtc - zoneOffsetMs(new Date(midnightAsUtc));
  start = midnightAsUtc - zoneOffsetMs(new Date(start));
  return new Date(start);
}

export function formatTimeUntilNextDaily(
  now: Date = new Date(),
  prefix = "Next daily in",
): string {
  const remainingMs = Math.max(
    0,
    getNextDailyStart(now).getTime() - now.getTime(),
  );
  const totalMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${prefix} ${minutes}m`;
  }

  return `${prefix} ${hours}h ${minutes}m`;
}
