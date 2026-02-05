/**
 * Single date + time parser using OpenAI with timezone information.
 * Replaces parseDatePreference, parseDateAndTimeFromUtterance, parseUserTimeToUtcISO.
 */
import { createAzureOpenAIClient, getDefaultModel } from "../azureClient.js";
import {
  PARSE_DATETIME_SYSTEM,
  buildParseDateTimeUserMessage,
} from "../prompts/repository.js";
import { dateInTimezone, getWeekRangeInTimezone } from "./timezoneHelpers.js";

let client: ReturnType<typeof createAzureOpenAIClient> | null = null;

function getClient() {
  if (!client) client = createAzureOpenAIClient();
  return client;
}

/** Result of parsing: either a range (for availability) or a single moment (for slot choice). */
export type ParsedDateTime =
  | { kind: "range"; when: "this_week" | "next_week" }
  | { kind: "range"; fromDate: string; toDate: string }
  | { kind: "moment"; isoUtc: string }
  | null;

export type ParseDateTimeOptions = {
  referenceNowUtc?: string;
  timezoneIana?: string;
  /** Optional conversation context (e.g. last assistant message) so "10 am" resolves to the date just offered. */
  conversationContext?: string | null;
};

/**
 * Parse user utterance into a structured date/time using OpenAI.
 * Uses timezone (e.g. CLINIC_TIMEZONE) so "10am" is interpreted in that zone.
 */
const LOG_PREFIX = "[time-slot]";

export async function parseDateTime(
  utterance: string,
  options?: ParseDateTimeOptions
): Promise<ParsedDateTime> {
  const fn = "parseDateTime";
  const trimmed = utterance.trim();
  const tz = options?.timezoneIana ?? process.env.CLINIC_TIMEZONE ?? "UTC";
  console.log(`${LOG_PREFIX} ${fn} entry: utterance="${trimmed.slice(0, 80)}" timezone=${tz}`);
  if (!trimmed) {
    console.log(`${LOG_PREFIX} ${fn} result: null (empty utterance)`);
    return null;
  }

  const now = options?.referenceNowUtc ?? new Date().toISOString();
  const conversationContext = options?.conversationContext ?? null;

  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: PARSE_DATETIME_SYSTEM },
      { role: "user", content: buildParseDateTimeUserMessage(now, tz, trimmed, conversationContext) },
    ],
    max_tokens: 120,
    temperature: 0,
  });

  let raw = (completion.choices[0]?.message?.content ?? "").trim();
  if (raw.toUpperCase() === "INVALID") {
    console.log(`${LOG_PREFIX} ${fn} result: null (LLM returned INVALID)`);
    return null;
  }
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const json = JSON.parse(raw) as ParsedDateTime;
    if (json && typeof json === "object" && "kind" in json) {
      if (json.kind === "range") {
        if ("when" in json && (json.when === "this_week" || json.when === "next_week")) {
          console.log(`${LOG_PREFIX} ${fn} result: kind=range when=${json.when}`);
          return { kind: "range", when: json.when };
        }
        if ("fromDate" in json && "toDate" in json && /^\d{4}-\d{2}-\d{2}$/.test(json.fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(json.toDate)) {
          console.log(`${LOG_PREFIX} ${fn} result: kind=range fromDate=${json.fromDate} toDate=${json.toDate}`);
          return { kind: "range", fromDate: json.fromDate, toDate: json.toDate };
        }
      }
      if (json.kind === "moment" && "isoUtc" in json && typeof json.isoUtc === "string") {
        const iso = json.isoUtc;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(iso)) {
          console.log(`${LOG_PREFIX} ${fn} result: kind=moment isoUtc=${iso}`);
          return { kind: "moment", isoUtc: iso };
        }
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) {
          const normalized = d.toISOString();
          console.log(`${LOG_PREFIX} ${fn} result: kind=moment isoUtc=${normalized}`);
          return { kind: "moment", isoUtc: normalized };
        }
      }
    }
  } catch (e) {
    console.log(`${LOG_PREFIX} ${fn} result: null (parse error)`, e);
  }
  console.log(`${LOG_PREFIX} ${fn} result: null (no valid shape)`);
  return null;
}

/** Options for availability params: use clinic TZ so date range matches user's calendar. */
export type GetAvailabilityParamsOptions = { timezoneIana?: string };

/** Build getAvailability params from parsed result. Uses clinic timezone for moment→date so availability is for the correct calendar day. */
export function getAvailabilityParamsFromParsed(
  parsed: ParsedDateTime,
  options?: GetAvailabilityParamsOptions
): { when?: "this_week" | "next_week"; fromDate?: string; toDate?: string } {
  const fn = "getAvailabilityParamsFromParsed";
  const tz = options?.timezoneIana ?? process.env.CLINIC_TIMEZONE ?? "UTC";
  console.log(`${LOG_PREFIX} ${fn} entry: parsed=${parsed ? `kind=${parsed.kind}` : "null"} timezone=${tz}`);
  let result: { when?: "this_week" | "next_week"; fromDate?: string; toDate?: string };
  if (!parsed) {
    const week = getWeekRangeInTimezone(tz, "this_week");
    result = { fromDate: week.fromDate, toDate: week.toDate };
  } else if (parsed.kind === "range" && "when" in parsed) {
    const week = getWeekRangeInTimezone(tz, parsed.when);
    result = { fromDate: week.fromDate, toDate: week.toDate };
  } else if (parsed.kind === "range" && "fromDate" in parsed) {
    result = { fromDate: parsed.fromDate, toDate: parsed.toDate };
  } else if (parsed.kind === "moment") {
    const date = dateInTimezone(parsed.isoUtc, tz);
    result = { fromDate: date, toDate: date };
  } else {
    const week = getWeekRangeInTimezone(tz, "this_week");
    result = { fromDate: week.fromDate, toDate: week.toDate };
  }
  console.log(`${LOG_PREFIX} ${fn} result:`, result);
  return result;
}

/** Extract YYYY-MM-DD in clinic timezone from a moment for fetching availability by date. */
export function dateFromMoment(
  parsed: { kind: "moment"; isoUtc: string },
  options?: { timezoneIana?: string }
): string {
  const fn = "dateFromMoment";
  const tz = options?.timezoneIana ?? process.env.CLINIC_TIMEZONE ?? "UTC";
  const date = dateInTimezone(parsed.isoUtc, tz);
  console.log(`${LOG_PREFIX} ${fn} entry: isoUtc=${parsed.isoUtc} timezone=${tz} result: date=${date}`);
  return date;
}
