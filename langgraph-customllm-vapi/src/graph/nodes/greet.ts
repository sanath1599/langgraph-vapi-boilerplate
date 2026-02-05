import {
  greetPersonalized as greetPersonalizedVerbiage,
  GREET_GENERAL,
} from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

/**
 * Greet: personalized greeting; DOB confirmation happens in confirm_identity.
 */
export async function greetPersonalized(state: GraphState): Promise<Partial<GraphState>> {
  const name = state.metadata?.state?.user_name ?? state.user?.firstName ?? "there";
  const greeting = greetPersonalizedVerbiage(name);
  const now = new Date().toISOString();
  return {
    assistantResponse: greeting,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            current_step: "ask_are_you_name",
            next_action: "confirm_identity",
          },
        }
      : undefined,
  };
}

/**
 * General greeting when user not found: scheduling assistant.
 */
export async function greetGeneral(state: GraphState): Promise<Partial<GraphState>> {
  const greeting = GREET_GENERAL;
  const now = new Date().toISOString();
  return {
    assistantResponse: greeting,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            current_step: "greeted",
            next_action: "mention_services",
          },
        }
      : undefined,
  };
}
