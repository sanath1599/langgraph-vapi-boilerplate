# In-Flow Intent Parsing (All Flows)

## Overview

During **any** flow (booking, registration, reschedule, cancel), when the user is mid-flow (e.g. picking slots, confirming, giving DOB), the last user message is re-parsed with OpenAI intent detection. If the message is part of the current flow (e.g. "option 2", "yes", "February 5 at 3pm"), the flow continues. If the user changes intent (e.g. "cancel", "can I see my appointments" while in booking), the graph updates intent and routes to the new flow so the user can always exit or switch.

## Behavior

- **When it runs**: After `detect_intent`, when `current_flow` is `booking`, `registration`, `reschedule`, or `cancel` and `flow_data.step` is set. The graph routes to `in_flow_intent_check` instead of directly to the flow node.
- **Intent check**: `detectIntentWithLLM(messages, { currentStep: "reschedule_choose" | "reschedule_offer_slots" | "reschedule_confirm" | "cancel_choose" | "cancel_confirm", previousIntent: "reschedule" | "cancel" })` is called.
- **Continue current flow**: If the detected intent is the same as the current flow (`reschedule` or `cancel`) or `unsupported` (treated as in-flow reply like slot numbers or "yes"), the graph routes to `reschedule_flow` or `cancel_flow` and the flow continues.
- **Change flow**: If the detected intent is a different flow (e.g. `cancel` while in reschedule, `reschedule` while in cancel, or `book`), state is updated (`current_intent`, `current_flow`, and `flow_data` where needed) and the graph routes to the new flow (`cancel_flow`, `reschedule_flow`, `book_flow`, or `verify_flow` for book when no user).
- **Other intents**: `no_request` → `thanks_end`, `emergency` → `advise_911`, `invalid_business` → `polite_rejection`, `org_info` → `org_info`, `register` → `register_flow`, `unsupported`/`frustration` → `transfer`.

## Implementation

### Graph

- **Node**: `in_flow_intent_check` (`src/graph/nodes/inFlowIntentCheck.ts`).
- **Router**: When `current_flow` is `reschedule` or `cancel` and `flow_data?.step` is set, `intentRouter` returns `"in_flow_intent_check"` instead of `"reschedule_flow"` / `"cancel_flow"`.
- **After the node**: `inFlowNextRouter` reads `metadata.state.in_flow_next_route` and routes to the corresponding node (`reschedule_flow`, `cancel_flow`, `book_flow`, `verify_flow`, `thanks_end`, `advise_911`, `polite_rejection`, `transfer`, `org_info`, `register_flow`).

### State

- **New field**: `CallStateInner.in_flow_next_route: string | null`. Set by `inFlowIntentCheck` to the next node name; read by `inFlowNextRouter`.

### Intent classifier prompt

In `src/prompts/repository.ts` (`getIntentClassifierSystem`), a rule was added:

- When `current_step` indicates reschedule or cancel flow (e.g. `reschedule_choose`, `reschedule_offer_slots`, `reschedule_confirm`, `cancel_choose`, `cancel_confirm`), treat option/slot numbers ("1", "2", "option 2"), "yes"/"confirm"/"sure", and date/time phrases as continuing that flow (reply `reschedule` or `cancel` to match). Use a different intent only if the user clearly asks to change (e.g. "actually I want to cancel instead", "never mind, cancel it").

## API / Request–Response

This feature is internal to the LangGraph flow. There is no new HTTP API.

- **Input**: Same as the existing graph invocation (messages, metadata with `current_flow`, `flow_data`, etc.).
- **Output**: Same as the existing graph (updated state with `in_flow_next_route`, and possibly updated `current_intent`, `current_flow`, `flow_data` when switching).

## Failure / Edge Cases

- **LLM unavailable**: Same as other LLM-based nodes; the graph may fail or fall back depending on error handling.
- **Ambiguous user message**: The classifier may return `unsupported`; we treat that as "continue current flow" so reschedule/cancel continues.
- **Switching to cancel/reschedule**: `_cancellable_appointments` and `selected_appointment_id` are preserved so the target flow can use them.

## Files Touched

- `src/graph/state.ts` – added `in_flow_next_route`.
- `src/graph/nodes/inFlowIntentCheck.ts` – new node.
- `src/graph/graph.ts` – route reschedule/cancel to `in_flow_intent_check`, add node and `inFlowNextRouter`, conditional edges from `in_flow_intent_check`.
- `src/prompts/repository.ts` – in-flow context rule for intent classifier.
