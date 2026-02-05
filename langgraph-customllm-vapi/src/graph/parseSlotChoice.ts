import { parseDateTime, type ParseDateTimeOptions } from "./parseDateTime.js";

const LOG_PREFIX = "[time-slot]";

/** Slot shape used by book/reschedule (start is ISO string). */
export interface SlotWithStart {
  slotId: number;
  providerId: number;
  start: string;
  end: string;
}

/** Slots whose start is within preferred hour ± windowHours (same day). Uses UTC for slot times. */
export function slotsWithinTimeWindow(
  slots: Array<{ start: string }>,
  preferredHour: number,
  preferredMinute: number,
  windowHours = 1
): Array<{ start: string }> {
  const preferredMinutes = preferredHour * 60 + preferredMinute;
  const lo = Math.max(0, preferredMinutes - windowHours * 60);
  const hi = Math.min(24 * 60 - 1, preferredMinutes + windowHours * 60);

  return slots.filter((s) => {
    const d = new Date(s.start);
    const slotMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    return slotMinutes >= lo && slotMinutes <= hi;
  });
}

/** Closest slot to preferred time (same day) by start time. Uses UTC for slot times. */
export function closestSlotToTime(
  slots: Array<{ start: string; slotId: number; providerId: number; end: string }>,
  preferredHour: number,
  preferredMinute: number
): (typeof slots)[0] | null {
  if (slots.length === 0) return null;
  const preferredMs = preferredHour * 60 * 60 * 1000 + preferredMinute * 60 * 1000;

  let best: (typeof slots)[0] | null = null;
  let bestDiff = Infinity;

  for (const s of slots) {
    const d = new Date(s.start);
    const slotMs = d.getUTCHours() * 3600000 + d.getUTCMinutes() * 60000 + d.getUTCSeconds() * 1000;
    const diff = Math.abs(slotMs - preferredMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

/**
 * Find the slot whose Start time (UTC) is closest to the given target start time (UTC ISO).
 * Returns the full slot object { slotId, providerId, start, end }.
 */
export function findSlotClosestToStartTime<T extends SlotWithStart>(
  availableSlots: T[],
  targetStartUtcIso: string
): T | null {
  const fn = "findSlotClosestToStartTime";
  console.log(`${LOG_PREFIX} ${fn} entry: availableSlots=${availableSlots.length} targetStartUtcIso=${targetStartUtcIso}`);
  if (availableSlots.length === 0) {
    console.log(`${LOG_PREFIX} ${fn} result: null (no slots)`);
    return null;
  }
  const targetMs = new Date(targetStartUtcIso).getTime();
  if (Number.isNaN(targetMs)) {
    console.log(`${LOG_PREFIX} ${fn} result: null (invalid target ISO)`);
    return null;
  }

  const slotStarts = availableSlots.map((s) => s.start);
  console.log(`${LOG_PREFIX} ${fn} target=${targetStartUtcIso} targetMs=${targetMs} slotStarts=${JSON.stringify(slotStarts)}`);

  let best: T | null = null;
  let bestDiff = Infinity;

  for (const slot of availableSlots) {
    const startMs = new Date(slot.start).getTime();
    if (Number.isNaN(startMs)) continue;
    const diff = Math.abs(startMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slot;
    }
  }
  if (best) {
    console.log(`${LOG_PREFIX} ${fn} result: slotId=${best.slotId} start=${best.start} diffMs=${bestDiff} diffMins=${Math.round(bestDiff / 60000)}`);
  } else {
    console.log(`${LOG_PREFIX} ${fn} result: null`);
  }
  return best;
}

/**
 * When the user mentions a time slot (e.g. "4:30 AM", "tomorrow at 6:30"), parse with the unified
 * date/time parser (OpenAI + timezone), then return the available slot whose Start is closest.
 */
export async function parseUserMentionedTimeToClosestSlot<T extends SlotWithStart>(
  userUtterance: string,
  availableSlots: T[],
  options?: ParseDateTimeOptions
): Promise<T | null> {
  const fn = "parseUserMentionedTimeToClosestSlot";
  console.log(`${LOG_PREFIX} ${fn} entry: utterance="${userUtterance.trim().slice(0, 60)}" availableSlots=${availableSlots.length}`);
  if (availableSlots.length === 0) {
    console.log(`${LOG_PREFIX} ${fn} result: null (no slots)`);
    return null;
  }
  const parsed = await parseDateTime(userUtterance, options);
  if (parsed?.kind !== "moment") {
    console.log(`${LOG_PREFIX} ${fn} result: null (parsed kind=${parsed?.kind ?? "null"}, need moment)`);
    return null;
  }
  const slot = findSlotClosestToStartTime(availableSlots, parsed.isoUtc);
  console.log(`${LOG_PREFIX} ${fn} result: ${slot ? `slotId=${slot.slotId} start=${slot.start}` : "null"}`);
  return slot;
}
