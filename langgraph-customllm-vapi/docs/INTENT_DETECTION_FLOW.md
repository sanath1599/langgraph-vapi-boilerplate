# Intent Detection and Flow Routing

## Does each message go through intent detection?

**Short answer:** Every user message (after the first turn) goes through **detect_intent** first, except when we're in **confirm_identity** (name/DOB) or **verify_flow**. Whether we **continue the current flow** or **start a new flow** depends on the flow type and the in-flow intent check.

### Request path (per user message)

1. **entryRouter** (graph start)
   - First turn (`iteration_count === 1`) → **normalize** (no intent).
   - Step is `ask_are_you_name` or `ask_dob` → **confirm_identity** (no intent).
   - In verify-user flow (`current_flow === "verify_user"` and `verify_step`) → **verify_flow** (no intent).
   - Otherwise → **detect_intent**.

2. **detect_intent** runs
   - Calls `detectIntentWithLLM(messages, context)` and sets `current_intent`, `previous_intent`, etc.

3. **intentRouter** (after detect_intent)
   - **Mid-flow routing (every flow re-checks intent):**
     - `current_flow === "registration"` and `flow_data?.step` → **in_flow_intent_check** (re-run intent on message).
     - `current_flow === "booking"` and `flow_data?.step` → **in_flow_intent_check** (re-run intent on message).
     - `current_flow === "reschedule"` and `flow_data?.step` → **in_flow_intent_check** (re-run intent on message).
     - `current_flow === "cancel"` and `flow_data?.step` → **in_flow_intent_check** (re-run intent on message).
   - **New intent routing:** If not mid-flow, routes by `current_intent` (e.g. book → book_flow, cancel → cancel_flow, …).

### Summary by flow

| Flow            | Each message through detect_intent? | Re-check intent in flow? | Continue vs new flow |
|-----------------|--------------------------------------|---------------------------|----------------------|
| First turn      | No                                   | —                         | Greet only           |
| Confirm identity| No                                   | —                         | By confirm_identity  |
| Verify user  | No                                   | —                         | By verify_flow       |
| **Registration**| Yes (then router)                    | **Yes** (in_flow_intent_check) | Intent re-run on message; can continue or switch (e.g. cancel, book) |
| **Booking**     | Yes (then router)                    | **Yes** (in_flow_intent_check) | Intent re-run on message; can continue or switch (e.g. cancel, get_appointments) |
| **Reschedule**  | Yes (then router)                    | **Yes** (in_flow_intent_check) | Intent re-run on message; can continue or switch (e.g. cancel instead) |
| **Cancel**      | Yes (then router)                    | **Yes** (in_flow_intent_check) | Same as reschedule |

So:

- **Every flow (registration, booking, reschedule, cancel):** Each message goes through **detect_intent** and then, when mid-flow, through **in_flow_intent_check**. We re-run intent on the message and decide whether to **continue** the current flow (e.g. “option 2”, “yes”) or **switch** (e.g. “cancel”, “can I see my appointments”). The user can always exit or change intent.

## Conversation context for date/time parsing

For **book** and **reschedule**, when the user says only a time (e.g. “10 am”, “let’s do 10 am”), we pass the **last assistant message** as `conversationContext` to `parseDateTime` so the model resolves “10 am” to the date the assistant just offered (e.g. “On February 5th we have 10am, 1pm” → “10 am” = Feb 5th 10am).

- **bookFlow:** Passes `lastAssistant` into `parseDateTime(lastUser, { timezoneIana, conversationContext: lastAssistant })`.
- **rescheduleFlow:** Passes `lastAssistant` into `parseDateTime` and `parseUserMentionedTimeToClosestSlot` via `parseDateTimeContext`.
- **get_appointments_flow:** Does not use `parseDateTime` (only lists appointments); no context change.

## Files

- Graph routing: `src/graph/graph.ts` (entryRouter, intentRouter, in_flow_intent_check edges).
- Intent node: `src/graph/nodes/detectIntent.ts`.
- In-flow intent (reschedule/cancel): `src/graph/nodes/inFlowIntentCheck.ts`.
- Date/time context: `src/graph/parseDateTime.ts` (options.conversationContext), `src/graph/nodes/bookFlow.ts`, `src/graph/nodes/rescheduleFlow.ts`.
