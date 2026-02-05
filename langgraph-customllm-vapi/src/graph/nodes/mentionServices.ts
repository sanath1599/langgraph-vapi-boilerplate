import { MENTION_SERVICES } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

/**
 * Mention services (already included in greet). This node ensures step is set and response is complete.
 */
export async function mentionServices(state: GraphState): Promise<Partial<GraphState>> {
  const existing = state.assistantResponse?.trim();
  const message = existing || MENTION_SERVICES;
  const now = new Date().toISOString();
  return {
    assistantResponse: message,
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
