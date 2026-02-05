import { getCancelOptions, cancelAppointment } from "../../apiClient.js";
import {
  SURE_CANCEL,
  CANCEL_DONE,
  TOOL_RETRY,
  TRANSFER_STAFF,
} from "../../prompts/verbiage.js";
import { formatDatesInWordsBatch } from "../formatSlotDate.js";
import { parseOptionIndex } from "../parseOptionChoice.js";
import { matchAppointmentByDateTime } from "../llm.js";
import type { GraphState } from "../state.js";

const NODE = "cancel_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

/**
 * Cancel flow: list cancel-options, confirm, then cancel.
 */
export async function cancelFlow(state: GraphState): Promise<Partial<GraphState>> {
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
            state: {
              ...state.metadata.state,
              current_flow: "cancel",
              flow_data: { step: "list", started_at: now },
              current_step: "cancel_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const flowData = inner?.flow_data ?? { step: "list", started_at: new Date().toISOString() };
  const appointments = inner?._cancellable_appointments ?? null;
  const selectedAppointmentId = inner?.selected_appointment_id ?? null;
  const lastUser = [...state.messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
  const clinicTz = process.env.CLINIC_TIMEZONE ?? "UTC";

  if (flowData.step === "list" || !appointments?.length) {
    try {
      const list = await getCancelOptions(userId);
      const now = new Date().toISOString();
      let text: string;
      if (list.length > 0) {
        const starts = list.map((a) => (a as { start?: string }).start ?? "");
        const phrases = await formatDatesInWordsBatch(starts, clinicTz);
        text = list
          .map(
            (a, i) =>
              `Option ${i + 1}: ${(a as { providerName?: string }).providerName} on ${phrases[i] ?? starts[i]}.`
          )
          .join(" … Next, ");
      } else {
        text = "You have no upcoming appointments to cancel.";
      }
      const msg = list.length > 0
        ? `Your upcoming appointments: ${text} … Which one would you like to cancel? Say the option number.`
        : text;
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                _cancellable_appointments: list,
                current_flow: "cancel",
                flow_data: { step: "choose", started_at: flowData.started_at },
                current_step: "cancel_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      const failureCount = state.metadata?.state?.failure_count ?? 0;
      const assistantResponse =
        failureCount === 0 ? TOOL_RETRY : TRANSFER_STAFF;
      logResponse(assistantResponse);
      return {
        assistantResponse,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                last_error: errMsg,
                failure_count: failureCount + 1,
                current_flow: null,
                flow_data: null,
                current_step: "cancel_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  if (!selectedAppointmentId && appointments?.length) {
    const appointmentsList = appointments as Array<{ id?: number; providerName?: string; start?: string }>;
    let appt: { id?: number } | null = null;
    const idx = parseOptionIndex(lastUser);
    if (idx >= 0 && idx < appointmentsList.length) {
      appt = appointmentsList[idx] ?? null;
    }
    if (!appt?.id) {
      const starts = appointmentsList.map((a) => a.start ?? "");
      const phrases = await formatDatesInWordsBatch(starts, clinicTz);
      const withClinicTime = appointmentsList.map((a, i) => ({
        id: a.id!,
        providerName: a.providerName,
        dateTime: phrases[i] ?? starts[i],
      }));
      const matchedId = await matchAppointmentByDateTime(lastUser, withClinicTime);
      if (matchedId != null) {
        appt = appointmentsList.find((a) => a.id === matchedId) ?? null;
      }
    }
    if (appt?.id) {
      const now = new Date().toISOString();
      const msg = SURE_CANCEL;
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                selected_appointment_id: appt.id,
                current_flow: "cancel",
                flow_data: { step: "confirm", started_at: flowData.started_at },
                current_step: "cancel_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  // Have selected appointment but not yet at cancel confirmation (e.g. switched from reschedule) — show confirm and pass selection through.
  if (selectedAppointmentId && flowData.step !== "confirm") {
    const now = new Date().toISOString();
    const msg = SURE_CANCEL;
    logResponse(msg);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              selected_appointment_id: selectedAppointmentId,
              current_flow: "cancel",
              flow_data: { step: "confirm", started_at: flowData.started_at ?? now },
              current_step: "cancel_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  // At confirmation step, "no" / "never mind" = don't cancel — clear selection and offer to help with something else.
  if (flowData.step === "confirm" && selectedAppointmentId && (lastUser.includes("no") || lastUser.includes("never mind") || lastUser.includes("don't") || lastUser.includes("actually no"))) {
    const now = new Date().toISOString();
    const msg = "No problem, your appointment is still scheduled. Is there anything else I can help with?";
    logResponse(msg);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              selected_appointment_id: null,
              current_flow: null,
              flow_data: null,
              current_step: "cancel_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  if (selectedAppointmentId && (lastUser.includes("yes") || lastUser.includes("confirm"))) {
    try {
      await cancelAppointment(selectedAppointmentId, { confirmed: true });
      const now = new Date().toISOString();
      const msg = CANCEL_DONE;
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                selected_appointment_id: null,
                _cancellable_appointments: null,
                current_flow: null,
                flow_data: null,
                current_step: "cancel_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      const errResponse = `Sorry, we couldn't cancel: ${msg}.`;
      logResponse(errResponse);
      return {
        assistantResponse: errResponse,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                last_error: msg,
                current_flow: "cancel",
                flow_data: flowData,
                current_step: "cancel_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  const msg = "Which appointment would you like to cancel? Say the option number, or say no to go back.";
  const now = new Date().toISOString();
  logResponse(msg);
  return {
    assistantResponse: msg,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            current_flow: "cancel",
            flow_data: flowData,
            current_step: "cancel_flow",
            next_action: "ask_anything_else",
          },
        }
      : undefined,
  };
}
