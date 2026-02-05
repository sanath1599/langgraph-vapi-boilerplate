import {
  DATE_WORDS_SYSTEM,
  AVAILABILITY_CONDENSED_SYSTEM,
  buildDateWordsSingleUserMessage,
  buildDateWordsBatchUserMessage,
  buildAvailabilityCondensedUserMessage,
  NO_SLOTS_THIS_WEEK,
  NO_SLOTS_FOR_PERIOD,
  optionSlotSentence,
  onDateWeHaveSentence,
} from "../prompts/repository.js";
import { getClinicTimezone, localPartsInTimezone } from "./timezoneHelpers.js";

/**
 * Format a slot start time in words for voice (sync fallback).
 * Uses clinic timezone when timezoneIana is provided so slot times match the clinic's local time.
 */
export function formatSlotDateInWords(isoStart: string, timezoneIana?: string): string {
  const tz = timezoneIana ?? getClinicTimezone();
  const d = new Date(isoStart);
  const parts = localPartsInTimezone(isoStart, tz);
  const monthName = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(d);
  const timeWords = getTimeInWords(parts.hour, parts.minute);
  return `${parts.weekday}, ${monthName} ${getOrdinal(parts.day)} at ${timeWords}`;
}

/** Check if output looks like a date phrase (e.g. "Monday, February 3rd at 9 in the morning"). */
function looksLikeDatePhrase(text: string): boolean {
  const t = text.trim();
  return t.length >= 10 && t.length <= 120 && (/at \d|at [a-z]+/i.test(t) || /\d+(st|nd|rd|th)/.test(t));
}

/**
 * Use OpenAI to generate a natural-language phrase for a single datetime (for voice).
 * Uses clinic timezone so the spoken time matches the clinic's local time.
 */
export async function formatSlotDateInWordsWithLLM(isoStart: string, timezoneIana?: string): Promise<string> {
  const tz = timezoneIana ?? getClinicTimezone();
  try {
    const { generateReply } = await import("./llm.js");
    const text = await generateReply(
      DATE_WORDS_SYSTEM,
      buildDateWordsSingleUserMessage(isoStart, tz),
      80
    );
    const trimmed = (text || "").trim();
    if (trimmed && looksLikeDatePhrase(trimmed)) return trimmed;
  } catch {
    // fall through to sync fallback
  }
  return formatSlotDateInWords(isoStart, tz);
}

/**
 * Use OpenAI to generate natural-language phrases for multiple datetimes (batch, for voice).
 * Returns one phrase per line in the same order as the input slots. Uses clinic timezone.
 */
export async function formatDatesInWordsBatch(
  isoStarts: string[],
  timezoneIana?: string
): Promise<string[]> {
  const tz = timezoneIana ?? getClinicTimezone();
  if (isoStarts.length === 0) return [];
  const { generateReply } = await import("./llm.js");
  const raw = await generateReply(
    DATE_WORDS_SYSTEM,
    buildDateWordsBatchUserMessage(isoStarts, tz),
    400
  );
  const lines = raw
    .split(/\n/)
    .map((s: string) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length >= isoStarts.length) {
    return lines.slice(0, isoStarts.length);
  }
  return isoStarts.map((iso) => formatSlotDateInWords(iso, tz));
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function getTimeInWords(hour: number, minute: number): string {
  const period = hour < 12 ? "in the morning" : hour < 17 ? "in the afternoon" : "in the evening";
  const h = hour % 12 || 12;
  if (minute === 0) return `${h} ${period}`;
  if (minute === 30) return `half past ${h} ${period}`;
  if (minute === 15) return `quarter past ${h} ${period}`;
  if (minute === 45) return `quarter to ${((hour + 1) % 12) || 12} ${period}`;
  return `${h} ${minute} ${period}`;
}

/**
 * Format multiple slots for voice: dates in words, a little slowly (clear pauses between options).
 * Uses clinic timezone for slot times.
 */
export function formatAvailabilityForVoice(
  slots: Array<{ start: string }>,
  maxSlots = 5,
  timezoneIana?: string
): string {
  const tz = timezoneIana ?? getClinicTimezone();
  if (slots.length === 0) return NO_SLOTS_THIS_WEEK;
  return slots
    .slice(0, maxSlots)
    .map((s, i) => optionSlotSentence(i + 1, formatSlotDateInWords(s.start, tz)))
    .join(" … Then, ");
}

/** Check if LLM output looks like the expected "On [date] we have [times]" format (avoid gibberish). */
function looksLikeCondensedAvailability(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 600) return false;
  return /on\s+.+we have/i.test(t) || /\d+am|\d+pm/i.test(t);
}

export async function formatAvailabilityCondensedByDate(
  slots: Array<{ start: string }>,
  timezoneIana?: string
): Promise<string> {
  const tz = timezoneIana ?? getClinicTimezone();
  if (slots.length === 0) return NO_SLOTS_FOR_PERIOD;
  // Prefer sync fallback when timezone is set so grouping and times are always in clinic TZ (no LLM date-grouping drift).
  if (timezoneIana ?? process.env.CLINIC_TIMEZONE) {
    return formatAvailabilityForVoiceFallback(slots, tz);
  }
  try {
    const { generateReply } = await import("./llm.js");
    const isoList = slots.map((s) => s.start).join("\n");
    const raw = await generateReply(
      AVAILABILITY_CONDENSED_SYSTEM,
      buildAvailabilityCondensedUserMessage(isoList, tz),
      600
    );
    const text = raw.trim();
    if (text && looksLikeCondensedAvailability(text)) return text;
  } catch {
    // fall through to sync fallback
  }
  return formatAvailabilityForVoiceFallback(slots, tz);
}

/** Sync fallback when LLM fails: group by date and list times in clinic timezone. */
function formatAvailabilityForVoiceFallback(
  slots: Array<{ start: string }>,
  timezoneIana?: string
): string {
  const tz = timezoneIana ?? getClinicTimezone();
  const byDate = new Map<string, { label: string; times: string[] }>();
  for (const s of slots) {
    const parts = localPartsInTimezone(s.start, tz);
    const key = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const monthName = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(
      new Date(s.start)
    );
    const label = `${monthName} ${getOrdinal(parts.day)}`;
    const time =
      parts.minute === 0
        ? `${parts.hour % 12 || 12}${parts.hour < 12 ? "am" : "pm"}`
        : `${parts.hour % 12 || 12}:${String(parts.minute).padStart(2, "0")}${parts.hour < 12 ? "am" : "pm"}`;
    const entry = byDate.get(key);
    if (entry) entry.times.push(time);
    else byDate.set(key, { label, times: [time] });
  }
  const sortedKeys = [...byDate.keys()].sort();
  const parts = sortedKeys.map((k) => {
    const { label, times } = byDate.get(k)!;
    return onDateWeHaveSentence(label, [...new Set(times)]);
  });
  return parts.join(" ");
}

/**
 * Format multiple slots for voice using OpenAI to generate date phrases (batch).
 * @deprecated Prefer formatAvailabilityCondensedByDate for availability read-out.
 */
export async function formatAvailabilityForVoiceAsync(
  slots: Array<{ start: string }>,
  maxSlots = 5,
  timezoneIana?: string
): Promise<string> {
  if (slots.length === 0) return NO_SLOTS_THIS_WEEK;
  const tz = timezoneIana ?? getClinicTimezone();
  const slice = slots.slice(0, maxSlots);
  const phrases = await formatDatesInWordsBatch(slice.map((s) => s.start), tz);
  return phrases
    .map((phrase, i) => optionSlotSentence(i + 1, phrase))
    .join(" … Then, ");
}
