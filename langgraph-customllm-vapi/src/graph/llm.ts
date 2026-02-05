import { createAzureOpenAIClient, getDefaultModel } from "../azureClient.js";
import {
  INTENT_LABELS,
  getIntentClassifierSystem,
  buildIntentClassifierUserMessage,
  DOB_PARSE_SYSTEM,
  buildDobParseUserMessage,
  CONFIRM_YES_NO_SYSTEM,
  buildConfirmYesNoUserMessage,
  REGISTRATION_ANALYZER_SYSTEM,
  buildRegistrationAnalyzerUserMessage,
  EXTRACT_FULL_NAME_SYSTEM,
  buildExtractFullNameUserMessage,
  DOB_WORDS_SYSTEM,
  buildDobWordsUserMessage,
  CORRECTION_INTENT_SYSTEM,
  buildCorrectionIntentUserMessage,
  CORRECTION_DURING_CONFIRM_SYSTEM,
  buildCorrectionDuringConfirmUserMessage,
  GENDER_NORMALIZE_SYSTEM,
  buildGenderNormalizeUserMessage,
  PARSE_EMAIL_SYSTEM,
  buildParseEmailUserMessage,
  MATCH_APPOINTMENT_SYSTEM,
  buildMatchAppointmentUserMessage,
} from "../prompts/repository.js";
import type { IntentLabel } from "../prompts/repository.js";
import type { ChatMessage } from "./state.js";

export type { IntentLabel };

let client: ReturnType<typeof createAzureOpenAIClient> | null = null;

function getClient() {
  if (!client) client = createAzureOpenAIClient();
  return client;
}

/** Last N messages to include as conversation context for intent (assistant + user pairs). */
const INTENT_CONTEXT_MESSAGE_COUNT = 6;

/**
 * Classify user intent from messages and context. Uses previous intent, current step, and
 * recent messages so that in-flow replies (e.g. DOB or yes/no after "Are you X?") are
 * not misclassified as invalid_business.
 */
export async function detectIntentWithLLM(
  messages: ChatMessage[],
  context?: {
    userName?: string | null;
    currentStep?: string;
    previousIntent?: string | null;
  }
): Promise<IntentLabel> {
  const recent = messages.slice(-INTENT_CONTEXT_MESSAGE_COUNT);
  const conversationSnippet = recent
    .map((m) => `${m.role}: ${(m.content ?? "").trim().slice(0, 200)}`)
    .join("\n");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  const contextSuffix = context
    ? ` Conversation context (use this to interpret the last message): previous_intent=${context.previousIntent ?? "none"}, current_step=${context.currentStep ?? "none"}${context.userName ? `, user=${context.userName}` : ""}.`
    : "";
  const userMsg = buildIntentClassifierUserMessage(conversationSnippet, text, contextSuffix);

  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: getIntentClassifierSystem() },
      { role: "user", content: userMsg },
    ],
    max_tokens: 20,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim().toLowerCase();
  for (const label of INTENT_LABELS) {
    if (raw === label || raw.includes(label)) return label;
  }
  return "unsupported";
}

/**
 * Match the user's message (e.g. "cancel the feb 13th 9 am appointment") to one of the listed
 * appointments. Appointment times must already be in clinic timezone human-readable form.
 * Returns the matching appointment id or null if no match.
 */
export async function matchAppointmentByDateTime(
  userMessage: string,
  appointmentsWithClinicTime: Array<{ id: number; providerName?: string; dateTime: string }>
): Promise<number | null> {
  if (!appointmentsWithClinicTime.length) return null;
  const trimmed = userMessage.trim();
  if (!trimmed) return null;
  const userContent = buildMatchAppointmentUserMessage(trimmed, appointmentsWithClinicTime);
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: MATCH_APPOINTMENT_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 20,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim().toUpperCase();
  if (raw === "NONE" || !raw) return null;
  const num = parseInt(raw.replace(/\D/g, ""), 10);
  if (!Number.isFinite(num)) return null;
  const byId = appointmentsWithClinicTime.find((a) => a.id === num);
  if (byId) return byId.id;
  const oneBasedIndex = num >= 1 && num <= appointmentsWithClinicTime.length ? num - 1 : -1;
  if (oneBasedIndex >= 0) return appointmentsWithClinicTime[oneBasedIndex].id;
  return null;
}

/**
 * Generate a short assistant reply (e.g. greeting or flow message) using the LLM.
 */
export async function generateReply(
  systemPrompt: string,
  userContent: string,
  maxTokens = 150
): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  });
  return (completion.choices[0]?.message?.content ?? "").trim() || "I'm sorry, I didn't catch that.";
}

/**
 * Use OpenAI to decide if the user is confirming "yes" to a yes/no question (e.g. "Is that the best number to reach you?").
 * Handles natural replies like "it is correct", "that's right", "yep" so we don't re-ask.
 */
export async function isConfirmingWithLLM(assistantQuestion: string, userReply: string): Promise<boolean> {
  const trimmed = userReply.trim();
  if (!trimmed) return false;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: CONFIRM_YES_NO_SYSTEM },
      { role: "user", content: buildConfirmYesNoUserMessage(assistantQuestion, trimmed) },
    ],
    max_tokens: 10,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim().toLowerCase();
  return raw === "yes" || raw.startsWith("yes");
}

/** Result of agentic analysis of a registration response: valid, action, optional clarification. */
export interface RegistrationAnalysis {
  valid: boolean;
  action: "accept" | "clarify" | "reask";
  clarificationMessage?: string;
}

/**
 * Use OpenAI to analyze a user's registration response for accuracy and decide next action (accept / clarify / reask).
 * Enables an agentic flow: each response is checked before we store and continue.
 */
export async function analyzeRegistrationResponse(
  step: string,
  questionAsked: string,
  userResponse: string,
  collectedSoFar: Record<string, unknown>
): Promise<RegistrationAnalysis> {
  const trimmed = userResponse.trim();
  if (!trimmed) {
    return { valid: false, action: "reask", clarificationMessage: "I didn't catch that. Could you please repeat?" };
  }
  const userMsg = buildRegistrationAnalyzerUserMessage(step, questionAsked, trimmed, collectedSoFar);
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: REGISTRATION_ANALYZER_SYSTEM },
      { role: "user", content: userMsg },
    ],
    max_tokens: 150,
    temperature: 0.2,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}") + 1;
    const json = start >= 0 && end > start ? raw.slice(start, end) : raw;
    const parsed = JSON.parse(json) as RegistrationAnalysis;
    const action = parsed.action === "clarify" || parsed.action === "reask" ? parsed.action : "accept";
    const valid = parsed.valid === true;
    const clarificationMessage =
      typeof parsed.clarificationMessage === "string" && parsed.clarificationMessage.trim()
        ? parsed.clarificationMessage.trim()
        : undefined;
    return { valid, action, clarificationMessage };
  } catch {
    return { valid: true, action: "accept" };
  }
}

/**
 * Extract full legal name from phrases like "it is sanath", "it would be Sanath Mulky".
 * Returns the extracted name or null if none (or NONE).
 */
export async function extractFullNameFromUtterance(utterance: string): Promise<string | null> {
  const trimmed = utterance.trim();
  if (!trimmed) return null;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: EXTRACT_FULL_NAME_SYSTEM },
      { role: "user", content: buildExtractFullNameUserMessage(trimmed) },
    ],
    max_tokens: 60,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  if (raw.toUpperCase() === "NONE" || !raw) return null;
  return raw;
}

/**
 * Convert DOB (YYYY-MM-DD) to spoken form for voice (e.g. "March 15th, 1999").
 */
export async function dobToWords(dobYyyyMmDd: string): Promise<string> {
  const trimmed = dobYyyyMmDd.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: DOB_WORDS_SYSTEM },
      { role: "user", content: buildDobWordsUserMessage(trimmed.slice(0, 10)) },
    ],
    max_tokens: 30,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  return raw || trimmed;
}

/**
 * Detect if the user is trying to correct or change something they said earlier.
 */
export async function isCorrectingIntent(userMessage: string): Promise<boolean> {
  const trimmed = userMessage.trim();
  if (!trimmed) return false;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: CORRECTION_INTENT_SYSTEM },
      { role: "user", content: buildCorrectionIntentUserMessage(trimmed) },
    ],
    max_tokens: 10,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim().toLowerCase();
  return raw === "yes" || raw.startsWith("yes");
}

/** Result of parsing a correction during final confirmation. */
export interface CorrectionDuringConfirm {
  correcting: boolean;
  field: "name" | "dob" | "gender" | "phone" | "email" | "";
  newValue: string;
}

/**
 * Parse whether the user is correcting a specific field during final confirmation, and which field + new value.
 * Used to update registration_data in-flow before calling the register API.
 */
export async function parseCorrectionDuringConfirm(
  userMessage: string,
  currentSummary: string
): Promise<CorrectionDuringConfirm | null> {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: CORRECTION_DURING_CONFIRM_SYSTEM },
      { role: "user", content: buildCorrectionDuringConfirmUserMessage(trimmed, currentSummary) },
    ],
    max_tokens: 120,
    temperature: 0.2,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}") + 1;
    const json = start >= 0 && end > start ? raw.slice(start, end) : raw;
    const parsed = JSON.parse(json) as CorrectionDuringConfirm;
    const field = ["name", "dob", "gender", "phone", "email"].includes(parsed.field)
      ? parsed.field
      : "";
    return {
      correcting: parsed.correcting === true && field !== "",
      field: field as CorrectionDuringConfirm["field"],
      newValue: typeof parsed.newValue === "string" ? parsed.newValue.trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Normalize gender with auto-correction for transcription errors (e.g. "mail" → male, "femail" → female).
 * Uses OpenAI to map user reply to exactly one of male, female, other.
 */
export async function normalizeGenderWithLLM(
  userReply: string
): Promise<"male" | "female" | "other"> {
  const trimmed = userReply.trim();
  if (!trimmed) return "other";
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: GENDER_NORMALIZE_SYSTEM },
      { role: "user", content: buildGenderNormalizeUserMessage(trimmed) },
    ],
    max_tokens: 10,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim().toLowerCase();
  if (raw === "female") return "female";
  if (raw === "male") return "male";
  return "other";
}

/** Basic regex for valid email (local@domain.tld). */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse spoken/transcribed email into standard format using OpenAI.
 * E.g. "sanath at gmail dot come" → "sanath@gmail.com". Fixes typos like "come" → "com".
 * Returns null if no email can be extracted.
 */
export async function parseEmailWithLLM(utterance: string): Promise<string | null> {
  const trimmed = utterance.trim();
  if (!trimmed) return null;
  if (EMAIL_LIKE.test(trimmed.toLowerCase())) return trimmed.toLowerCase().trim();
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: PARSE_EMAIL_SYSTEM },
      { role: "user", content: buildParseEmailUserMessage(trimmed) },
    ],
    max_tokens: 60,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  if (raw.toUpperCase() === "NONE" || !raw) return null;
  const normalized = raw.toLowerCase().trim();
  return EMAIL_LIKE.test(normalized) ? normalized : null;
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the caller's uttered date of birth into YYYY-MM-DD using the LLM.
 * Returns null if no clear date could be extracted (so verification will reject).
 */
export async function parseUtteredDobToYYYYMMDD(userUtterance: string): Promise<string | null> {
  const trimmed = userUtterance.trim();
  if (!trimmed) return null;
  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: "system", content: DOB_PARSE_SYSTEM },
      { role: "user", content: buildDobParseUserMessage(trimmed) },
    ],
    max_tokens: 15,
    temperature: 0,
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  if (raw.toUpperCase() === "INVALID") return null;
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  return null;
}

/**
 * Normalize a DOB string from the API (e.g. "1999-03-15" or "1999-03-15T00:00:00.000Z") to YYYY-MM-DD.
 */
export function normalizeDobToYYYYMMDD(dob: string): string {
  const s = dob.trim();
  const iso = s.slice(0, 10);
  if (YYYY_MM_DD.test(iso)) return iso;
  return s;
}

/**
 * Verify DOB by strict calendar-date equality. Uses LLM only to parse the uttered date to YYYY-MM-DD;
 * the actual match is done in code so wrong dates are never accepted.
 */
export async function verifyDobWithLLM(
  userDetails: { fullName: string; dob: string },
  userUtterance: string
): Promise<boolean> {
  const uttered = await parseUtteredDobToYYYYMMDD(userUtterance);
  if (!uttered) return false;
  const userNorm = normalizeDobToYYYYMMDD(userDetails.dob);
  if (!YYYY_MM_DD.test(userNorm)) return false;
  return uttered === userNorm;
}
