import { getUsersByPhone } from "../../apiClient.js";
import { userFromLookup, type GraphState } from "../state.js";

/**
 * Lookup user by normalized VAPI caller ID only. Do not use phone from user speech.
 */
export async function lookup(state: GraphState): Promise<Partial<GraphState>> {
  const phone = state.metadata?.state?.normalized_phone ?? state.rawCallerPhone ?? null;
  if (!phone) {
    const now = new Date().toISOString();
    return {
      user_id: null,
      user: null,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              user_id: null,
              user_name: null,
              is_registered: false,
              current_step: "lookup",
              next_action: "greet_general",
            },
          }
        : undefined,
    };
  }
  try {
    const users = await getUsersByPhone(phone);
    const first = users[0] ?? null;
    const userInfo = first ? userFromLookup({ ...first, dob: first.dob }) : null;
    const userName = first ? `${first.name.firstName} ${first.name.lastName}` : null;
    const userDob = first?.dob ?? null;
    const now = new Date().toISOString();
    return {
      user_id: first?.id ?? null,
      user: userInfo,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              user_id: first?.id ?? null,
              user_name: userName,
              user_dob: userDob,
              is_registered: !!first,
              current_step: "looked_up",
              next_action: first ? "greet_personalized" : "greet_general",
            },
          }
        : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    return {
      user_id: null,
      user: null,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              user_id: null,
              user_name: null,
              is_registered: false,
              last_error: msg,
              failure_count: (state.metadata.state.failure_count ?? 0) + 1,
              current_step: "lookup",
              next_action: "greet_general",
            },
          }
        : undefined,
    };
  }
}
