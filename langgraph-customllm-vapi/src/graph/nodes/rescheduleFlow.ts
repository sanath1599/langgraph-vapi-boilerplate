import {
  listAppointments,
  getRescheduleOptions,
  rescheduleAppointment,
} from "../../apiClient.js";
import {
  FIND_UPCOMING,
  WHEN_WORK_BETTER,
  oneAppt,
  multipleAppt,
  moveApptOffer,
  rescheduleDone,
  TOOL_RETRY,
  TRANSFER_STAFF,
} from "../../prompts/verbiage.js";
import {
  formatAvailabilityCondensedByDate,
  formatDatesInWordsBatch,
  formatSlotDateInWordsWithLLM,
} from "../formatSlotDate.js";
import { parseDateTime, dateFromMoment } from "../parseDateTime.js";
import {
  parseUserMentionedTimeToClosestSlot,
  findSlotClosestToStartTime,
} from "../parseSlotChoice.js";
import { parseOptionIndex } from "../parseOptionChoice.js";
import { matchAppointmentByDateTime } from "../llm.js";
import type { GraphState } from "../state.js";

const NODE = "reschedule_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

type SlotLike = { slotId: number; providerId: number; start: string; end: string };

/**
 * Reschedule flow: list appointments, offer new slots, reschedule on accept.
 */
export async function rescheduleFlow(state: GraphState): Promise<Partial<GraphState>> {
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
              current_flow: "reschedule",
              flow_data: { step: "list", started_at: now },
              current_step: "reschedule_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const flowData = inner?.flow_data ?? { step: "list", started_at: new Date().toISOString() };
  const appointments = inner?._cancellable_appointments ?? null;
  const selectedAppointmentId = inner?.selected_appointment_id ?? null;
  const slots = inner?._available_slots ?? null;
  const lastUser = [...state.messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
  const lastAssistant = [...(state.messages ?? [])].reverse().find((m) => m.role === "assistant")?.content?.trim() ?? "";
  const clinicTz = process.env.CLINIC_TIMEZONE ?? "UTC";
  const parseDateTimeContext = { timezoneIana: clinicTz, conversationContext: lastAssistant || null };

  if (flowData.step === "list" || !appointments?.length) {
    try {
      const list = await listAppointments({ userId, status: "upcoming" });
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
        text = "You have no upcoming appointments.";
      }
      const msg = list.length > 0
        ? `${FIND_UPCOMING} ${text} … Which one would you like to reschedule? Say the option number.`
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
                current_flow: "reschedule",
                flow_data: { step: "choose", started_at: flowData.started_at },
                current_step: "reschedule_flow",
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
                current_step: "reschedule_flow",
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
      try {
        const { slots: newSlots } = await getRescheduleOptions(appt.id, {});
        const now = new Date().toISOString();
        const slotText = await formatAvailabilityCondensedByDate(newSlots, clinicTz);
        const msg = `New times: ${slotText} Which slot would you like? Say the number (1 for the first, 2 for the second) or say the date and time, for example February 5th at 3pm.`;
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
                  _available_slots: newSlots,
                  current_flow: "reschedule",
                  flow_data: { step: "offer_slots", started_at: flowData.started_at },
                  current_step: "reschedule_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const now = new Date().toISOString();
        const response = `Sorry: ${errMsg}.`;
        logResponse(response);
        return {
          assistantResponse: response,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  last_error: errMsg,
                  current_flow: "reschedule",
                  flow_data: flowData,
                  current_step: "reschedule_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
    }
  }

  // Have appointment selected but no slots yet (e.g. switched from cancel confirmation) — fetch and offer slots.
  if (selectedAppointmentId && (!slots || slots.length === 0)) {
    try {
      const { slots: newSlots } = await getRescheduleOptions(selectedAppointmentId, {});
      const now = new Date().toISOString();
      const slotText = await formatAvailabilityCondensedByDate(newSlots, clinicTz);
      const msg = `New times: ${slotText} Which slot would you like? Say the number (1 for the first, 2 for the second) or say the date and time, for example February 5th at 3pm.`;
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                _available_slots: newSlots,
                current_flow: "reschedule",
                flow_data: { step: "offer_slots", started_at: flowData.started_at },
                current_step: "reschedule_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      const response = `Sorry: ${errMsg}.`;
      logResponse(response);
      return {
        assistantResponse: response,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                last_error: errMsg,
                current_flow: "reschedule",
                flow_data: flowData,
                current_step: "reschedule_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  if (selectedAppointmentId && slots?.length) {
    const slotsList = slots as Array<{ slotId: number; providerId: number; start: string; end: string }>;
    const selectedSlotId = inner?.selected_slot_id ?? null;
    const userConfirmed = lastUser.includes("yes") || lastUser.includes("confirm");

    let slot: (typeof slotsList)[0] | null = null;
    if (selectedSlotId && userConfirmed) {
      slot = slotsList.find((s) => s.slotId === selectedSlotId) ?? null;
    }
    if (!slot) {
      const optionMatch = lastUser.match(/option\s*(\d+)|(\d+)/);
      const idx = optionMatch ? parseInt(optionMatch[1] ?? optionMatch[2], 10) - 1 : -1;
      slot = idx >= 0 && idx < slotsList.length ? slotsList[idx] : null;
      if (slot) {
        console.log("[time-slot] rescheduleFlow step=optionMatch chosenByIndex=true idx=" + idx + " slotId=" + slot.slotId + " start=" + slot.start);
      } else {
        console.log("[time-slot] rescheduleFlow step=optionMatch chosenByIndex=false idx=" + idx + " slotsLength=" + slotsList.length);
      }
    }
    if (!slot && slotsList.length > 0) {
      slot = await parseUserMentionedTimeToClosestSlot(lastUser, slotsList, parseDateTimeContext);
      if (slot) {
        console.log("[time-slot] rescheduleFlow step=parseUserMentionedTimeToClosestSlot chosenSlot slotId=" + slot.slotId + " start=" + slot.start);
      } else {
        console.log("[time-slot] rescheduleFlow step=parseUserMentionedTimeToClosestSlot chosenSlot=null");
      }
    }

    if (!slot && slotsList.length > 0) {
      const dateParsed = await parseDateTime(lastUser, parseDateTimeContext);
      if (dateParsed?.kind === "moment" && selectedAppointmentId) {
        console.log("[time-slot] rescheduleFlow step=momentFetch dateParsed.isoUtc=" + dateParsed.isoUtc + " fetching reschedule options then findSlotClosestToStartTime");
        try {
          const date = dateFromMoment(dateParsed, { timezoneIana: clinicTz });
          const { slots: newSlots } = await getRescheduleOptions(selectedAppointmentId, {
            preferredDateRange: { from: date, to: date },
          });
          console.log("[time-slot] rescheduleFlow step=momentFetch getRescheduleOptions returned slots=" + newSlots.length);
          if (newSlots.length > 0) {
            slot = findSlotClosestToStartTime(newSlots, dateParsed.isoUtc) as SlotLike | null;
            if (slot) {
              console.log("[time-slot] rescheduleFlow step=momentFetch findSlotClosestToStartTime chosen slotId=" + slot.slotId + " start=" + slot.start);
            } else {
              console.log("[time-slot] rescheduleFlow step=momentFetch findSlotClosestToStartTime chosenSlot=null");
            }
            if (slot) {
              const now = new Date().toISOString();
              const dateWords = await formatSlotDateInWordsWithLLM(slot.start, clinicTz);
              const confirmMsg = `Got it, ${dateWords}. Confirm to reschedule?`;
              logResponse(confirmMsg);
              return {
                assistantResponse: confirmMsg,
                metadata: state.metadata
                  ? {
                      ...state.metadata,
                      last_updated: now,
                      state: {
                        ...state.metadata.state,
                        _available_slots: newSlots,
                        selected_slot_id: slot.slotId,
                        current_flow: "reschedule",
                        flow_data: { step: "confirm", started_at: flowData.started_at },
                        current_step: "reschedule_flow",
                        next_action: "ask_anything_else",
                      },
                    }
                  : undefined,
              };
            }
            const now = new Date().toISOString();
            const slotText = await formatAvailabilityCondensedByDate(newSlots, clinicTz);
            const availMsg = `We have availability on that day. ${slotText} Which slot would you like? Say the number or the time.`;
            logResponse(availMsg);
            return {
              assistantResponse: availMsg,
              metadata: state.metadata
                ? {
                    ...state.metadata,
                    last_updated: now,
                    state: {
                      ...state.metadata.state,
                      _available_slots: newSlots,
                      current_flow: "reschedule",
                      flow_data: flowData,
                      current_step: "reschedule_flow",
                      next_action: "ask_anything_else",
                    },
                  }
                : undefined,
            };
          }
        } catch {
          // fall through
        }
      }
    }

    if (slot && userConfirmed) {
      try {
        await rescheduleAppointment(selectedAppointmentId, { newSlotId: slot.slotId });
        const now = new Date().toISOString();
        const msg = "Your appointment has been rescheduled. Is there anything else?";
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
                  selected_slot_id: null,
                  _available_slots: null,
                  _cancellable_appointments: null,
                  current_flow: null,
                  flow_data: null,
                  current_step: "reschedule_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const now = new Date().toISOString();
        const errResponse = `Sorry, we couldn't reschedule: ${errMsg}.`;
        logResponse(errResponse);
        return {
          assistantResponse: errResponse,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  last_error: errMsg,
                  current_flow: "reschedule",
                  flow_data: flowData,
                  current_step: "reschedule_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
    }

    if (slot && !userConfirmed) {
      const dateWords = await formatSlotDateInWordsWithLLM(slot.start, clinicTz);
      const now = new Date().toISOString();
      const confirmMsg2 = `Got it, ${dateWords}. Confirm to reschedule?`;
      logResponse(confirmMsg2);
      return {
        assistantResponse: confirmMsg2,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                selected_slot_id: slot.slotId,
                current_flow: "reschedule",
                flow_data: { step: "confirm", started_at: flowData.started_at },
                current_step: "reschedule_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  const msg = "Which slot would you like? Say the number (1 or 2) or the date and time, for example February 5th at 3pm.";
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
            current_flow: "reschedule",
            flow_data: flowData,
            current_step: "reschedule_flow",
            next_action: "ask_anything_else",
          },
        }
      : undefined,
  };
}
