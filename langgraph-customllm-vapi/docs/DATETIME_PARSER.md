# Unified Date + Time Parser

A single OpenAI-based parser handles all date and time interpretation, with timezone support (`CLINIC_TIMEZONE` or optional IANA zone).

## Overview

- **File**: `src/graph/parseDateTime.ts`
- **Replaces**: `parseDatePreference`, `parseDateAndTimeFromUtterance`, `parseUserTimeToUtcISO`
- **Input**: User utterance (e.g. "this week", "tomorrow at 4pm", "February 10th at 2pm")
- **Output**: Structured result for availability (range) or slot choice (single moment in UTC)

## Result Type: `ParsedDateTime`

```ts
type ParsedDateTime =
  | { kind: "range"; when: "this_week" | "next_week" }
  | { kind: "range"; fromDate: string; toDate: string }  // YYYY-MM-DD
  | { kind: "moment"; isoUtc: string }                    // ISO 8601 UTC
  | null;
```

- **range + when**: Used for availability params `{ when: "this_week" }` or `{ when: "next_week" }`.
- **range + fromDate/toDate**: Used for availability params `{ fromDate, toDate }` (e.g. "tomorrow", "Monday").
- **moment**: Single instant in UTC; used for slot choice (find closest slot) and for "fetch by date then pick closest".

## API

### `parseDateTime(utterance, options?)`

Parses the user's utterance using OpenAI. All user times are interpreted in the given timezone and converted to UTC for moments.

- **Input**
  - `utterance`: string
  - `options.referenceNowUtc`: optional "now" in UTC (default: current time)
  - `options.timezoneIana`: optional IANA timezone (default: `CLINIC_TIMEZONE` or `"UTC"`)
- **Success**: Returns `ParsedDateTime` (range or moment).
- **Failure**: Returns `null`.

### `getAvailabilityParamsFromParsed(parsed, options?)`

Maps `ParsedDateTime` to params for `getAvailability`. All dates are in **organization timezone** so the backend filters by the organization's calendar.

- **Input**: `ParsedDateTime` or `null`, and optional `{ timezoneIana?: string }` (default: `CLINIC_TIMEZONE` or `"UTC"`).
- **Output**: `{ fromDate?: string; toDate?: string }` only. For "this week" / "next week", the helper `getWeekRangeInTimezone(timezoneIana, when)` computes Monday–Sunday in the clinic timezone and returns explicit `fromDate`/`toDate` (no `when`), so the backend always receives date ranges in the organization's calendar.

### `dateFromMoment(parsed)`

Returns `YYYY-MM-DD` from a moment result for fetching availability by date.

- **Input**: `{ kind: "moment"; isoUtc: string }`
- **Output**: string (e.g. `"2026-02-03"`)

## Timezone

- **Env**: `CLINIC_TIMEZONE` (e.g. `America/New_York`) is used when `options.timezoneIana` is not set.
- **Behavior**: User phrases like "10am", "4:30 PM" are interpreted in that zone; moments are output as ISO 8601 UTC.
- **Week ranges**: "This week" and "next week" are converted to explicit `fromDate`/`toDate` (Monday–Sunday) in the clinic timezone via `getWeekRangeInTimezone()` in `src/graph/timezoneHelpers.ts`, so availability is always requested for the correct calendar week in the organization's zone.

## Usage in Flows

- **bookFlow**: Calls `parseDateTime(lastUser, { timezoneIana: process.env.CLINIC_TIMEZONE })` once; uses `getAvailabilityParamsFromParsed(dateParsed)` for availability, and when `dateParsed?.kind === "moment"` fetches by date and uses `findSlotClosestToStartTime(slots, dateParsed.isoUtc)`.
- **rescheduleFlow**: Same pattern; uses `parseDateTime` for the "fetch by date" path and `parseUserMentionedTimeToClosestSlot` (which uses `parseDateTime` internally) for slot choice.
- **parseUserMentionedTimeToClosestSlot** (in `parseSlotChoice.ts`): Calls `parseDateTime`; if result is `kind: "moment"`, returns `findSlotClosestToStartTime(slots, result.isoUtc)`.
