/**
 * Timezone helpers for clinic: interpret and format dates/times in CLINIC_TIMEZONE
 * so availability and user input are both handled in the same zone.
 */

const DEFAULT_TZ = "UTC";

/**
 * Get the IANA clinic timezone (from env or default).
 */
export function getClinicTimezone(): string {
  return process.env.CLINIC_TIMEZONE ?? DEFAULT_TZ;
}

/**
 * Return YYYY-MM-DD for the given UTC instant in the given timezone.
 * Use for availability fromDate/toDate so "February 5th 8:30 PM" in clinic TZ
 * requests slots for February 5th in that zone, not the UTC calendar date.
 */
export function dateInTimezone(isoUtc: string, timezoneIana: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc.slice(0, 10);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneIana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d); // "YYYY-MM-DD" in en-CA
}

/**
 * Local date/time parts for an UTC instant in the given timezone.
 * Use for formatting slot times in clinic timezone (e.g. "9 in the morning").
 */
export function localPartsInTimezone(
  isoUtc: string,
  timezoneIana: string
): { year: number; month: number; day: number; weekday: string; hour: number; minute: number } {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      weekday: "Unknown",
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneIana,
    weekday: "long",
  });
  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneIana,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = partsFormatter.formatToParts(d);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: weekdayFormatter.format(d),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Weekday in clinic TZ: 0 = Monday, 6 = Sunday (ISO-style). */
const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function getWeekdayInTimezone(isoUtc: string, timezoneIana: string): number {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return 0;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneIana,
    weekday: "long",
  });
  const name = formatter.format(d);
  const idx = WEEKDAY_ORDER.indexOf(name);
  return idx >= 0 ? idx : 0;
}

/** Add days to a YYYY-MM-DD date string; returns YYYY-MM-DD. */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Return fromDate and toDate (YYYY-MM-DD) for "this week" or "next week"
 * in the given timezone. Week is Monday–Sunday (ISO).
 * Use so backend receives explicit dates in clinic calendar, not UTC-based "when".
 */
export function getWeekRangeInTimezone(
  timezoneIana: string,
  kind: "this_week" | "next_week"
): { fromDate: string; toDate: string } {
  const now = new Date().toISOString();
  const todayStr = dateInTimezone(now, timezoneIana);
  const weekday = getWeekdayInTimezone(now, timezoneIana); // 0=Mon .. 6=Sun
  const mondayStr = addDaysToDate(todayStr, -weekday);
  if (kind === "this_week") {
    return {
      fromDate: mondayStr,
      toDate: addDaysToDate(mondayStr, 6),
    };
  }
  return {
    fromDate: addDaysToDate(mondayStr, 7),
    toDate: addDaysToDate(mondayStr, 13),
  };
}
