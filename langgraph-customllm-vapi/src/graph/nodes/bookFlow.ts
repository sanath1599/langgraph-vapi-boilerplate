import {
  getAvailability,
  getBookingRules,
  createAppointment,
  type Slot,
} from "../../apiClient.js";
import {
  NO_OPENINGS_TRY_OTHER_DAY,
  TOOL_RETRY,
  BOOK_INSTRUCTIONS_BC_CARD,
  BOOK_INSTRUCTIONS_PHONE,
  BOOK_INSTRUCTIONS_FASTING,
  singleSlotOffer,
  confirmSlotWithUser,
} from "../../prompts/verbiage.js";
import {
  formatAvailabilityCondensedByDate,
  formatSlotDateInWordsWithLLM,
} from "../formatSlotDate.js";
import { addDaysToDate, dateInTimezone } from "../timezoneHelpers.js";
import {
  parseDateTime,
  getAvailabilityParamsFromParsed,
  dateFromMoment,
} from "../parseDateTime.js";
import {
  parseUserMentionedTimeToClosestSlot,
  findSlotClosestToStartTime,
} from "../parseSlotChoice.js";
import type { GraphState } from "../state.js";

const DEFAULT_ORG_ID = 1;
const NODE = "book_flow";

function logResponse(msg: string): void {
  console.log(`[graph][node] ${NODE} response: "${(msg ?? "").slice(0, 100)}${(msg?.length ?? 0) > 100 ? "…" : ""}"`);
}

/**
 * Book flow: ensure user, get availability, offer slot, create on accept.
 */
export async function bookFlow(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`[graph][node] ${NODE} triggered`);
  const inner = state.metadata?.state;
  const userId = state.user_id ?? inner?.user_id;
  if (!userId) {
    const msg = "I need to look you up first. Are you calling from your registered phone number? If not, please register first.";
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
              current_flow: "booking",
              flow_data: { step: "check", started_at: now },
              current_step: "book_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  const organizationId = inner?.org_id ?? DEFAULT_ORG_ID;
  const flowData = inner?.flow_data ?? { step: "check", started_at: new Date().toISOString() };
  const slots = inner?._available_slots ?? null;
  const lastUser = [...state.messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";

  const clinicTz = process.env.CLINIC_TIMEZONE ?? "UTC";
  const lastAssistant = [...(state.messages ?? [])].reverse().find((m) => m.role === "assistant")?.content?.trim() ?? "";
  const dateParsed = await parseDateTime(lastUser, {
    timezoneIana: clinicTz,
    conversationContext: lastAssistant || null,
  });
  const availabilityParams = { organizationId, ...getAvailabilityParamsFromParsed(dateParsed, { timezoneIana: clinicTz }) };
  console.log("[time-slot] bookFlow step=availabilityParams dateParsed=" + (dateParsed ? JSON.stringify(dateParsed) : "null") + " availabilityParams=" + JSON.stringify(availabilityParams));

  if (flowData.step === "check" || !slots?.length) {
    try {
      await getBookingRules(organizationId);
      const slotList = await getAvailability(availabilityParams);
      const now = new Date().toISOString();

      if (slotList.length === 1) {
        const onlySlot = slotList[0] as Slot;
        const dateWords = await formatSlotDateInWordsWithLLM(onlySlot.start);
        const msg = singleSlotOffer(dateWords);
        logResponse(msg);
        return {
          assistantResponse: msg,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: organizationId,
                  _available_slots: slotList,
                  selected_slot_id: onlySlot.slotId,
                  current_flow: "booking",
                  flow_data: { step: "confirm", started_at: flowData.started_at },
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }

      const slotText = await formatAvailabilityCondensedByDate(slotList, clinicTz);
      const msg = `We have availability. ${slotText} Which slot would you like? Say the number (1 for the first, 2 for the second) or say the date and time, for example February 5th at 3pm or tomorrow at 10am. Or say "next week" for more dates.`;
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                org_id: organizationId,
                _available_slots: slotList,
                current_flow: "booking",
                flow_data: { step: "offer_slots", started_at: flowData.started_at },
                current_step: "book_flow",
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
        failureCount === 0 ? TOOL_RETRY : "Let me transfer you to our staff who can help.";
      return {
        assistantResponse,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                last_error: errMsg,
                failure_count: (state.metadata.state.failure_count ?? 0) + 1,
                current_flow: "booking",
                flow_data: { step: "check", started_at: flowData.started_at },
                current_step: "book_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    }
  }

  const selectedSlotId = inner?.selected_slot_id ?? null;
  if (selectedSlotId) {
    const slot = (slots as Slot[]).find((s) => s.slotId === selectedSlotId);
    const looksLikeConfirmation =
      lastUser.includes("yes") || lastUser.includes("confirm") || lastUser.includes("book");
    const userRequestedDifferentDateTime =
      dateParsed?.kind === "moment" &&
      (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(st|nd|rd|th)?\b/i.test(lastUser) ||
        /\d{1,2}\s*(am|pm|:)/i.test(lastUser) ||
        /\b(morning|afternoon|evening)\b/i.test(lastUser));
    if (
      slot &&
      looksLikeConfirmation &&
      !userRequestedDifferentDateTime
    ) {
      try {
        const result = await createAppointment({
          userId,
          organizationId,
          providerId: slot.providerId,
          visitType: "follow_up",
          slotId: slot.slotId,
        });
        const now = new Date().toISOString();
        const dateWords = await formatSlotDateInWordsWithLLM(result.start);
        const visitType = inner?.visit_type ?? inner?.appointment_type ?? "follow_up";
        const successMsg =
          `You're all set! Your appointment is confirmed for ${dateWords}. ` + BOOK_INSTRUCTIONS_BC_CARD;
        const withFasting =
          visitType === "3" || (inner?.reason_text ?? "").toLowerCase().includes("physical")
            ? " " + BOOK_INSTRUCTIONS_FASTING
            : "";
        const withPhone =
          inner?.visit_type === "phone" ? " " + BOOK_INSTRUCTIONS_PHONE : "";
        const createdMsg = successMsg + withFasting + withPhone;
        logResponse(createdMsg);
        return {
          assistantResponse: createdMsg,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  _available_slots: null,
                  selected_slot_id: null,
                  current_flow: null,
                  flow_data: null,
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const now = new Date().toISOString();
        logResponse(TOOL_RETRY);
        return {
          assistantResponse: TOOL_RETRY,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  last_error: errMsg,
                failure_count: (state.metadata.state.failure_count ?? 0) + 1,
                current_flow: "booking",
                flow_data: flowData,
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
    }
  }

  // Try to match user's message to a slot from the CURRENT list first (so "6th February 1:30 am" confirms that slot, not a refetch for another day).
  // Prefer time-based match when the utterance parses as a date/time so we don't treat "4" in "4 30 am" or "5" in "5th" as option numbers.
  // When user requested a specific date (dateParsed.kind === "moment") and current slots are for a different day, don't match from current list — refetch for the requested date below.
  let chosenSlot: Slot | null = null;
  const requestedDate =
    dateParsed?.kind === "moment"
      ? dateFromMoment(dateParsed, { timezoneIana: clinicTz })
      : null;
  const currentSlotsAreForRequestedDate =
    !requestedDate ||
    !slots?.length ||
    (slots.length > 0 && dateInTimezone((slots as Slot[])[0].start, clinicTz) === requestedDate);

  if (slots && slots.length > 0 && currentSlotsAreForRequestedDate) {
    const hasAmPm = /\b(am|pm)\b/i.test(lastUser);
    const hasTimeWord = /\b(morning|afternoon|evening|o'clock)\b/i.test(lastUser);
    const hasColonTime = /\d{1,2}\s*:\s*\d{2}/.test(lastUser);
    const hasMonthDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(st|nd|rd|th)?\b/i.test(lastUser);
    const hasWeekday = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lastUser);
    const hasDigitSpaceDigit = /\d{1,2}\s+\d{1,2}(\s|$)/.test(lastUser);
    const looksLikeDateTime = hasAmPm || hasTimeWord || hasColonTime || hasMonthDate || hasWeekday || hasDigitSpaceDigit;

    console.log(
      "[time-slot] bookFlow slotMatch lastUser=" + JSON.stringify(lastUser) +
      " len=" + lastUser.length +
      " dateParsedKind=" + (dateParsed?.kind ?? "null") +
      " looksLikeDateTime=" + looksLikeDateTime +
      " (amPm=" + hasAmPm + " monthDate=" + hasMonthDate + " digitSpaceDigit=" + hasDigitSpaceDigit + ")"
    );

    if (dateParsed?.kind === "moment" && looksLikeDateTime) {
      chosenSlot = await parseUserMentionedTimeToClosestSlot(lastUser, slots as Slot[], {
        timezoneIana: clinicTz,
      });
      if (chosenSlot) {
        console.log("[time-slot] bookFlow step=timeMatch (preferred) chosenSlot slotId=" + chosenSlot.slotId + " start=" + chosenSlot.start + " targetIso=" + (dateParsed.kind === "moment" ? dateParsed.isoUtc : ""));
      } else {
        console.log("[time-slot] bookFlow step=timeMatch (preferred) parseUserMentionedTimeToClosestSlot returned null");
      }
    }
    if (!chosenSlot) {
      const optionMatch = lastUser.trim().match(/^(?:option\s*)?(\d+)$/);
      const idx = optionMatch ? (parseInt(optionMatch[1], 10) - 1) : -1;
      chosenSlot = idx >= 0 && idx < slots.length ? (slots as Slot[])[idx] : null;
      if (chosenSlot) {
        console.log("[time-slot] bookFlow step=optionMatch chosenByIndex=true idx=" + idx + " (1-based=" + (idx + 1) + ") slotId=" + chosenSlot.slotId + " start=" + chosenSlot.start);
      } else {
        console.log("[time-slot] bookFlow step=optionMatch chosenByIndex=false optionMatch=" + (optionMatch ? optionMatch[0] : "null") + " idx=" + idx + " slotsLength=" + slots.length);
        chosenSlot = await parseUserMentionedTimeToClosestSlot(lastUser, slots as Slot[], {
          timezoneIana: clinicTz,
        });
        if (chosenSlot) {
          console.log("[time-slot] bookFlow step=parseUserMentionedTimeToClosestSlot (fallback) chosenSlot slotId=" + chosenSlot.slotId + " start=" + chosenSlot.start);
        } else {
          console.log("[time-slot] bookFlow step=parseUserMentionedTimeToClosestSlot (fallback) chosenSlot=null");
        }
      }
    }
  }

  // If we found a slot from the existing list, confirm that one (refetch for freshness then confirm) — don't refetch by date and show a new list.
  if (chosenSlot) {
    const now = new Date().toISOString();
    const slotDate = chosenSlot.start.slice(0, 10);
    let refetchedList: Slot[] = [];
    try {
      await getBookingRules(organizationId);
      refetchedList = await getAvailability({
        organizationId,
        fromDate: slotDate,
        toDate: slotDate,
      });
    } catch {
      // use in-memory slot if refetch fails
    }
    const refetchedSlot =
      refetchedList.length > 0
        ? (refetchedList as Slot[]).find((s) => s.slotId === chosenSlot!.slotId) ?? chosenSlot
        : chosenSlot;
    const slotToConfirm = refetchedSlot;
    const dateWords = await formatSlotDateInWordsWithLLM(slotToConfirm.start);
    const msg = confirmSlotWithUser(dateWords);
    logResponse(msg);
    const storedSlots = refetchedList.length > 0 ? refetchedList : (slots as Slot[]);
    return {
      assistantResponse: msg,
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              _available_slots: storedSlots,
              selected_slot_id: slotToConfirm.slotId,
              current_flow: "booking",
              flow_data: { step: "confirm", started_at: flowData.started_at },
              current_step: "book_flow",
              next_action: "ask_anything_else",
            },
          }
        : undefined,
    };
  }

  // Only refetch by date when user did NOT pick a slot from the current list (e.g. said "next week" or a different day).
  if (flowData.step === "offer_slots" && dateParsed) {
    try {
      await getBookingRules(organizationId);
      const slotList = await getAvailability(availabilityParams);
      const now = new Date().toISOString();
      if (slotList.length === 0) {
        logResponse(NO_OPENINGS_TRY_OTHER_DAY);
        return {
          assistantResponse: NO_OPENINGS_TRY_OTHER_DAY,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: organizationId,
                  _available_slots: slotList,
                  current_flow: "booking",
                  flow_data: { step: "offer_slots", started_at: flowData.started_at },
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
      if (slotList.length === 1) {
        const onlySlot = slotList[0] as Slot;
        const dateWords = await formatSlotDateInWordsWithLLM(onlySlot.start);
        const singleMsg = singleSlotOffer(dateWords);
        logResponse(singleMsg);
        return {
          assistantResponse: singleMsg,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: organizationId,
                  _available_slots: slotList,
                  selected_slot_id: onlySlot.slotId,
                  current_flow: "booking",
                  flow_data: { step: "confirm", started_at: flowData.started_at },
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
      const slotText = await formatAvailabilityCondensedByDate(slotList, clinicTz);
      const msg = "Here's availability. " + slotText + " Which slot would you like? Say the number (1 for the first, 2 for the second) or say the date and time, for example February 5th at 3pm.";
      logResponse(msg);
      return {
        assistantResponse: msg,
        metadata: state.metadata
          ? {
              ...state.metadata,
              last_updated: now,
              state: {
                ...state.metadata.state,
                org_id: organizationId,
                _available_slots: slotList,
                current_flow: "booking",
                flow_data: { step: "offer_slots", started_at: flowData.started_at },
                current_step: "book_flow",
                next_action: "ask_anything_else",
              },
            }
          : undefined,
      };
    } catch {
      // fall through to "Which option would you like?"
    }
  }

  if (!chosenSlot && slots.length > 0 && dateParsed?.kind === "moment") {
    console.log("[time-slot] bookFlow step=momentFetch dateParsed.isoUtc=" + dateParsed.isoUtc + " fetching availability for date then findSlotClosestToStartTime");
    try {
      await getBookingRules(organizationId);
      const date = dateFromMoment(dateParsed, { timezoneIana: clinicTz });
      const newSlots = await getAvailability({
        organizationId,
        fromDate: date,
        toDate: date,
      });
      console.log("[time-slot] bookFlow step=momentFetch getAvailability returned slots=" + newSlots.length);
      if (newSlots.length > 0) {
        const slotList = newSlots as Slot[];
        chosenSlot = findSlotClosestToStartTime(slotList, dateParsed.isoUtc);
        if (chosenSlot) {
          console.log("[time-slot] bookFlow step=momentFetch findSlotClosestToStartTime chosen slotId=" + chosenSlot.slotId + " start=" + chosenSlot.start);
        } else {
          console.log("[time-slot] bookFlow step=momentFetch findSlotClosestToStartTime chosenSlot=null");
        }
        if (chosenSlot) {
          const now = new Date().toISOString();
          const dateWords = await formatSlotDateInWordsWithLLM(chosenSlot.start);
          const msg =
            slotList.length === 1
              ? singleSlotOffer(dateWords)
              : confirmSlotWithUser(dateWords);
          logResponse(msg);
          return {
            assistantResponse: msg,
            metadata: state.metadata
              ? {
                  ...state.metadata,
                  last_updated: now,
                  state: {
                    ...state.metadata.state,
                    org_id: organizationId,
                    _available_slots: slotList,
                    selected_slot_id: chosenSlot.slotId,
                    current_flow: "booking",
                    flow_data: { step: "confirm", started_at: flowData.started_at },
                    current_step: "book_flow",
                    next_action: "ask_anything_else",
                  },
                }
              : undefined,
          };
        }
        const now = new Date().toISOString();
        const slotText = await formatAvailabilityCondensedByDate(slotList, clinicTz);
        const msg = `We have availability on that day. ${slotText} Which slot would you like? Say the number or the time.`;
        logResponse(msg);
        return {
          assistantResponse: msg,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: organizationId,
                  _available_slots: slotList,
                  current_flow: "booking",
                  flow_data: { step: "offer_slots", started_at: flowData.started_at },
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
      const toDate = addDaysToDate(date, 6);
      const altSlots = await getAvailability({
        organizationId,
        fromDate: date,
        toDate,
      });
      if (altSlots.length > 0) {
        const now = new Date().toISOString();
        const slotText = await formatAvailabilityCondensedByDate(altSlots, clinicTz);
        const msg = `We don't have availability on that exact day. Here are options in the next few days: ${slotText} Which would you like? Say the number or the date and time.`;
        logResponse(msg);
        return {
          assistantResponse: msg,
          metadata: state.metadata
            ? {
                ...state.metadata,
                last_updated: now,
                state: {
                  ...state.metadata.state,
                  org_id: organizationId,
                  _available_slots: altSlots,
                  current_flow: "booking",
                  flow_data: { step: "offer_slots", started_at: flowData.started_at },
                  current_step: "book_flow",
                  next_action: "ask_anything_else",
                },
              }
            : undefined,
        };
      }
    } catch {
      // fall through to "Which slot would you like?"
    }
  }

  const msg = "Which slot would you like? Say the number (1 or 2) or the date and time, for example February 5th at 3pm, or say next week for more dates.";
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
            current_flow: "booking",
            flow_data: flowData,
            current_step: "book_flow",
            next_action: "ask_anything_else",
          },
        }
      : undefined,
  };
}
