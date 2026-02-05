import { getBookingRules } from "../../apiClient.js";
import { ANYTHING_ELSE } from "../../prompts/verbiage.js";
import type { GraphState } from "../state.js";

const DEFAULT_ORG_ID = 1;
const NODE = "org_info";

/**
 * Reply with organization hours (and location if available) from getBookingRules.
 */
export async function orgInfo(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const orgId = state.metadata?.state?.org_id ?? DEFAULT_ORG_ID;
  const now = new Date().toISOString();
  try {
    const rules = await getBookingRules(orgId);
    const hours = rules.workingHours ?? {};
    const lines = Object.entries(hours).map(
      ([day, range]) => `${day}: ${range.start} to ${range.end}`
    );
    const hoursText =
      lines.length > 0
        ? `Our hours are: ${lines.join(". ")}.`
        : "I don't have our current hours on hand.";
    const msg = `${hoursText} ${ANYTHING_ELSE}`;
    console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              org_id: orgId,
              current_step: "org_info",
              next_action: "end",
            },
          }
        : undefined,
    };
  } catch {
    const msg = `I couldn't fetch our hours right now. ${ANYTHING_ELSE}`;
    console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_step: "org_info",
              next_action: "end",
            },
          }
        : undefined,
    };
  }
}
