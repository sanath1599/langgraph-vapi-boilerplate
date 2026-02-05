# Match Appointment by Date/Time (Cancel / Reschedule)

## Overview

Users can identify which appointment to cancel or reschedule by **date/time** (e.g. "cancel the feb 13th 9 am appointment", "the one on Friday at 9") instead of only by option number. The assistant uses OpenAI to match the user's message to one of the listed appointments. Appointment times are **converted to the organization timezone** before being sent to the LLM so the model sees consistent, human-readable times.

## Behavior

1. **Cancel flow** (choose appointment to cancel):
   - Assistant lists appointments with option numbers and date/time in organization TZ (e.g. "Option 1: John Doe on Friday, February 13th at 9 in the morning").
   - User can reply with:
     - Option number: "1", "option 1" → parsed by `parseOptionIndex` (unchanged).
     - Date/time: "cancel the feb 13th 9 am appointment", "the Friday 9 am one" → **matchAppointmentByDateTime** is called with the user message and the list of appointments (each with id, providerName, and **dateTime in organization timezone**). The LLM returns the matching appointment id; that appointment is then used for confirmation/cancel.

2. **Reschedule flow** (choose appointment to reschedule):
   - Same as cancel: list is shown with organization-time date/time; user can say option number or date/time; if option number is not detected, **matchAppointmentByDateTime** is used to resolve by date/time, then reschedule options are fetched for that appointment.

3. **Timezone**:
   - Appointment `start` values from the API (typically UTC or ISO) are converted to **organization local time** using `formatDatesInWordsBatch(starts, orgTz)` (CLINIC_TIMEZONE env). The resulting phrases (e.g. "Friday, February 13th at 9 in the morning") are passed to the LLM so the model matches against the same timezone the user hears.

## API

### LLM: matchAppointmentByDateTime

- **Input**: `userMessage: string`, `appointmentsWithOrgTime: Array<{ id: number; providerName?: string; dateTime: string }>`.
- **dateTime**: Human-readable date/time **in organization timezone** (e.g. from `formatDatesInWordsBatch`).
- **Output**: `Promise<number | null>` – matching appointment id, or null if no match / NONE.

### Prompt (repository)

- **MATCH_APPOINTMENT_SYSTEM**: Instructs the model to match the user message to one appointment by option number or date/time; reply with only the appointment id or NONE.
- **buildMatchAppointmentUserMessage(userMessage, appointmentsWithOrgTime)**: Builds the user message for the LLM listing each appointment as "id X: Provider on dateTime".

## Request / Response (Success and Failure)

- **Success**: User says "cancel the feb 13th 9 am appointment" → LLM returns the id of that appointment → cancel flow sets `selected_appointment_id` and proceeds to "Are you sure?" (or reschedule flow fetches new slots).
- **No match**: User says something ambiguous or no appointment matches → LLM returns NONE → flow keeps current state and re-prompts: "Which appointment would you like to cancel? Say the option number, or say no to go back." (or reschedule equivalent).
- **Option number still supported**: "1", "option 2" still work via `parseOptionIndex`; the matcher is only used when option index parsing does not yield a selection.

## Files Touched

- `src/prompts/repository.ts` – MATCH_APPOINTMENT_SYSTEM, buildMatchAppointmentUserMessage.
- `src/graph/llm.ts` – matchAppointmentByDateTime (and parsing for id vs 1-based index).
- `src/graph/nodes/cancelFlow.ts` – When no option index match, build appointments with organization TZ phrases and call matchAppointmentByDateTime; use matched id if returned.
- `src/graph/nodes/rescheduleFlow.ts` – Same for reschedule (choose which appointment to reschedule).

## Failure / Edge Cases

- **LLM unavailable**: Same as other LLM calls; flow can fail or retry per existing error handling.
- **Ambiguous date**: Model may return NONE; user is re-prompted to use option number or clearer date/time.
- **Organization timezone**: CLINIC_TIMEZONE (or default UTC) is used so all dates sent to the LLM are in organization local time; user phrasing (e.g. "9 am") is interpreted in that context.
