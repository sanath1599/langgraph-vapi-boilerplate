import { IDENTITY_FAILED_GOODBYE } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

/**
 * End the call when identity verification fails (after offering register/transfer).
 */
export async function identityFailedEnd(state: GraphState): Promise<Partial<GraphState>> {
  const msg = IDENTITY_FAILED_GOODBYE;
  const now = new Date().toISOString();
  return {
    assistantResponse: msg,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            conversation_ended: true,
            call_ended: true,
            current_step: "identity_failed_end",
            next_action: "end",
          },
        }
      : undefined,
  };
}
