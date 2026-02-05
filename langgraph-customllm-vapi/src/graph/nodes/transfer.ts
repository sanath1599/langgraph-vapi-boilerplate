import { TRANSFER_STAFF } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

const NODE = "transfer";

export async function transfer(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const msg = TRANSFER_STAFF;
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
            transfer_to_agent: true,
            should_transfer: true,
            current_step: "transfer",
            next_action: "end",
          },
        }
      : undefined,
  };
}
