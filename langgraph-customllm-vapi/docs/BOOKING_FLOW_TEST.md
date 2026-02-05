# Booking Flow Test Scripts

## Overview

Two test scripts run the booking flow end-to-end by invoking the LangGraph directly (no HTTP), using seed user **Sanath Mulky** (phone `+14086221882`, DOB **15th March 99** / 1999-03-15).

- **`test-booking-flow.ts`** – Full flow: greet → DOB → book → choose by option number → confirm.
- **`test-booking-specific-slot.ts`** – Asserts that when the user requests a specific slot (e.g. *"6th February 1:30 am"*), the assistant **confirms that one slot** from the existing list (e.g. *"I have … Is that the one you'd like to book?"*) instead of refetching and listing slots for another day.

## Prerequisites

1. **Backend (Appointment API) running**  
   From repo root: `cd backend && npm run dev`  
   Default URL: `http://localhost:4000` (override with `MOCK_API_BASE_URL`).

2. **Environment**  
   - `.env` in `custom-llm-mock-server` with Azure OpenAI and `CLINIC_TIMEZONE` (e.g. `America/New_York`).
   - Backend should be seeded so user with phone `+14086221882` exists and availability slots exist.

## Usage

From `custom-llm-mock-server`:

```bash
npm run test:booking
npm run test:booking:specific-slot
```

Or with tsx:

```bash
npx tsx scripts/test-booking-flow.ts
npx tsx scripts/test-booking-specific-slot.ts
```

## What it does

1. Checks that the backend is reachable (GET `/availability?organizationId=1`). Exits with a clear error if not.
2. Creates initial call state with caller phone `+14086221882` and message `"Hello"`.
3. Invokes the graph for each turn, then builds the next state by appending the assistant reply and the next user message and incrementing `iteration_count`.
4. Turn sequence:
   - **Turn 1:** "Hello" → greeting + ask to confirm DOB
   - **Turn 2:** "Yes" → ask for DOB
   - **Turn 3:** "March 15 1999" → identity confirmed, offer book/reschedule/cancel/register
   - **Turn 4:** "I'd like to book an appointment" → fetch availability, list slots
   - **Turn 5:** "option 1" → confirm chosen slot (refetch + confirm wording)
   - **Turn 6:** "yes" → create appointment, success message

5. Prints each user message and assistant response; optionally checks that the response contains expected phrases (warns if not).

## Fixing errors

- **Backend not reachable:** Start the backend and ensure `MOCK_API_BASE_URL` matches.
- **Missing Azure OpenAI / env:** Ensure `.env` has the required keys (see `.env.example`).
- **Graph or runtime errors:** Stack traces are printed; fix the reported file/line (e.g. in `bookFlow`, `confirmIdentity`, or graph routing).

## Optional: run with backend from monorepo root

From repo root (with backend and env set up):

```bash
cd backend && npm run dev &
cd custom-llm-mock-server && npm run test:booking
```
