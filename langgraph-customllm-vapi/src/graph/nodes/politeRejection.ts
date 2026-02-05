import type { GraphState } from "../state.js";

const NODE = "polite_rejection";

export async function politeRejection(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const msg =
    "I'm sorry, this line is for appointments only. For other inquiries, please visit our website or call back during business hours. Goodbye.";
  const now = new Date().toISOString();
  const rejectionCount = (state.metadata?.state?.rejection_count ?? 0) + 1;
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
  return {
    assistantResponse: msg,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            rejection_count: rejectionCount,
            conversation_ended: true,
            call_ended: true,
            current_step: "polite_rejection",
            next_action: "end",
          },
        }
      : undefined,
  };
}
