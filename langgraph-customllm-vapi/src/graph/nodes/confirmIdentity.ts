import {
  ASK_DOB_CONFIRM,
  DOB_VERIFY_FAIL_TRANSFER,
  CONFIRM_THEN_SERVICES,
} from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";
import { verifyDobWithLLM } from "../llm.js";

function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yeah|yep|yup|sure|correct|that'?s?\s*me|that'?s?\s*right|i\s*am|it'?s?\s*me)$/.test(t) || /^yes\b/.test(t);
}

/**
 * Confirm identity: if step is ask_are_you_name, check yes/no or DOB (user may say DOB directly); if ask_dob, verify DOB.
 * On second wrong DOB, set identity_failed_end and respond with goodbye.
 */
export async function confirmIdentity(state: GraphState): Promise<Partial<GraphState>> {
  const inner = state.metadata?.state;
  const step = inner?.current_step ?? "";
  const userDob = inner?.user_dob ?? state.user?.dob ?? null;
  const lastUser = [...state.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  const now = new Date().toISOString();
  const fullName =
    inner?.user_name ??
    (state.user ? `${state.user.firstName} ${state.user.lastName}`.trim() : null) ??
    "the user";

  if (step === "ask_are_you_name") {
    if (isAffirmative(lastUser)) {
      return {
        assistantResponse: ASK_DOB_CONFIRM,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                current_step: "ask_dob",
                dob_attempt_count: 0,
                next_action: "confirm_identity",
              },
            }
          : undefined,
      };
    }
    // User didn't say "yes" — they may have said their DOB directly
    if (userDob && lastUser.trim().length > 0) {
      const match = await verifyDobWithLLM({ fullName, dob: userDob }, lastUser);
      if (match) {
        return {
          assistantResponse: CONFIRM_THEN_SERVICES,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  identity_confirmed: true,
                  current_step: "mention_services",
                  next_action: "detect_intent",
                },
              }
            : undefined,
        };
      }
      // DOB didn't match — we already identified by caller ID (greeted by name); don't ask phone, transfer
      return {
        assistantResponse: DOB_VERIFY_FAIL_TRANSFER,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                identity_offer_register_or_transfer: "no",
                next_action: "transfer",
              },
            }
          : undefined,
      };
    }
    return {
      assistantResponse: CONFIRM_THEN_SERVICES,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_step: "mention_services",
              next_action: "detect_intent",
            },
          }
        : undefined,
    };
  }

  if (step === "ask_dob") {
    const match =
      userDob &&
      fullName &&
      lastUser.trim().length > 0 &&
      (await verifyDobWithLLM({ fullName, dob: userDob }, lastUser));

    if (match) {
      return {
        assistantResponse: CONFIRM_THEN_SERVICES,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                identity_confirmed: true,
                current_step: "mention_services",
                next_action: "detect_intent",
              },
            }
          : undefined,
      };
    }

    // DOB didn't match — we already identified by caller ID; don't ask phone, transfer
    return {
      assistantResponse: DOB_VERIFY_FAIL_TRANSFER,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              identity_offer_register_or_transfer: "no",
              next_action: "transfer",
            },
          }
        : undefined,
    };
  }

  return {
    assistantResponse: CONFIRM_THEN_SERVICES,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            current_step: "mention_services",
            next_action: "detect_intent",
          },
        }
      : undefined,
  };
}
