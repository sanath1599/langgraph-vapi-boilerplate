import { CLOSE_EN, CLOSE_ZH } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

const NODE = "thanks_end";

export async function thanksEnd(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const msg = `${CLOSE_EN} ${CLOSE_ZH}`;
  const now = new Date().toISOString();
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
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
            current_step: "thanks_end",
            next_action: "end",
          },
        }
      : undefined,
  };
}
