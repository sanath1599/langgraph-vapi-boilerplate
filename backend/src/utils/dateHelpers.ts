/**
 * Get start of day (00:00:00) and end of day (23:59:59.999) in UTC for a given Date.
 */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
export function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Get Monday 00:00 and Sunday 23:59:59.999 UTC for the week containing the given date.
 */
function getWeekRangeUTC(d: Date): { from: Date; to: Date } {
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const from = startOfDayUTC(monday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const to = endOfDayUTC(sunday);
  return { from, to };
}

export type WhenRange = "this_week" | "next_week";

/**
 * Resolve a "when" parameter to a date range (fromDate, toDate) in UTC.
 * - "this_week": from today through end of current week (Sunday).
 * - "next_week": from next Monday 00:00 through next Sunday 23:59.
 * - YYYY-MM-DD: that single day (00:00 to 23:59).
 * Returns null if the input is invalid.
 */
export function resolveWhenToDateRange(
  when: string
): { fromDate: Date; toDate: Date } | null {
  const normalized = when.trim().toLowerCase().replace(/\s+/g, "_");
  const now = new Date();
  const todayStart = startOfDayUTC(now);

  if (normalized === "this_week") {
    const { to } = getWeekRangeUTC(now);
    return { fromDate: todayStart, toDate: to };
  }
  if (normalized === "next_week") {
    const nextMonday = new Date(now);
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? 1 : 8 - day;
    nextMonday.setUTCDate(now.getUTCDate() + mondayOffset);
    const { from, to } = getWeekRangeUTC(nextMonday);
    return { fromDate: from, toDate: to };
  }

  // Single date YYYY-MM-DD
  const single = parseDateOnly(when);
  if (single) {
    return { fromDate: single, toDate: endOfDayUTC(single) };
  }
  return null;
}

/**
 * Parse ISO date string to Date at start of day (UTC).
 */
export function parseDateOnly(isoDate: string): Date | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * Check if date is in the future (after today UTC).
 */
export function isFutureDate(isoDate: string): boolean {
  const d = parseDateOnly(isoDate);
  if (!d) return false;
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return d > todayStart;
}

/**
 * Get hour of day (0-23) from Date for time-of-day filter.
 */
export function getHour(date: Date): number {
  return date.getHours();
}

export type TimeOfDay = "morning" | "afternoon" | "evening";

export function matchesTimeOfDay(date: Date, preferred: TimeOfDay): boolean {
  const h = getHour(date);
  switch (preferred) {
    case "morning":
      return h >= 6 && h < 12;
    case "afternoon":
      return h >= 12 && h < 17;
    case "evening":
      return h >= 17 && h < 21;
    default:
      return true;
  }
}

/** Default date range for admin lists: today (UTC) to today + 7 days. */
export function defaultFromTo(): { fromDate: string; toDate: string } {
  const now = new Date();
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);
  to.setUTCHours(23, 59, 59, 999);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}
