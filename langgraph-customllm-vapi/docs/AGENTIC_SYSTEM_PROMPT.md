# Agentic Flow System Prompt (PrimaryRules-Based)

## Overview

The agentic registration flow uses a **system prompt base** derived from **PrimaryRules** (`docs/PrimaryRules`) so that all registration-related LLM calls behave consistently with booking policy.

## Source

- **Policy:** `custom-llm-mock-server/docs/PrimaryRules`
- **Code:** `AGENTIC_FLOW_SYSTEM_BASE` in `src/prompts/repository.ts`

## What the base encodes

The base prompt is prepended to these registration-related system prompts:

| Prompt | Use |
|--------|-----|
| `CONFIRM_YES_NO_SYSTEM` | Decide if user is confirming "yes" (e.g. phone number) |
| `REGISTRATION_ANALYZER_SYSTEM` | Analyze each user response: valid, action (accept/clarify/reask), clarification message |
| `EXTRACT_FULL_NAME_SYSTEM` | Extract full legal name from phrases like "it is sanath", "it would be Sanath Mulky" |
| `DOB_WORDS_SYSTEM` | Convert YYYY-MM-DD to spoken form (e.g. "March 15th, 1999") |
| `CORRECTION_INTENT_SYSTEM` | Detect if user is trying to correct something |
| `CORRECTION_DURING_CONFIRM_SYSTEM` | Parse which field + new value when user corrects during final confirmation (→ update reg, re-show summary) |

## Content (condensed from PrimaryRules)

- **Golden Rules:** One question at a time; confirm before action; be patient with elderly; stay in caller's language; keep it human.
- **New user registration:** Collect one item at a time; confirm each; full legal name (extract from "it is X"); DOB in words when confirming; gender male/female/other; phone E.164, confirm by reading back; email optional; full summary then "Is everything correct?" before registering.
- **Name spelling:** Names can sound similar; if unclear, ask to spell and confirm letter by letter.
- **Corrections during confirmation:** When user is on final confirmation ("Is everything correct?") and gives a correction (e.g. "actually my phone is X"), parse field + new value, update registration_data, re-show summary; when they confirm yes, call register API with updated data. Only if they say no (and are not correcting) do we transfer.
- **Transfer:** When user asks for human, is frustrated, has medical/billing question, registration error, or says no to confirmation without giving a correction.

## Updating the base

When PrimaryRules change (e.g. new registration fields, new transfer triggers), update `AGENTIC_FLOW_SYSTEM_BASE` in `src/prompts/repository.ts` so the agentic flow stays aligned with policy.
