import { searchUsers, getUsersByPhone } from "../../apiClient.js";
import {
  ASK_CURRENT_OR_FIRST,
  ASK_NAME,
  NAME_NOT_FOUND_ASK_SPELL,
  searchingForSpelled,
  confirmSpellingLetters,
  ASK_DOB_CONFIRM,
  DOB_MISMATCH_TRY_PHONE,
  ASK_PHONE,
  NOT_FOUND_OFFER_REGISTER_OR_TRANSFER,
  TRANSFER_LOCATE_RECORD,
  CONFIRM_THEN_SERVICES,
} from "../../prompts/verbiage.js";
import { userFromLookup, type GraphState, type VerifyStep } from "../state.js";
import { verifyDobWithLLM } from "../llm.js";

function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yeah|yep|yup|sure|correct|that'?s?\s*right)$/.test(t) || /^yes\b/.test(t);
}

function isFirstVisit(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /first\s*visit|new\s*user|register|first\s*time|i'?m\s*new|never\s*been/.test(t);
}

function isReturningUser(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /current|existing|returning|yes\s*i\s*am|i'?m\s*a\s*user|already\s*a\s*user|already\s*registered/.test(t);
}

/** Extract digits from user message for phone. */
function extractPhoneDigits(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10) {
    const ten = digits.slice(-10);
    if (digits.length > 10 && (digits.startsWith("1") || digits.startsWith("01"))) {
      return digits.replace(/^1?0?/, "").slice(-10);
    }
    return ten;
  }
  return digits;
}

const NODE = "verify_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

/**
 * Verify user when caller ID did not find a match: ask current vs first visit,
 * then name → search → spelling confirmation → DOB → phone fallback → register or transfer.
 */
export async function verifyUser(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const inner = state.metadata?.state;
  const verifyStep = (inner?.verify_step ?? null) as VerifyStep | null;
  const currentFlow = inner?.current_flow ?? null;
  const pendingIntent = inner?.pending_intent_after_verify ?? null;
  const nameSearchAttempts = inner?.name_search_attempts ?? 0;
  const lastSpelledName = inner?.last_spelled_name ?? null;
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  const now = new Date().toISOString();

  const updateState = (updates: Partial<typeof inner>) =>
    state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: { ...state.metadata.state, ...updates },
        }
      : undefined;

  if (!verifyStep && currentFlow !== "verify_user") {
    const intent = state.current_intent ?? inner?.current_intent ?? "book";
    const nextMap: Record<string, "book_flow" | "reschedule_flow" | "cancel_flow" | "get_appointments_flow"> = {
      book: "book_flow",
      reschedule: "reschedule_flow",
      cancel: "cancel_flow",
      get_appointments: "get_appointments_flow",
    };
    const pending = nextMap[intent] ?? "book_flow";
    logResponse(ASK_CURRENT_OR_FIRST);
    return {
      assistantResponse: ASK_CURRENT_OR_FIRST,
      metadata: updateState({
        current_flow: "verify_user",
        verify_step: "ask_current_or_first",
        pending_intent_after_verify: pending,
      }),
    };
  }

  if (verifyStep === "ask_current_or_first") {
    if (isFirstVisit(lastUser)) {
      const regMsg = "I'll help you register. One moment.";
      logResponse(regMsg);
      return {
        assistantResponse: regMsg,
        metadata: updateState({
          verify_step: null,
          current_flow: null,
          verify_next: "register",
          pending_intent_after_verify: null,
        }),
      };
    }
    if (isReturningUser(lastUser) || lastUser.length > 0) {
      logResponse(ASK_NAME);
      return {
        assistantResponse: ASK_NAME,
        metadata: updateState({ verify_step: "ask_name" }),
      };
    }
    logResponse(ASK_CURRENT_OR_FIRST);
    return {
      assistantResponse: ASK_CURRENT_OR_FIRST,
      metadata: updateState({}),
    };
  }

  if (verifyStep === "ask_name") {
    const name = lastUser.trim();
    if (!name) {
      logResponse(ASK_NAME);
      return { assistantResponse: ASK_NAME, metadata: updateState({}) };
    }
    try {
      const list = await searchUsers({ name });
      if (list.length > 0) {
        const first = list[0];
        const userInfo = userFromLookup({ ...first, dob: first.dob });
        const userName = `${first.name.firstName} ${first.name.lastName}`;
        logResponse(ASK_DOB_CONFIRM);
        return {
          user_id: first.id,
          user: userInfo,
          assistantResponse: ASK_DOB_CONFIRM,
          metadata: updateState({
            user_id: first.id,
            user_name: userName,
            user_dob: first.dob ?? null,
            verify_step: "ask_dob",
            name_search_attempts: 0,
          }),
        };
      }
    } catch {
      // fall through
    }
    const attempts = nameSearchAttempts + 1;
    if (attempts >= 2) {
      logResponse(NOT_FOUND_OFFER_REGISTER_OR_TRANSFER);
      return {
        assistantResponse: NOT_FOUND_OFFER_REGISTER_OR_TRANSFER,
        metadata: updateState({
          verify_step: "offer_register_or_transfer",
          name_search_attempts: attempts,
        }),
      };
    }
    logResponse(NAME_NOT_FOUND_ASK_SPELL);
    return {
      assistantResponse: NAME_NOT_FOUND_ASK_SPELL,
      metadata: updateState({
        verify_step: "ask_spell_last",
        name_search_attempts: attempts,
      }),
    };
  }

  if (verifyStep === "ask_spell_last") {
    const spelled = lastUser.trim().replace(/\s+/g, " ").toUpperCase();
    if (!spelled) {
      logResponse(NAME_NOT_FOUND_ASK_SPELL);
      return { assistantResponse: NAME_NOT_FOUND_ASK_SPELL, metadata: updateState({}) };
    }
    const letters = spelled.split("").join(", ");
    const spellMsg = confirmSpellingLetters(letters);
    logResponse(spellMsg);
    return {
      assistantResponse: spellMsg,
      metadata: updateState({
        verify_step: "confirm_spelling",
        last_spelled_name: spelled.replace(/\s/g, ""),
      }),
    };
  }

  if (verifyStep === "confirm_spelling") {
    if (!isAffirmative(lastUser)) {
      return {
        assistantResponse: NAME_NOT_FOUND_ASK_SPELL,
        metadata: updateState({ verify_step: "ask_spell_last" }),
      };
    }
    const spelled = lastSpelledName ?? lastUser.replace(/\D/g, "");
    if (!spelled) {
      return { assistantResponse: ASK_NAME, metadata: updateState({ verify_step: "ask_name" }) };
    }
    try {
      const list = await searchUsers({ fuzzy: spelled });
      if (list.length > 0) {
        const first = list[0];
        const userInfo = userFromLookup({ ...first, dob: first.dob });
        const userName = `${first.name.firstName} ${first.name.lastName}`;
        return {
          user_id: first.id,
          user: userInfo,
          assistantResponse: ASK_DOB_CONFIRM,
          metadata: updateState({
            user_id: first.id,
            user_name: userName,
            user_dob: first.dob ?? null,
            verify_step: "ask_dob",
            last_spelled_name: null,
          }),
        };
      }
    } catch {
      // fall through
    }
    const attempts = nameSearchAttempts + 1;
    if (attempts >= 2) {
      logResponse(NOT_FOUND_OFFER_REGISTER_OR_TRANSFER);
      return {
        assistantResponse: NOT_FOUND_OFFER_REGISTER_OR_TRANSFER,
        metadata: updateState({
          verify_step: "offer_register_or_transfer",
          name_search_attempts: attempts,
        }),
      };
    }
    const searchMsg = searchingForSpelled(spelled) + " " + NAME_NOT_FOUND_ASK_SPELL;
    logResponse(searchMsg);
    return {
      assistantResponse: searchMsg,
      metadata: updateState({ verify_step: "ask_spell_last" }),
    };
  }

  if (verifyStep === "ask_dob") {
    const userDob = inner?.user_dob ?? null;
    const userName = inner?.user_name ?? null;
    if (!userDob || !userName) {
      logResponse(ASK_DOB_CONFIRM);
      return {
        assistantResponse: ASK_DOB_CONFIRM,
        metadata: updateState({}),
      };
    }
    const match = await verifyDobWithLLM({ fullName: userName, dob: userDob }, lastUser);
    if (match) {
      const pending: "book_flow" | "reschedule_flow" | "cancel_flow" =
        (pendingIntent as "book_flow" | "reschedule_flow" | "cancel_flow") ?? "book_flow";
      logResponse(CONFIRM_THEN_SERVICES);
      return {
        assistantResponse: CONFIRM_THEN_SERVICES,
        metadata: updateState({
          identity_confirmed: true,
          verify_step: null,
          current_flow: null,
          verify_next: pending,
          pending_intent_after_verify: null,
        }),
      };
    }
    const dobMismatchMsg = DOB_MISMATCH_TRY_PHONE + " " + ASK_PHONE;
    logResponse(dobMismatchMsg);
    return {
      assistantResponse: dobMismatchMsg,
      metadata: updateState({ verify_step: "ask_phone" }),
    };
  }

  if (verifyStep === "ask_phone") {
    const raw = extractPhoneDigits(lastUser);
    if (raw.length < 10) {
      logResponse(ASK_PHONE);
      return { assistantResponse: ASK_PHONE, metadata: updateState({}) };
    }
    const phone = raw.length === 10 ? raw : raw.slice(-10);
    try {
      const list = await getUsersByPhone(phone);
      if (list.length > 0) {
        const first = list[0];
        const userInfo = userFromLookup({ ...first, dob: first.dob });
        const userName = `${first.name.firstName} ${first.name.lastName}`;
        const pending: "book_flow" | "reschedule_flow" | "cancel_flow" =
          (pendingIntent as "book_flow" | "reschedule_flow" | "cancel_flow") ?? "book_flow";
        logResponse(CONFIRM_THEN_SERVICES);
        return {
          user_id: first.id,
          user: userInfo,
          assistantResponse: CONFIRM_THEN_SERVICES,
          metadata: updateState({
            user_id: first.id,
            user_name: userName,
            user_dob: first.dob ?? null,
            identity_confirmed: true,
            verify_step: null,
            current_flow: null,
            verify_next: pending,
            pending_intent_after_verify: null,
          }),
        };
      }
    } catch {
      // fall through
    }
    logResponse(NOT_FOUND_OFFER_REGISTER_OR_TRANSFER);
    return {
      assistantResponse: NOT_FOUND_OFFER_REGISTER_OR_TRANSFER,
      metadata: updateState({ verify_step: "offer_register_or_transfer" }),
    };
  }

  if (verifyStep === "offer_register_or_transfer") {
    if (isAffirmative(lastUser)) {
      const regMsg2 = "I'll help you register. One moment.";
      logResponse(regMsg2);
      return {
        assistantResponse: regMsg2,
        metadata: updateState({
          verify_step: null,
          current_flow: null,
          verify_next: "register",
          pending_intent_after_verify: null,
        }),
      };
    }
    logResponse(TRANSFER_LOCATE_RECORD);
    return {
      assistantResponse: TRANSFER_LOCATE_RECORD,
      metadata: updateState({
        verify_step: null,
        current_flow: null,
        verify_next: "transfer",
        should_transfer: true,
        transfer_to_agent: true,
        pending_intent_after_verify: null,
      }),
    };
  }

  logResponse(ASK_CURRENT_OR_FIRST);
  return {
    assistantResponse: ASK_CURRENT_OR_FIRST,
    metadata: updateState({
      current_flow: "verify_user",
      verify_step: "ask_current_or_first",
      pending_intent_after_verify: pendingIntent ?? "book_flow",
    }),
  };
}
