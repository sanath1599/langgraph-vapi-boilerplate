import { listAppointments } from "../../apiClient.js";
import { YOUR_UPCOMING_APPOINTMENTS, NO_UPCOMING_APPOINTMENTS, ANYTHING_ELSE, TOOL_RETRY, TRANSFER_STAFF } from "../../prompts/verbiage.js";
import { formatDatesInWordsBatch } from "../formatSlotDate.js";
import type { GraphState } from "../state.js";

const NODE = "get_appointments_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

/**
 * Get appointments flow: list upcoming appointments for the user, then ask anything else.
 * Requires user to be looked up (if not, intent routes to verify_flow first).
 */
export async function getAppointmentsFlow(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const inner = state.metadata?.state;
  const userId = state.user_id ?? inner?.user_id;

  if (!userId) {
    const msg = "I need to look you up first. Are you calling from your registered phone number?";
    logResponse(msg);
    const now = new Date().toISOString();
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_step: "get_appointments_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const clinicTz = process.env.CLINIC_TIMEZONE ?? "UTC";

  try {
    const list = await listAppointments({ userId, status: "upcoming" });
    const now = new Date().toISOString();
    let msg: string;
    if (list.length > 0) {
      const starts = list.map((a) => (a as { start?: string }).start ?? "");
      const phrases = await formatDatesInWordsBatch(starts, clinicTz);
      const text = list
        .map(
          (a, i) =>
            `${i + 1}. ${(a as { providerName?: string }).providerName} on ${phrases[i] ?? starts[i]}.`
        )
        .join(" ");
      msg = `${YOUR_UPCOMING_APPOINTMENTS} ${text} ${ANYTHING_ELSE}`;
    } else {
      msg = `${NO_UPCOMING_APPOINTMENTS} ${ANYTHING_ELSE}`;
    }
    logResponse(msg);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              current_step: "get_appointments_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const failureCount = state.metadata?.state?.failure_count ?? 0;
    const msg = failureCount === 0 ? TOOL_RETRY : TRANSFER_STAFF;
    logResponse(msg);
    const now = new Date().toISOString();
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              last_error: errMsg,
              failure_count: failureCount + 1,
              current_step: "get_appointments_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }
}
