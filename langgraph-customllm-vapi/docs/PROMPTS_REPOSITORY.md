# Prompts Repository

All LLM system prompts and sentence generators live in **`src/prompts/repository.ts`** (and are re-exported from **`src/prompts/index.ts`**). Import from there instead of defining prompts inline.

## Usage

```ts
import {
  PARSE_DATETIME_SYSTEM,
  buildParseDateTimeUserMessage,
  NO_SLOTS_FOR_PERIOD,
} from "../prompts/repository.js";
// or: from "../prompts/index.js"
```

## Contents

### System prompts (constants)

- **PARSE_DATETIME_SYSTEM** – Date/time parsing (range or moment, timezone-aware).
- **DATE_WORDS_SYSTEM** – ISO datetime → natural phrase for voice.
- **AVAILABILITY_CONDENSED_SYSTEM** – Slot list → “On [date] we have [times]…” paragraph.
- **DOB_PARSE_SYSTEM** – Caller utterance → YYYY-MM-DD.
- **REGISTRATION_COLLECT_SYSTEM** – Scheduling receptionist collecting registration.
- **getIntentClassifierSystem()** – Intent classifier (returns string; uses INTENT_LABELS).

### User prompt builders (functions)

- **buildParseDateTimeUserMessage(nowUtc, timezone, userUtterance)**
- **buildDateWordsSingleUserMessage(isoStart)**
- **buildDateWordsBatchUserMessage(isoStarts)**
- **buildAvailabilityCondensedUserMessage(isoList)**
- **buildDobParseUserMessage(userUtterance)**
- **buildIntentClassifierUserMessage(conversationSnippet, lastUserText, contextSuffix)**
- **buildRegistrationCollectUserMessage(lastUser)**

### Static sentences / templates

- **NO_SLOTS_THIS_WEEK**, **NO_SLOTS_FOR_PERIOD**
- **optionSlotSentence(optionNumber, phrase)** – e.g. `"Option 1: Monday at 9am."`
- **onDateWeHaveSentence(label, times)** – e.g. `"On February 3rd we have 10am, 11am."`
- **ALREADY_REGISTERED_MESSAGE**

### Intent labels

- **INTENT_LABELS** (readonly array), **IntentLabel** (type).

## Referencing from code

- **parseDateTime.ts** – PARSE_DATETIME_SYSTEM, buildParseDateTimeUserMessage.
- **formatSlotDate.ts** – DATE_WORDS_SYSTEM, AVAILABILITY_CONDENSED_SYSTEM, build*UserMessage, NO_SLOTS_*, optionSlotSentence, onDateWeHaveSentence.
- **llm.ts** – INTENT_LABELS, getIntentClassifierSystem, buildIntentClassifierUserMessage, DOB_PARSE_SYSTEM, buildDobParseUserMessage; re-exports IntentLabel.
- **registerFlow.ts** – REGISTRATION_COLLECT_SYSTEM, buildRegistrationCollectUserMessage, ALREADY_REGISTERED_MESSAGE.
