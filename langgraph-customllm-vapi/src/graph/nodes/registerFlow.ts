import {
  createUser,
  getBookingRules,
  normalizeCallerId,
  type CreateUserBody,
} from "../../apiClient.js";
import {
  CLINIC_NOT_ACCEPTING,
  ADD_WAITLIST_YES,
  ADD_WAITLIST_NO,
  REGISTER_INTRO,
  REGISTER_FULL_NAME,
  REGISTER_DOB,
  REGISTER_GENDER,
  REGISTER_PHONE,
  REGISTER_EMAIL,
  REGISTER_SUCCESS,
  REGISTER_ERROR_TRANSFER,
  REGISTER_CORRECTION_TRANSFER,
  ALREADY_REGISTERED_MESSAGE,
  confirmRegistrationCollected,
} from "../../prompts/verbiage.js";
import {
  parseUtteredDobToYYYYMMDD,
  isConfirmingWithLLM,
  analyzeRegistrationResponse,
  extractFullNameFromUtterance,
  dobToWords,
  parseCorrectionDuringConfirm,
  normalizeGenderWithLLM,
  parseEmailWithLLM,
} from "../llm.js";
import type { GraphState } from "../state.js";

const DEFAULT_ORG_ID = 1;
const NODE = "register_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^(yes|yeah|yep|yup|sure|please|correct|that's right|that is correct|it is correct|it's correct)$/.test(t) ||
    /^yes\b/.test(t) ||
    /^it'?s\s*correct$/i.test(t)
  );
}

function isSkipEmail(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    !t ||
    /^(no|skip|that'?s\s*fine|optional|no\s*thanks|nope|rather\s*not)$/.test(t) ||
    /skip\s*it|don'?t\s*have|prefer\s*not/.test(t)
  );
}

/** Normalize user input to one of male / female / other for storage. */
function normalizeGender(text: string): "male" | "female" | "other" {
  const t = text.trim().toLowerCase();
  if (/^(male|man|m)$/.test(t)) return "male";
  if (/^(female|woman|f)$/.test(t)) return "female";
  return "other";
}

/** Parse "First Middle Last" into { firstName, lastName } (last token = last name). */
function parseFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

/** Extract 10-digit phone from user input (digits only; leading 1 stripped if 11 digits). */
function normalizePhoneFromInput(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Get caller phone in E.164 (with country code) from state for storage and lookup. */
function getCallerPhoneE164(state: GraphState): string | null {
  const normalized = state.metadata?.state?.normalized_phone;
  if (normalized && normalized.replace(/\D/g, "").length >= 10) return normalized;
  return null;
}

/** Format phone for voice: (XXX) XXX-XXXX from E.164 or 10-digit string. */
function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return phone;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Normalize user input to E.164 via backend (keeps country code for lookup); fallback to +1 + 10 digits (US) on failure. */
async function normalizeUserPhoneToE164(userInput: string): Promise<string | null> {
  const digits = normalizePhoneFromInput(userInput);
  if (!digits || digits.length < 10) return null;
  try {
    const result = await normalizeCallerId(userInput.trim());
    if (result?.normalizedNumber && result.normalizedNumber.replace(/\D/g, "").length >= 10) {
      return result.normalizedNumber;
    }
  } catch {
    // fall through to fallback
  }
  return `+1${digits}`;
}

function updateRegMeta(
  state: GraphState,
  now: string,
  updates: {
    flow_data: { step: string; started_at: string };
    registration_data?: Record<string, unknown> | null;
    current_flow?: string;
    current_step?: string;
    next_action?: string;
  }
): Partial<GraphState>["metadata"] {
  if (!state.metadata) return undefined;
  const reg = updates.registration_data ?? state.metadata.state?.registration_data ?? null;
  return {
    ...state.metadata,
    last_updated: now,
    state: {
      ...state.metadata.state,
      current_flow: updates.current_flow ?? state.metadata.state?.current_flow ?? "registration",
      flow_data: updates.flow_data,
      registration_data: reg,
      current_step: updates.current_step ?? "register_flow",
      next_action: updates.next_action ?? "ask_anything_else",
    },
  };
}

/**
 * Register flow: clinic check, then if not registered collect fields and create patient; if registered, say already registered.
 */
export async function registerFlow(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const inner = state.metadata?.state;
  const isRegistered = inner?.is_registered ?? !!state.user_id;
  const flowData = inner?.flow_data ?? { step: "start", started_at: new Date().toISOString() };
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  const now = new Date().toISOString();
  const orgId = inner?.org_id ?? DEFAULT_ORG_ID;

  if (isRegistered) {
    const msg = ALREADY_REGISTERED_MESSAGE;
    logResponse(msg);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_flow: null,
              flow_data: null,
              current_step: "register_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const step = flowData.step ?? "collect";

  // Step 1: Check if clinic accepts new patients (PrimaryRules)
  if (step === "start" || step === "clinic_check") {
    try {
      const rules = await getBookingRules(orgId);
      if (!rules.acceptingBookings) {
        return {
          assistantResponse: CLINIC_NOT_ACCEPTING,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: orgId,
                  current_flow: "registration",
                  flow_data: { step: "offer_waitlist", started_at: flowData.started_at },
                  current_step: "register_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
    } catch {
      // If we can't fetch rules, proceed to collect (don't block registration)
    }
    return {
      assistantResponse: REGISTER_INTRO + " " + REGISTER_FULL_NAME,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              org_id: orgId,
              current_flow: "registration",
              flow_data: { step: "name", started_at: flowData.started_at },
              registration_data: {},
              current_step: "register_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  if (step === "offer_waitlist") {
    if (isAffirmative(lastUser)) {
      return {
        assistantResponse: ADD_WAITLIST_YES,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                current_flow: null,
                flow_data: null,
                current_step: "register_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
        };
      }
    return {
      assistantResponse: ADD_WAITLIST_NO,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_flow: null,
              flow_data: null,
              current_step: "register_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const reg = (state.metadata?.state?.registration_data as Record<string, unknown> | null) ?? {};

  // —— name: AI analyze → extract name (e.g. "it is sanath" → Sanath) → parse, confirm, ask DOB ——
  if (step === "name") {
    const trimmed = lastUser.trim();
    if (!trimmed) {
      return {
        assistantResponse: REGISTER_FULL_NAME,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "name", started_at: flowData.started_at },
        }),
      };
    }
    const analysis = await analyzeRegistrationResponse(
      "name",
      REGISTER_FULL_NAME,
      lastUser,
      reg
    );
    if (analysis.action === "reask" || (analysis.action === "clarify" && !analysis.valid)) {
      return {
        assistantResponse: analysis.clarificationMessage ?? REGISTER_FULL_NAME,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "name", started_at: flowData.started_at },
        }),
      };
    }
    const extractedName = await extractFullNameFromUtterance(trimmed);
    const nameToParse = extractedName ?? trimmed;
    const { firstName, lastName } = parseFullName(nameToParse);
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || nameToParse;
    const nextReg = { ...reg, firstName, lastName };
    return {
      assistantResponse: `Thanks, ${displayName}. ${REGISTER_DOB}`,
      metadata: updateRegMeta(state, now, {
        flow_data: { step: "dob", started_at: flowData.started_at },
        registration_data: nextReg,
      }),
    };
  }

  // —— dob: AI analyze → parse DOB, confirm, ask gender ——
  if (step === "dob") {
    const analysis = await analyzeRegistrationResponse(
      "dob",
      REGISTER_DOB,
      lastUser,
      reg
    );
    if (analysis.action === "reask" || (analysis.action === "clarify" && !analysis.valid)) {
      return {
        assistantResponse: analysis.clarificationMessage ?? REGISTER_DOB,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "dob", started_at: flowData.started_at },
        }),
      };
    }
    const parsed = await parseUtteredDobToYYYYMMDD(lastUser);
    if (!parsed) {
      return {
        assistantResponse: analysis.clarificationMessage ?? REGISTER_DOB,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "dob", started_at: flowData.started_at },
        }),
      };
    }
    const nextReg = { ...reg, dob: parsed };
    const dobSpoken = await dobToWords(parsed);
    return {
      assistantResponse: `Got it, ${dobSpoken}. ${REGISTER_GENDER}`,
      metadata: updateRegMeta(state, now, {
        flow_data: { step: "gender", started_at: flowData.started_at },
        registration_data: nextReg,
      }),
    };
  }

  // —— gender: normalize first (auto-correct "mail"→male) → then analyze if needed → store, confirm, ask phone ——
  if (step === "gender") {
    const trimmed = lastUser.trim() || "other";
    // Auto-correct transcription errors FIRST (e.g. "mail" → male, "femail" → female) via OpenAI
    const simple = normalizeGender(trimmed);
    const gender =
      simple === "male" || simple === "female"
        ? simple
        : await normalizeGenderWithLLM(trimmed);
    // If normalization gave us male or female, accept it (even if analyzer would reject "mail")
    if (gender === "male" || gender === "female") {
      const nextReg: Record<string, unknown> = { ...reg, gender };
      const callerPhoneE164 = getCallerPhoneE164(state);
      if (callerPhoneE164) {
        nextReg.phone = callerPhoneE164;
        const formatted = formatPhoneForDisplay(callerPhoneE164);
        return {
          assistantResponse: `Thanks. The number we have for this call is ${formatted}. Is that the best number to reach you?`,
          metadata: updateRegMeta(state, now, {
            flow_data: { step: "phone", started_at: flowData.started_at },
            registration_data: nextReg,
          }),
        };
      }
      return {
        assistantResponse: `Thanks. ${REGISTER_PHONE}`,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "phone", started_at: flowData.started_at },
          registration_data: nextReg,
        }),
      };
    }
    // If normalization gave "other" and input is unclear, use analyzer to decide if we should reask/clarify
    const analysis = await analyzeRegistrationResponse(
      "gender",
      REGISTER_GENDER,
      lastUser,
      reg
    );
    if (analysis.action === "reask" || (analysis.action === "clarify" && !analysis.valid)) {
      return {
        assistantResponse: analysis.clarificationMessage ?? REGISTER_GENDER,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "gender", started_at: flowData.started_at },
        }),
      };
    }
    // Analyzer accepted it as "other" or we proceed with "other"
    const nextReg: Record<string, unknown> = { ...reg, gender: "other" };
    const callerPhoneE164 = getCallerPhoneE164(state);
    if (callerPhoneE164) {
      nextReg.phone = callerPhoneE164;
      const formatted = formatPhoneForDisplay(callerPhoneE164);
      return {
        assistantResponse: `Thanks. The number we have for this call is ${formatted}. Is that the best number to reach you?`,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "phone", started_at: flowData.started_at },
          registration_data: nextReg,
        }),
      };
    }
    return {
      assistantResponse: `Thanks. ${REGISTER_PHONE}`,
      metadata: updateRegMeta(state, now, {
        flow_data: { step: "phone", started_at: flowData.started_at },
        registration_data: nextReg,
      }),
    };
  }

  // —— phone: AI analyze → use caller ID if pre-filled; else normalize from user; confirm, ask email ——
  const PHONE_CONFIRM_QUESTION = "Is that the best number to reach you?";
  if (step === "phone") {
    const alreadyHavePhone = reg.phone && String(reg.phone).replace(/\D/g, "").length >= 10;
    if (alreadyHavePhone) {
      // Pre-filled from caller ID: AI analyze → yes → keep and go to email; no → re-ask; number → use it
      const analysis = await analyzeRegistrationResponse(
        "phone_confirm",
        PHONE_CONFIRM_QUESTION,
        lastUser,
        reg
      );
      if (analysis.action === "reask" || (analysis.action === "clarify" && !analysis.valid)) {
        const userPhoneE164 = await normalizeUserPhoneToE164(lastUser);
        if (!userPhoneE164) {
          return {
            assistantResponse: analysis.clarificationMessage ?? REGISTER_PHONE,
            metadata: updateRegMeta(state, now, {
              flow_data: { step: "phone", started_at: flowData.started_at },
            }),
          };
        }
      }
      const confirmedByRegex = isAffirmative(lastUser);
      const confirmedByLLM = !confirmedByRegex
        ? await isConfirmingWithLLM(PHONE_CONFIRM_QUESTION, lastUser)
        : false;
      if (confirmedByRegex || confirmedByLLM) {
        const nextReg = { ...reg };
        return {
          assistantResponse: `Thanks. ${REGISTER_EMAIL}`,
          metadata: updateRegMeta(state, now, {
            flow_data: { step: "email", started_at: flowData.started_at },
            registration_data: nextReg,
          }),
        };
      }
      const userPhoneE164 = await normalizeUserPhoneToE164(lastUser);
      if (userPhoneE164) {
        const nextReg = { ...reg, phone: userPhoneE164 };
        return {
          assistantResponse: `Thanks. ${REGISTER_EMAIL}`,
          metadata: updateRegMeta(state, now, {
            flow_data: { step: "email", started_at: flowData.started_at },
            registration_data: nextReg,
          }),
        };
      }
      // User said no or unclear: ask for number, clear pre-fill so next message is their number
      return {
        assistantResponse: REGISTER_PHONE,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "phone", started_at: flowData.started_at },
          registration_data: (() => {
            const r = { ...reg };
            delete r.phone;
            return r;
          })(),
        }),
      };
    }
    // No pre-fill: AI analyze then normalize user input to E.164
    const analysisNoPrefill = await analyzeRegistrationResponse(
      "phone",
      REGISTER_PHONE,
      lastUser,
      reg
    );
    if (analysisNoPrefill.action === "reask" || (analysisNoPrefill.action === "clarify" && !analysisNoPrefill.valid)) {
      return {
        assistantResponse: analysisNoPrefill.clarificationMessage ?? REGISTER_PHONE,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "phone", started_at: flowData.started_at },
        }),
      };
    }
    const userPhoneE164 = await normalizeUserPhoneToE164(lastUser);
    const phoneE164 = userPhoneE164 ?? getCallerPhoneE164(state);
    if (!phoneE164 || phoneE164.replace(/\D/g, "").length < 10) {
      return {
        assistantResponse: analysisNoPrefill.clarificationMessage ?? REGISTER_PHONE,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "phone", started_at: flowData.started_at },
        }),
      };
    }
    const nextReg = { ...reg, phone: phoneE164 };
    return {
      assistantResponse: `Thanks. ${REGISTER_EMAIL}`,
      metadata: updateRegMeta(state, now, {
        flow_data: { step: "email", started_at: flowData.started_at },
        registration_data: nextReg,
      }),
    };
  }

  // —— email: AI analyze → optional; then show full confirmation ——
  if (step === "email") {
    const analysisEmail = await analyzeRegistrationResponse(
      "email",
      REGISTER_EMAIL,
      lastUser,
      reg
    );
    if (analysisEmail.action === "reask" && !analysisEmail.valid && !isSkipEmail(lastUser)) {
      return {
        assistantResponse: analysisEmail.clarificationMessage ?? REGISTER_EMAIL,
        metadata: updateRegMeta(state, now, {
          flow_data: { step: "email", started_at: flowData.started_at },
        }),
      };
    }
    const nextReg = { ...reg };
    if (!isSkipEmail(lastUser)) {
      const parsedEmail = await parseEmailWithLLM(lastUser);
      nextReg.email = parsedEmail ?? lastUser.trim();
    }
    const name = [String(nextReg.firstName ?? ""), String(nextReg.lastName ?? "")].filter(Boolean).join(" ") || "—";
    const dobRaw = String(nextReg.dob ?? "");
    const dobSpoken = dobRaw && /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? await dobToWords(dobRaw) : dobRaw || "—";
    const summary = confirmRegistrationCollected({
      name,
      dob: dobSpoken,
      gender: String(nextReg.gender ?? "—"),
      phone: formatPhoneForDisplay(String(nextReg.phone ?? "—")),
      email: nextReg.email ? String(nextReg.email) : undefined,
    });
    return {
      assistantResponse: summary,
      metadata: updateRegMeta(state, now, {
        flow_data: { step: "confirm_all", started_at: flowData.started_at },
        registration_data: nextReg,
      }),
    };
  }

  // —— confirm_all: user says yes → create patient; correcting → update field and re-show summary; no → transfer ——
  if (step === "confirm_all") {
    // First check if user explicitly confirmed (yes/affirmative)
    let userConfirmed = isAffirmative(lastUser);
    
    // If not explicitly confirmed, check for corrections FIRST (before clarification/transfer)
    // This ensures corrections are detected even if the user is just providing information
    const name = [String(reg.firstName ?? ""), String(reg.lastName ?? "")].filter(Boolean).join(" ") || "—";
    const dobRaw = String(reg.dob ?? "");
    const dobSpoken = dobRaw && /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? await dobToWords(dobRaw) : dobRaw || "—";
    const currentSummary = confirmRegistrationCollected({
      name,
      dob: dobSpoken,
      gender: String(reg.gender ?? "—"),
      phone: formatPhoneForDisplay(String(reg.phone ?? "—")),
      email: reg.email ? String(reg.email) : undefined,
    });
    
    // Parse for corrections using OpenAI - this will detect if user is providing field information
    const correction = await parseCorrectionDuringConfirm(lastUser, currentSummary);
    
    if (correction?.correcting && correction.field && correction.newValue) {
      // User is correcting a field - update and reconfirm
        const updatedReg = { ...reg } as Record<string, unknown>;
        if (correction.field === "name") {
          const extracted = await extractFullNameFromUtterance(correction.newValue) ?? correction.newValue;
          const { firstName, lastName } = parseFullName(extracted);
          updatedReg.firstName = firstName;
          updatedReg.lastName = lastName;
        } else if (correction.field === "dob") {
          const parsed = await parseUtteredDobToYYYYMMDD(correction.newValue);
          if (parsed) updatedReg.dob = parsed;
          else {
            return {
              assistantResponse: "I couldn't catch that date. What is your date of birth?",
              metadata: updateRegMeta(state, now, {
                flow_data: { step: "confirm_all", started_at: flowData.started_at },
              }),
            };
          }
        } else if (correction.field === "gender") {
          const simple = normalizeGender(correction.newValue);
          updatedReg.gender =
            simple === "male" || simple === "female"
              ? simple
              : await normalizeGenderWithLLM(correction.newValue);
        } else if (correction.field === "phone") {
          const phoneE164 = await normalizeUserPhoneToE164(correction.newValue);
          if (phoneE164) updatedReg.phone = phoneE164;
          else {
            return {
              assistantResponse: "I couldn't catch that number. What's the best phone number to reach you?",
              metadata: updateRegMeta(state, now, {
                flow_data: { step: "confirm_all", started_at: flowData.started_at },
              }),
            };
          }
        } else if (correction.field === "email") {
          const normalizedEmail = correction.newValue
            ? (await parseEmailWithLLM(correction.newValue)) ?? correction.newValue.trim()
            : undefined;
          updatedReg.email = normalizedEmail || undefined;
        }
        const name2 = [String(updatedReg.firstName ?? ""), String(updatedReg.lastName ?? "")].filter(Boolean).join(" ") || "—";
        const dobRaw2 = String(updatedReg.dob ?? "");
        const dobSpoken2 = dobRaw2 && /^\d{4}-\d{2}-\d{2}/.test(dobRaw2) ? await dobToWords(dobRaw2) : dobRaw2 || "—";
        const newSummary = confirmRegistrationCollected({
          name: name2,
          dob: dobSpoken2,
          gender: String(updatedReg.gender ?? "—"),
          phone: formatPhoneForDisplay(String(updatedReg.phone ?? "—")),
          email: updatedReg.email ? String(updatedReg.email) : undefined,
        });
        return {
          assistantResponse: newSummary,
          metadata: updateRegMeta(state, now, {
            flow_data: { step: "confirm_all", started_at: flowData.started_at },
            registration_data: updatedReg,
          }),
        };
    }
    
    // If no correction detected, check if user confirmed via LLM analysis
    if (!userConfirmed) {
      const analysisConfirm = await analyzeRegistrationResponse(
        "confirm_all",
        "Is everything correct?",
        lastUser,
        reg
      );
      const confirmedViaLLM = analysisConfirm.valid && analysisConfirm.action === "accept";
      
      if (confirmedViaLLM) {
        // User confirmed via LLM - proceed to create patient
        userConfirmed = true;
      } else if (analysisConfirm.action === "clarify" && analysisConfirm.clarificationMessage) {
        // Need clarification - ask for it
        return {
          assistantResponse: analysisConfirm.clarificationMessage,
          metadata: updateRegMeta(state, now, {
            flow_data: { step: "confirm_all", started_at: flowData.started_at },
          }),
        };
      }
    }
    
    // If user confirmed (either explicitly or via LLM), create patient
    if (userConfirmed) {
      const body: CreateUserBody = {
        firstName: String(reg.firstName ?? "Unknown"),
        lastName: String(reg.lastName ?? "Unknown"),
        dob: String(reg.dob ?? "1990-01-01"),
        gender: normalizeGender(String(reg.gender ?? "other")),
        phone: String(reg.phone ?? state.metadata?.state?.normalized_phone ?? ""),
      };
      if (reg.email) body.email = String(reg.email);
      try {
        const result = await createUser(body);
        return {
          user_id: result.userId,
          assistantResponse: REGISTER_SUCCESS,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  user_id: result.userId,
                  is_registered: true,
                  registration_data: null,
                  current_flow: null,
                  flow_data: null,
                  current_step: "register_flow",
                  next_action: "ask_anything_else",
                },
            }
          : undefined,
      };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          assistantResponse: REGISTER_ERROR_TRANSFER,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  last_error: errMsg,
                  failure_count: (state.metadata.state.failure_count ?? 0) + 1,
                  current_flow: null,
                  flow_data: null,
                  current_step: "register_flow",
                  next_action: "ask_anything_else",
                  should_transfer: true,
                  transfer_to_agent: true,
                },
              }
            : undefined,
        };
      }
    }
    
    // If we reach here, user didn't confirm and no correction was detected - transfer to staff
    return {
      assistantResponse:
        "No problem. Let me connect you with our staff who can help make any changes.",
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_flow: null,
              flow_data: null,
              current_step: "register_flow",
              next_action: "ask_anything_else",
              should_transfer: true,
              transfer_to_agent: true,
            },
          }
        : undefined,
    };
  }

  // Fallback: re-ask for name
  return {
    assistantResponse: REGISTER_FULL_NAME,
    metadata: updateRegMeta(state, now, {
      flow_data: { step: "name", started_at: flowData.started_at },
    }),
  };
}
