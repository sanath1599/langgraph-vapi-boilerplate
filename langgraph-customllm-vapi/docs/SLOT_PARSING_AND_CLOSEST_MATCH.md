# Slot Parsing and Closest Match

When the user mentions a time slot (e.g. "4:30 AM", "tomorrow at 6:30", "February 3rd at 7:30 AM"), the system parses it into a UTC start time and returns the available slot whose **Start** is closest. Slots in `metadata.state._available_slots` use UTC ISO 8601 for `start` and `end`.

## Data Type: Available Slot

Each slot in `metadata.state._available_slots` has:

| Field       | Type   | Description                          |
|------------|--------|--------------------------------------|
| `slotId`   | number | Unique slot identifier               |
| `providerId` | number | Provider identifier                |
| `start`    | string | ISO 8601 UTC (e.g. `2026-02-03T04:30:00.000Z`) |
| `end`      | string | ISO 8601 UTC (e.g. `2026-02-03T05:30:00.000Z`) |

## Flow

1. **Option number** – "1", "option 2" → slot by index.
2. **Time mention** – User says a time (e.g. "4:30 AM", "tomorrow at 6:30"); `parseUserMentionedTimeToClosestSlot` uses the unified **parseDateTime** (OpenAI + timezone), then finds the slot whose `start` is closest.
3. **Date/time preference** – User says a date (and optional time); `parseDateTime` returns a moment; we fetch availability for that date and use `findSlotClosestToStartTime(slots, isoUtc)`.

All date/time parsing goes through **parseDateTime** in `parseDateTime.ts` (see `docs/DATETIME_PARSER.md`).

## API (Internal)

### `findSlotClosestToStartTime(availableSlots, targetStartUtcIso)`

Finds the slot whose `start` (UTC) is closest to the target time.

- **Input**
  - `availableSlots`: array of `{ slotId, providerId, start, end }`
  - `targetStartUtcIso`: ISO 8601 UTC string
- **Success**: Returns the slot object with smallest `|slot.start - target|`.
- **Failure**: Returns `null` if no slots or target is invalid.

### `parseUserMentionedTimeToClosestSlot(userUtterance, availableSlots, options?)`

Uses the unified **parseDateTime**; if result is a moment, returns the slot whose `start` is closest.

- **Input**
  - `userUtterance`: string
  - `availableSlots`: array of slot objects
  - `options`: `ParseDateTimeOptions` (referenceNowUtc, timezoneIana)
- **Success**: Returns the slot object `{ slotId, providerId, start, end }` closest to the user's mentioned time.
- **Failure**: Returns `null`.

## Timezone Handling

- **Slots**: `start` and `end` are always UTC (e.g. `...Z`).
- **User input**: Interpreted in organization timezone when set (`CLINIC_TIMEZONE` or `options.timezoneIana`). Examples: "10am" = 10:00 in that zone, then converted to UTC for comparison.
- **Comparison**: All "closest to start time" logic compares UTC timestamps.

## Usage in Flows

- **bookFlow**: After option-number match, calls `parseUserMentionedTimeToClosestSlot(lastUser, slots)`; if a slot is returned, it is used as the chosen slot (same shape as `_available_slots`).
- **rescheduleFlow**: Same: after option-number match, uses `parseUserMentionedTimeToClosestSlot(lastUser, slotsList)`.

## Environment

- `CLINIC_TIMEZONE`: IANA timezone for interpreting user times (e.g. `America/New_York`). If unset, user times are assumed UTC.
