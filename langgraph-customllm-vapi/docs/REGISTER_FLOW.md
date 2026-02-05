# Register User Flow

## Overview

The register (new user) flow collects required information one field at a time, confirms each step, keeps state in `metadata.state.registration_data`, then shows a final confirmation. When the user confirms, the user is created via the API.

**Flow steps:** `name` → `dob` → `gender` → `phone` → `email` → `confirm_all` → (create user on "yes").

- No JSON is ever returned to the user; all replies are natural-language confirmations and next questions.
- State is stored in `metadata.state.flow_data.step` and `metadata.state.registration_data` (firstName, lastName, dob, gender, phone, email optional).

### System prompt base (PrimaryRules)

All registration-related LLM calls (analyzer, name extraction, DOB words, correction intent, confirm yes/no) use a **system prompt base** derived from **PrimaryRules** (`docs/PrimaryRules`). This base (`AGENTIC_FLOW_SYSTEM_BASE` in `src/prompts/repository.ts`) encodes:

- Golden Rules (one question at a time, confirm before action, stay in language, keep it human).
- New user registration: one item at a time, confirm each; full legal name; DOB in words when confirming; gender male/female/other; phone E.164, confirm by reading back; email optional; full summary then "Is everything correct?" before registering.
- Name spelling: when unclear, ask to spell and confirm letter by letter.
- Corrections: when user wants to correct something, transfer to staff (do not re-verify in flow).
- Transfer triggers: human requested, frustration, medical/billing, registration error, correction handoff.

Using this base keeps the agentic flow aligned with booking policy.

### Agentic flow: AI response analysis

Each user response is analyzed by **OpenAI** for accuracy before the system accepts and continues:

- **Analyzer:** `analyzeRegistrationResponse(step, questionAsked, userResponse, collectedSoFar)` returns `{ valid, action, clarificationMessage? }` where `action` is `"accept"` | `"clarify"` | `"reask"`.
- **Accept:** Response is accurate and acceptable → store (using existing parsers) and move to next step.
- **Clarify:** Response is partly right but ambiguous → reply with `clarificationMessage` and stay on the same step.
- **Reask:** Response is wrong, off-topic, or empty → reply with `clarificationMessage` (or default re-ask) and stay on the same step.

This applies to steps: **name**, **dob**, **gender**, **phone** (including phone confirmation), **email**, and **confirm_all** (unclear "no" can trigger a clarification before transferring).

## Entry and context retention

- User says they want to register (first visit / new user).
- Graph routes to `register_flow` with intent `register`.
- **Mid-flow context:** While `metadata.state.current_flow === "registration"` and `flow_data.step` is set, the graph **routes directly to `register_flow`** (before intent classification). So in-flow replies like "15th march 1999", "male", or "yes" are handled by the registration flow and do not get re-classified as "unsupported" → transfer.
- If organization is not accepting new registrations: offer waitlist (yes/no).
- If organization is accepting: send intro + ask for full legal name (`REGISTER_INTRO` + `REGISTER_FULL_NAME`), set `flow_data.step` to `"name"` and initialize `registration_data: {}`.

## Step-by-step

| Step         | Assistant asks / does | User provides | Stored in `registration_data` | Next step   |
|-------------|------------------------|---------------|--------------------------------|-------------|
| `name`      | Full legal name        | e.g. "Sanath swaroop Mulky" | firstName, lastName (parsed: last token = lastName) | `dob`       |
| `dob`       | Date of birth          | e.g. "March 15 1999"        | dob (YYYY-MM-DD via LLM parse) | `gender`    |
| `gender`    | Gender for medical record | e.g. "male"              | gender                         | `phone`     |
| `phone`     | Best phone number      | e.g. "408-622-1882"         | phone (10 digits normalized)  | `email`     |
| `email`     | Email (optional)       | address or "skip" / "no"    | email or omit                  | `confirm_all` |
| `confirm_all` | Full summary + "Is everything correct?" | "yes" / "no" | — | Create user (yes) or transfer (no) |

### Name parsing

- Full name is split on spaces; **last token = lastName**, rest = firstName.
- Example: "Sanath swaroop Mulky" → firstName "Sanath swaroop", lastName "Mulky".

### DOB parsing

- Uses `parseUtteredDobToYYYYMMDD` (LLM) to get YYYY-MM-DD. If invalid, assistant re-asks for date of birth.

### Gender (male / female / other with auto-correction)

- User input is normalized to exactly one of **male**, **female**, or **other** for storage and API.
- **OpenAI auto-correction** handles transcription/speech-recognition errors: e.g. "mail" → male, "femail" / "femal" → female, "man"/"woman" → male/female. If the simple regex (male, man, m / female, woman, f) doesn't match, the LLM maps the reply to male, female, or other so variations and typos are accepted.

### Date of birth (read out in words when confirming)

- After the user gives DOB, the assistant confirms with the date **in words** (e.g. "Got it, March 15th, 1999. For your medical record, what is your gender?").
- The final confirmation summary also shows DOB in words (e.g. "Date of birth: March 15th, 1999").

### Name (OpenAI extraction)

- If the user says something like "it is sanath" or "it would be Sanath Mulky", **OpenAI extracts only the name** (e.g. "Sanath Mulky") and that is stored; filler phrases are not stored.

### Correction during confirmation (in-flow)

- During **confirm_all** (when the user is shown the full summary and asked "Is everything correct?"), the system **prioritizes correction detection**:
  1. **First**, checks if user explicitly confirmed (yes/affirmative).
  2. **If not confirmed**, uses OpenAI to parse the response for corrections **before** checking for clarification or transfer. This ensures corrections are detected even when users are just providing information (e.g. "my email id is sanath at gmail dot come").
  3. If a correction is detected, the system:
     - Parses which **field** they are correcting and the **new value** (OpenAI).
     - Updates **registration_data** with the corrected value (with the same normalization used when collecting: name → extract + parse, DOB → YYYY-MM-DD, gender → male/female/other, phone → E.164, email → OpenAI parse to standard format).
     - Re-shows the **confirmation summary** with the updated info and asks "Is everything correct?" again.
  4. **If no correction detected**, checks if user confirmed via LLM analysis (handles natural language confirmations).
  5. **If confirmed** (explicitly or via LLM), calls the register API with the data.
  6. **If not confirmed and no correction**, transfers to staff.
- The correction detection prompt is designed to treat **any field information provided** as a correction, even if the user is just restating or clarifying (e.g. "my email is X" is treated as correcting email, not just restating).

### Phone (E.164 with country code; pre-filled from caller ID)

- Phone is **stored and sent in E.164** (with country code, e.g. `+14086221881`) so lookups (e.g. `getUsersByPhone`) use the same format.
- When moving from **gender** to **phone**, if the system has caller ID (`metadata.state.normalized_phone`), the phone field is **pre-filled** with that E.164 value and the assistant asks: *"The number we have for this call is (XXX) XXX-XXXX. Is that the best number to reach you?"*
- **User says yes** → keep that number (E.164) and go to email.
- **User says no** → clear the pre-fill and ask *"What's the best phone number to reach you?"*; next message is normalized to E.164 via the backend `normalizeCallerId` API (fallback: `+1` + 10 digits for US).
- **User says a different number** → normalize to E.164 via `normalizeCallerId` and go to email.
- If there is no caller ID, the assistant asks for the number; user input is normalized to E.164 via the backend so the stored value includes country code.

### Email (OpenAI parsing to standard format)

- If user says skip (e.g. "no", "skip", "that's fine", "optional"), email is not stored.
- Otherwise the user's reply is **parsed with OpenAI** into a standard email (e.g. "sanath at gmail dot come" → `sanath@gmail.com`). Transcription/typos like "come" → "com" are corrected. The normalized value is stored and shown in the confirmation summary. If parsing fails, the raw trimmed string is used.
- When the user **corrects during confirm_all** (e.g. "no, my email is sanath@gmail.com"), the correction parser identifies the field and new value; the new email is normalized with the same OpenAI parser before updating `registration_data` and re-showing the summary.

### Confirm all

- Assistant says: "Let me confirm your information: - Name: … - Date of birth: … - Gender: … - Phone: … [- Email: …] Is everything correct?"
- **Flow priority:**
  1. **Explicit confirmation** (yes/affirmative) → Call API `createUser`, then success message and clear flow.
  2. **Correction detected** (user provides field information) → Update field, re-show summary, stay on `confirm_all`.
  3. **LLM-confirmed** (natural language confirmation detected) → Call API `createUser`, then success message and clear flow.
  4. **Clarification needed** → Ask for clarification, stay on `confirm_all`.
  5. **No confirmation and no correction** → "No problem. Let me transfer you to our staff who can help make any changes." → set `should_transfer` / `transfer_to_agent` and clear flow.

## API: Create User

Used when user confirms in `confirm_all`.

**Request**

- **Method:** POST  
- **Path:** `/users`  
- **Body (CreateUserBody):**

```json
{
  "firstName": "string",
  "lastName": "string",
  "dob": "YYYY-MM-DD",
  "gender": "string",
  "phone": "string",
  "email": "string (optional)"
}
```

**Response – Success**

- **Status:** 2xx  
- **Body:**

```json
{
  "userId": number,
  "mrn": "string",
  "createdAt": "string (ISO)"
}
```

- **Assistant:** `REGISTER_SUCCESS` — "You're all registered! Welcome. Would you like to book your first appointment now?"
- **State:** `user_id` set, `is_registered: true`, `registration_data: null`, `current_flow: null`, `flow_data: null`.

**Response – Failure**

- **Status:** non-2xx or thrown error.
- **Assistant:** `REGISTER_ERROR_TRANSFER` — "I'm sorry, I wasn't able to complete your registration. Let me transfer you to our staff who can help."
- **State:** `should_transfer: true`, `transfer_to_agent: true`, `last_error` set, `failure_count` incremented; flow cleared.

## Request / Response (conversation)

### Success path (summary)

| Turn | User says | Assistant |
|------|-----------|-----------|
| 1 | "I want to register" / "First visit" | Intro + "What is your full legal name, as it appears on your BC Services Card?" |
| 2 | "Sanath swaroop Mulky" | "Thanks, Sanath swaroop Mulky. What is your date of birth?" |
| 3 | "March 15 1999" | "Got it. For your medical record, what is your gender?" |
| 4 | "Male" | "Thanks. What's the best phone number to reach you?" |
| 5 | "408-622-1882" | "Thanks. And your email address? This is optional but helps us send appointment reminders." |
| 6 | "sanath@example.com" or "skip" | "Let me confirm your information: - Name: … - DOB: … - Gender: … - Phone: … [- Email: …] Is everything correct?" |
| 7 | "Yes" | "You're all registered! Welcome. Would you like to book your first appointment now?" |

### Failure / edge cases

- **Name empty:** Re-ask full legal name (same step `name`).
- **DOB invalid/unparseable:** Re-ask date of birth (same step `dob`).
- **Phone not 10 digits:** Re-ask phone (same step `phone`).
- **Confirm_all "no":** Transfer message and set transfer flags; flow cleared.
- **createUser throws:** Transfer message and transfer flags; flow cleared.

## Implementation

- **Node:** `src/graph/nodes/registerFlow.ts`
- **Verbiage:** `src/prompts/verbiage.ts` (`REGISTER_*`, `confirmRegistrationCollected`)
- **State:** `metadata.state.flow_data.step`, `metadata.state.registration_data`, `metadata.state.current_flow === "registration"`
- **LLM helpers:** `src/graph/llm.ts` (`parseEmailWithLLM`, `parseCorrectionDuringConfirm`, `extractFullNameFromUtterance`, `dobToWords`, `normalizeGenderWithLLM`, etc.); prompts in `src/prompts/repository.ts` (`PARSE_EMAIL_SYSTEM`, `CORRECTION_DURING_CONFIRM_SYSTEM`, etc.).
