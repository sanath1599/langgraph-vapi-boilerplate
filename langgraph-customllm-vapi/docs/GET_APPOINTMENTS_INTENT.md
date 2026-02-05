# Get Appointments Intent and Flow

## Overview

The assistant recognizes when the user asks to see their upcoming appointments (e.g. "what are my appointments?", "do I have any appointments?", "when is my next appointment?", "list my appointments") and routes to a **get_appointments** flow that lists upcoming appointments and then asks "Is there anything else?".

## Intent

- **Label**: `get_appointments`
- **Classifier rule** (in `src/prompts/repository.ts`): User wants to know their upcoming appointments. Examples: "what are my appointments?", "do I have any appointments?", "when is my next appointment?", "list my appointments".

## Behavior

1. **Routing**
   - If the user is already known (by caller ID or verified): route to **get_appointments_flow**.
   - If the user is not known: route to **verify_flow** first; after verification, route to **get_appointments_flow** (via `verify_next: "get_appointments_flow"`).

2. **get_appointments_flow**
   - If no `user_id`: responds with "I need to look you up first. Are you calling from your registered phone number?" and ends (next turn will re-detect intent; caller should verify first).
   - Otherwise: calls `listAppointments({ userId, status: "upcoming" })`, formats each appointment with provider and date/time in words, and responds with:
     - **Has appointments**: "Here are your upcoming appointments: 1. [Provider] on [date/time]. 2. … Is there anything else I can help you with?"
     - **No appointments**: "You have no upcoming appointments. Is there anything else I can help you with?"
   - On API error: retries once with TOOL_RETRY, then TRANSFER_STAFF.

3. **In-flow intent check**
   - When the user is in reschedule or cancel flow and says something like "just list my appointments", the in-flow intent check can detect `get_appointments` and route to **get_appointments_flow** (or **verify_flow** if no user).

## API

- **Backend**: Uses existing `GET /appointments?userId=&status=upcoming` (via `listAppointments` in `apiClient.ts`).
- **Request**: No new HTTP endpoint; same graph invocation as other intents.
- **Response**: Same graph response shape; `assistantResponse` contains the listed appointments text or error/transfer message.

## State

- **verify_next**: Extended to include `"get_appointments_flow"` so that after verify_flow we can route to get_appointments_flow when the original intent was get_appointments.
- **pending_intent_after_verify**: verifyUser maps `get_appointments` intent to `get_appointments_flow` in its nextMap.

## Files Touched

- `src/prompts/repository.ts` – Added `get_appointments` to INTENT_LABELS and classifier rule.
- `src/prompts/verbiage.ts` – Added YOUR_UPCOMING_APPOINTMENTS, NO_UPCOMING_APPOINTMENTS.
- `src/graph/nodes/detectIntent.ts` – Added case `get_appointments` → `get_appointments_flow`.
- `src/graph/nodes/getAppointmentsFlow.ts` – New node (list appointments, then anything else).
- `src/graph/nodes/inFlowIntentCheck.ts` – Added handling for `get_appointments` (route to get_appointments_flow or verify_flow).
- `src/graph/nodes/verifyUser.ts` – Added get_appointments_flow to nextMap for verify.
- `src/graph/state.ts` – Extended verify_next type with get_appointments_flow.
- `src/graph/graph.ts` – Added get_appointments_flow node, intent map, verify router, edges.

## Failure / Edge Cases

- **No user**: User is prompted to verify (call from registered number or go through verify_flow).
- **listAppointments fails**: First failure → TOOL_RETRY; second → TRANSFER_STAFF.
- **Empty list**: Message is "You have no upcoming appointments." plus anything else.
