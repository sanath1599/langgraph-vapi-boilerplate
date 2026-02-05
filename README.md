# Appointment Booking Boilerplate

<p align="center">
  <img src="assets/vapi-langgraph-banner.png" alt="VAPI x LangGraph - Unlocking Language. Empowering Voice." width="720" />
</p>

Generic appointment booking system with a conversational LLM-based scheduling assistant. Includes backend API, frontend UI, and custom LLM server with LangGraph flows for booking, rescheduling, canceling, registration, and user verification.

---

## Conversational Flow

The custom LLM server (`langgraph-customllm-vapi`) runs a LangGraph with the following intents, confirmations, verifications, and questions at each flow.

### Intent Labels (from `detectIntent`)

| Intent | Description | Next node |
|--------|-------------|-----------|
| `no_request` | User says they're done (e.g. "no", "nothing else", "goodbye") | thanks_end |
| `emergency` | User mentions emergency / 911 | advise_911 |
| `invalid_business` | Not organization business (wrong number, sales) | polite_rejection |
| `unsupported` | Request we can't handle | transfer |
| `frustration` | User is frustrated | transfer |
| `org_info` | Hours, location, general organization info | org_info |
| `register` | New user registration | register_flow |
| `book` | Book appointment (if user known → book_flow; else → verify_flow) | book_flow / verify_flow |
| `reschedule` | Change existing appointment | reschedule_flow / verify_flow |
| `cancel` | Cancel appointment | cancel_flow / verify_flow |

---

### High-Level Mermaid: Graph Structure

```mermaid
flowchart TB
    START --> entryRouter
    entryRouter -->|iter=1| normalize
    entryRouter -->|ask_are_you_name / ask_dob| confirm_identity
    entryRouter -->|verify_user + verify_step| verify_flow
    entryRouter -->|default| detect_intent

    normalize --> lookup
    lookup -->|user found| greet_personalized
    lookup -->|no user| greet_general
    greet_personalized --> END
    greet_general --> mention_services
    mention_services -->|iter=1| END
    mention_services -->|iter>1| detect_intent

    confirm_identity --> routeAfterConfirm
    routeAfterConfirm -->|offer=yes| register_flow
    routeAfterConfirm -->|offer=no| transfer
    routeAfterConfirm -->|identity_failed| identity_failed_end
    routeAfterConfirm -->|else| END
    identity_failed_end --> END

    detect_intent --> intentRouter
    intentRouter -->|no_request| thanks_end
    intentRouter -->|emergency| advise_911
    intentRouter -->|invalid_business| polite_rejection
    intentRouter -->|unsupported/frustration| transfer
    intentRouter -->|org_info| org_info
    intentRouter -->|register| register_flow
    intentRouter -->|book/reschedule/cancel + user| book_flow
    intentRouter -->|book/reschedule/cancel, no user| verify_flow
    thanks_end --> END
    advise_911 --> END
    polite_rejection --> END
    transfer --> END
    org_info --> END
    register_flow --> END
    book_flow --> END
    reschedule_flow --> END
    cancel_flow --> END

    verify_flow --> verifyFlowRouter
    verifyFlowRouter -->|register| register_flow
    verifyFlowRouter -->|transfer| transfer
    verifyFlowRouter -->|book_flow| book_flow
    verifyFlowRouter -->|reschedule_flow| reschedule_flow
    verifyFlowRouter -->|cancel_flow| cancel_flow
    verifyFlowRouter -->|end| END
```

---

### Detailed Mermaid: Intents, Confirmations, Verifications & Questions by Flow

The following diagrams break down each flow with its intents, confirmations, verifications, and key questions.

#### 1. Entry & Greeting

```mermaid
flowchart TB
    A[normalize: caller ID] --> B[lookup: by phone]
    B --> C{User found?}
    C -->|Yes| D["greet_personalized<br/>Q: Hello name, thank you for calling. This is your scheduling assistant.<br/>Please confirm your date of birth to continue."]
    C -->|No| E["greet_general<br/>Q: Thank you for calling. This is your scheduling assistant.<br/>How may I help you today?"]
    E --> F["mention_services<br/>Q: How may I help you today - would you like to book an appointment,<br/>reschedule, cancel, or register?"]
```

#### 2. Confirm Identity (caller ID found)

```mermaid
flowchart TB
    G["Step: ask_are_you_name"]
    G --> H{User says yes?}
    H -->|Yes| I["Q: To confirm, may I have your date of birth? step: ask_dob"]
    H -->|No / DOB in message| J[Verify DOB with LLM]
    J -->|Match| K["CONFIRM_THEN_SERVICES: Thanks for confirming. How would you like to proceed - book, reschedule, cancel?"]
    J -->|No match| L["DOB_VERIFY_FAIL_TRANSFER - offer register/transfer"]
    I --> M[Verify DOB with LLM]
    M -->|Match| K
    M -->|No match| L
```

#### 3. Verify User (no caller ID match)

```mermaid
flowchart TB
    V1["Q: Are you already registered with us, or is this your first time calling?"]
    V1 --> V2{First time?}
    V2 -->|Yes| V_REG[register_flow]
    V2 -->|Returning| V3["Q: May I have your name please?"]
    V3 --> V4[Search by name]
    V4 -->|Found| V5["Q: To confirm, may I have your date of birth?"]
    V4 -->|Not found, attempts less than 2| V6["Q: I could not find that name. Could you please spell your last name?"]
    V6 --> V7["That's letters, correct?"]
    V7 --> V4
    V4 -->|Not found, attempts 2 or more| V8["Q: I can't find an existing record. Would you like to register as a new user?"]
    V5 --> V9[Verify DOB with LLM]
    V9 -->|Match| V_OK[Confirm then services]
    V9 -->|No match| V10["DOB_MISMATCH_TRY_PHONE + Q: What's your phone number?"]
    V10 --> V11[Lookup by phone]
    V11 -->|Found| V_OK
    V11 -->|Not found| V8
    V8 -->|Yes| V_REG
    V8 -->|No| V_TR["TRANSFER_LOCATE_RECORD"]
```

#### 4. Register Flow

```mermaid
flowchart TB
    R1["Organization check: getBookingRules"]
    R1 --> R2{Accepting?}
    R2 -->|No| R3["Q: We're not accepting new registrations. Would you like me to add you to our waitlist?"]
    R2 -->|Yes| R4["REGISTER_INTRO + Q: What is your full legal name?"]
    R4 --> R5["Thanks, name. Q: What is your date of birth?"]
    R5 --> R6["Got it, dob. Q: What is your gender?"]
    R6 --> R7["Thanks. Q: What's the best phone number to reach you? Or: The number we have is phone. Is that the best number to reach you?"]
    R7 --> R8["Thanks. Q: And your email address? optional"]
    R8 --> R9["confirmRegistrationCollected: Name, DOB, Gender, Phone, Email. Q: Is everything correct?"]
    R9 --> R10{User: yes / correct?}
    R10 -->|Yes| R11[createUser - REGISTER_SUCCESS]
    R10 -->|Correction| R9
    R10 -->|No| R_TR[Transfer to staff]
```

#### 5. Book Flow

```mermaid
flowchart TB
    B1{User ID?}
    B1 -->|No| B_LOOKUP["I need to look you up first..."]
    B1 -->|Yes| B2[getAvailability]
    B2 --> B3["Single slot: I have dateWords. Is that the one you'd like to book? Multiple: list slots + Which slot? Say number or date/time"]
    B3 --> B4[User picks slot - confirm]
    B4 --> B5["I have dateWords. Is that the one you'd like to book?"]
    B5 --> B6{User: yes/confirm/book?}
    B6 -->|Yes| B7[createAppointment - success + BOOK_INSTRUCTIONS_BC_CARD]
```

#### 6. Reschedule Flow

```mermaid
flowchart TB
    RS1[listAppointments]
    RS1 --> RS2["FIND_UPCOMING + list options. Q: Which one would you like to reschedule? Say the option number."]
    RS2 --> RS3[User picks option - getRescheduleOptions]
    RS3 --> RS4["New times: slots. Which slot? Say number or date/time"]
    RS4 --> RS5[User picks slot]
    RS5 --> RS6["Got it, dateWords. Confirm to reschedule?"]
    RS6 --> RS7{User: yes/confirm?}
    RS7 -->|Yes| RS8["rescheduleAppointment - Your appointment has been rescheduled. Anything else?"]
```

#### 7. Cancel Flow

```mermaid
flowchart TB
    C1[getCancelOptions]
    C1 --> C2["Your upcoming appointments: Option 1, Option 2, etc. Q: Which one would you like to cancel? Say the option number."]
    C2 --> C3[User picks option]
    C3 --> C4["Q: Are you sure you'd like to cancel?"]
    C4 --> C5{User: yes/confirm?}
    C5 -->|Yes| C6[cancelAppointment - CANCEL_DONE]
```

#### 8. End / Single-shot nodes

```mermaid
flowchart LR
    THANKS["thanks_end: Thank you for calling. Have a wonderful day."]
    ADVISE["advise_911: This sounds like a medical emergency. Please hang up and call 911."]
    REJECT["polite_rejection: This line is for appointments only. Goodbye."]
    TRANSFER["transfer: Let me transfer you to our staff. One moment please."]
    CLINIC["org_info: Our hours are hours. Is there anything else?"]
    IDENTITY_END["identity_failed_end: The data in our systems doesn't match. Goodbye."]
```

**Note:** In diagrams 2 and 3, outcomes like "Confirm then services" and "register_flow" connect to the Book/Reschedule/Cancel flows or Register Flow respectively.

---

### Flow Steps Summary

| Flow | Steps | Key questions / confirmations |
|------|--------|-------------------------------|
| **Confirm Identity** | `ask_are_you_name` → `ask_dob` | "Please confirm your date of birth" / "To confirm, may I have your date of birth?"; on DOB fail → DOB_VERIFY_FAIL_TRANSFER → register or transfer |
| **Verify User** | `ask_current_or_first` → `ask_name` → `ask_spell_last` → `confirm_spelling` → `ask_dob` → `ask_phone` → `offer_register_or_transfer` | "Are you already registered or first time calling?"; "May I have your name?"; "Spell your last name"; "That's {letters}, correct?"; "To confirm, may I have your date of birth?"; "What's your phone number?"; "Would you like to register?" |
| **Register** | org_check → (offer_waitlist) → name → dob → gender → phone → email → confirm_all → create | Full name, DOB, gender, phone, email (optional); "Is that the best number to reach you?"; "Is everything correct?"; corrections supported at confirm_all |
| **Book** | check → get availability → offer slots / single slot → user choice → confirm slot → create | "Which slot would you like? Say number or date/time"; "I have {dateWords}. Is that the one you'd like to book?"; success + BC card / fasting / phone instructions |
| **Reschedule** | list appointments → choose → get new slots → choose slot → confirm | "Which one would you like to reschedule?"; "Which slot?"; "Got it, {dateWords}. Confirm to reschedule?" |
| **Cancel** | list cancel options → choose → confirm | "Which one would you like to cancel?"; "Are you sure you'd like to cancel?" |

---

## Visualizing the graph in LangGraph Studio

You can visualize and debug the appointment LangGraph in [LangGraph Studio](https://docs.langchain.com/langsmith/studio) (LangSmith) by running the LangGraph dev server and connecting the cloud Studio UI to it.

### Prerequisites

- [LangSmith](https://smith.langchain.com/) account (free).
- `LANGSMITH_API_KEY` in `langgraph-customllm-vapi/.env` (create from [LangSmith API keys](https://smith.langchain.com/settings)).

### Steps

1. **Install dependencies** (including the LangGraph CLI). Use the version in `package.json` (`^1.0.0`); do **not** pin `@langchain/langgraph-cli@^0.2.0` (that version does not exist):

   ```bash
   cd langgraph-customllm-vapi
   npm install
   ```

2. **Start the LangGraph dev server** (no build needed; the graph is loaded from `./src/graph/graph.ts` so Studio can extract the schema):

   ```bash
   npx @langchain/langgraph-cli dev
   ```

   Or use the shortcut:

   ```bash
   npm run studio
   ```

3. **Open Studio**  
   The CLI prints a Studio URL, for example:

   ```text
   Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
   ```

   Open that URL in your browser. The graph **appointment** will appear; you can inspect nodes, run the graph, and view state.

4. **Custom host/port**    
   If the server runs elsewhere (e.g. `http://localhost:3000`), use:

   ```text
   https://smith.langchain.com/studio/?baseUrl=http://localhost:3000
   ```

5. **Safari**  
   If you have issues on Safari, start the server with a tunnel:

   ```bash
   npx @langchain/langgraph-cli dev --tunnel
   ```

### Configuration

- **langgraph.json** in `langgraph-customllm-vapi/` points the **appointment** graph to `./src/graph/graph.ts:compileGraph` so the schema extractor gets a proper TypeScript AST (using `dist/graph/graph.js` can cause "Failed to extract schema" with some TypeScript/parser versions).
- The dev server runs the [Agent Server API](https://docs.langchain.com/oss/javascript/langgraph/local-server) on port **2024** by default; Studio talks to this API to visualize and run the graph.

### Notes

- The appointment graph uses **custom state** (not only `MessagesState`), so use **Graph mode** in Studio for full visualization and state inspection.
- Ensure the backend API (and any Azure/LLM env vars) are set in `.env` if you run the graph from Studio; the graph calls your API and LLM services.

### Troubleshooting

- **"No matching version found for @langchain/langgraph-cli@^0.2.0"**  
  That version does not exist. Use the version in `package.json` (e.g. `^1.0.0`). Run `npm install` from `langgraph-customllm-vapi/` so the lockfile uses the correct version.

- **"Failed to extract schema for appointment"** (with `getSymbolLinks` / `reading 'flags'`)  
  The schema extractor parses the graph file with TypeScript; pointing at compiled `.js` can trigger this. `langgraph.json` is set to `./src/graph/graph.ts:compileGraph` so the parser gets a proper AST. If you still see the error, try: (1) ensure you are not pointing at `dist/graph/graph.js`; (2) if you must use the built file, change to `./dist/graph/graph.js:compileGraph`, run `npm run build` first, and accept that schema visualization may fail in Studio (the graph can still run).

---

## Project structure

- **backend** – Appointment API (Express, Prisma): users, organizations, appointments, availability, caller ID, providers.
- **frontend** – React + Vite UI for managing organizations, providers, users, appointments, availability, caller ID, and chatbot.
- **langgraph-customllm-vapi** – LangGraph-based scheduling assistant: normalize → lookup → greet → (confirm identity or mention services) → detect intent → verify / register / book / reschedule / cancel / org_info / thanks / advise_911 / polite_rejection / transfer.

---

## Running the project

1. **Backend**: From `backend/`, copy `example.env` to `.env`, set `DEFAULT_ADMIN_USERNAME` and `DEFAULT_ADMIN_PASSWORD` (used by seed and login). Run `npm install`, `npx prisma migrate dev`, `npm run seed`, then `npm run dev`.
2. **Frontend**: From `frontend/`, run `npm install` and `npm run dev`. The app uses `VITE_API_BASE=/api` so API calls are proxied to the backend; frontend routes (e.g. `/appointments`) are not proxied, so reload works. Ensure the backend is running on port 4000. Open the app and sign in with the default admin credentials (see Admin UI below).
3. **Custom LLM server**: From `langgraph-customllm-vapi/`, copy `.env.example` to `.env`, set Azure OpenAI (or LLM), API base URL, and optionally `APPOINTMENT_API_KEY` (when backend `REQUIRE_API_KEY=true`), then run with `npm run dev` or `yarn dev`.

Refer to each package’s `package.json` and env files for scripts and required variables.

---

## Admin UI and authentication

The frontend is an **admin dashboard** (ShadCN UI, light/dark theme) protected by username/password login.

- **Login**: Default credentials come from backend env: `DEFAULT_ADMIN_USERNAME` and `DEFAULT_ADMIN_PASSWORD` (e.g. `admin` / `admin123` from `example.env`). The seed script creates this admin user.
- **Pages**: Dashboard, Users (with "View appointments" per user), Organizations, Appointments (date range: default today to today+7), API Keys (create/list), and Chat (scheduling assistant).
- **API key auth**: Public routes (caller-id, users, organizations, providers, availability, appointments) can require an `x-api-key` header. Set `REQUIRE_API_KEY=false` in backend `.env` for local dev without a key; set `true` in production and create keys via Admin → API Keys. The custom LLM reads `APPOINTMENT_API_KEY` (or `MOCK_API_KEY`) from its env and sends it as `x-api-key` when calling the backend.

See [backend/docs/API.md](backend/docs/API.md) for admin login, admin endpoints, and API key request/response details.
