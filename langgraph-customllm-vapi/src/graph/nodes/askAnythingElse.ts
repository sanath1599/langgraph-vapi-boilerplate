import type { GraphState } from "../state.js";

export async function askAnythingElse(state: GraphState): Promise<Partial<GraphState>> {
  const msg = "Is there anything else I can help you with?";
  const now = new Date().toISOString();
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
            current_step: "ask_anything_else",
            next_action: "detect_intent",
          },
        }
      : undefined,
  };
}
