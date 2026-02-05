import { EMERGENCY_911 } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

const NODE = "advise_911";

/**
 * PrimaryRules: Do NOT book; end call after emergency instruction. Do not ask "anything else".
 */
export async function advise911(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const now = new Date().toISOString();
  const msg = EMERGENCY_911;
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
  return {
    assistantResponse: msg,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            is_emergency: true,
            conversation_ended: true,
            call_ended: true,
            current_step: "advise_911",
            next_action: "end",
          },
        }
      : undefined,
  };
}
