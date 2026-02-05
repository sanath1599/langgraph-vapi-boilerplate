import { detectIntentWithLLM } from "../llm.js";
import type { GraphState } from "../state.js";

/** Route targets after in-flow intent check. */
const ROUTES = [
  "reschedule_flow",
  "cancel_flow",
  "book_flow",
  "get_appointments_flow",
  "verify_flow",
  "thanks_end",
  "advise_911",
  "polite_rejection",
  "transfer",
  "org_info",
  "register_flow",
] as const;

export type InFlowNextRoute = (typeof ROUTES)[number];

const BOOKING_REGISTRATION_RESCHEDULE_CANCEL = ["booking", "registration", "reschedule", "cancel"] as const;

/**
 * When we're mid any flow (booking, registration, reschedule, cancel), re-run intent
 * detection on the last user message. If the user is continuing the current flow
 * (e.g. "option 2", "yes", "February 5 at 3pm"), we continue. If they're changing intent
 * (e.g. "cancel", "can i see my appointments" while in booking), we update intent and
 * route to the new flow so the user can always exit or switch.
 */
export async function inFlowIntentCheck(state: GraphState): Promise<Partial<GraphState>> {
  const inner = state.metadata?.state;
  const currentFlow = inner?.current_flow ?? null;
  const flowData = inner?.flow_data;
  const now = new Date().toISOString();

  const isInFlow =
    currentFlow !== null &&
    flowData?.step &&
    (BOOKING_REGISTRATION_RESCHEDULE_CANCEL as readonly string[]).includes(currentFlow);

  if (!isInFlow) {
    return {
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              in_flow_next_route: "transfer",
            },
          }
        : undefined,
    };
  }

  const currentStep = flowData?.step
    ? `${currentFlow}_${flowData.step}`
    : `${currentFlow}_flow`;
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === "user");
  const lastUserContent = (lastUser?.content ?? "").trim();
  const snippet = lastUserContent.slice(0, 80) + (lastUserContent.length > 80 ? "…" : "");

  const intent = await detectIntentWithLLM(state.messages, {
    userName: inner?.user_name ?? null,
    currentStep,
    previousIntent: currentFlow,
  });

  const hasUser =
    state.user_id != null ||
    state.user != null ||
    state.metadata?.state?.is_registered === true;

  // Continue current flow: same intent, or "unsupported" (in-flow reply: slot number, "yes", date/time, DOB, etc.)
  const continueCurrentFlow =
    intent === currentFlow ||
    (intent === "book" && currentFlow === "booking") ||
    (intent === "register" && currentFlow === "registration") ||
    (intent === "unsupported" &&
      (currentFlow === "reschedule" ||
        currentFlow === "cancel" ||
        currentFlow === "booking" ||
        currentFlow === "registration"));

  let nextRoute: string;
  let updates: Partial<typeof inner> = { in_flow_next_route: null };

  if (continueCurrentFlow) {
    if (currentFlow === "reschedule") nextRoute = "reschedule_flow";
    else if (currentFlow === "cancel") nextRoute = "cancel_flow";
    else if (currentFlow === "booking") nextRoute = "book_flow";
    else if (currentFlow === "registration") nextRoute = "register_flow";
    else nextRoute = "transfer";
  } else if (intent === "cancel") {
    nextRoute = "cancel_flow";
    // Preserve selected_appointment_id, _cancellable_appointments so cancel can confirm that appointment.
    // Set flow_data.step to "choose" so cancel_flow shows SURE_CANCEL for the already-selected appointment (not reschedule's "confirm" step).
    updates = {
      ...updates,
      current_intent: "cancel",
      current_flow: "cancel",
      current_step: "cancel_flow",
      previous_intent: inner?.current_intent ?? currentFlow,
      flow_data: { step: "choose", started_at: now },
    };
  } else if (intent === "reschedule") {
    nextRoute = "reschedule_flow";
    // Preserve selected_appointment_id, _cancellable_appointments, _available_slots, selected_slot_id so reschedule can offer slots for that appointment.
    updates = {
      ...updates,
      current_intent: "reschedule",
      current_flow: "reschedule",
      current_step: "reschedule_flow",
      previous_intent: inner?.current_intent ?? currentFlow,
    };
  } else if (intent === "book") {
    nextRoute = hasUser ? "book_flow" : "verify_flow";
    updates = {
      ...updates,
      current_intent: "book",
      current_flow: nextRoute === "book_flow" ? "booking" : null,
      current_step: nextRoute === "book_flow" ? "book_flow" : inner?.current_step ?? "verify_flow",
      previous_intent: inner?.current_intent ?? currentFlow,
      flow_data: nextRoute === "book_flow" ? { step: "check", started_at: now } : null,
    };
  } else if (intent === "get_appointments") {
    nextRoute = hasUser ? "get_appointments_flow" : "verify_flow";
    updates = {
      ...updates,
      current_intent: "get_appointments",
      current_flow: null,
      current_step: nextRoute === "get_appointments_flow" ? "get_appointments_flow" : inner?.current_step ?? "verify_flow",
      previous_intent: inner?.current_intent ?? currentFlow,
      flow_data: null,
    };
  } else if (intent === "no_request") {
    nextRoute = "thanks_end";
    updates = { ...updates, current_intent: "no_request", current_flow: null, flow_data: null };
  } else if (intent === "emergency") {
    nextRoute = "advise_911";
    updates = { ...updates, current_intent: "emergency", current_flow: null, flow_data: null };
  } else if (intent === "invalid_business") {
    nextRoute = "polite_rejection";
    updates = { ...updates, current_intent: "invalid_business", current_flow: null, flow_data: null };
  } else {
    // unsupported, frustration, org_info, register → transfer or appropriate route
    if (intent === "org_info") {
      nextRoute = "org_info";
      updates = { ...updates, current_intent: "org_info", current_flow: null, flow_data: null };
    } else if (intent === "register") {
      nextRoute = "register_flow";
      updates = { ...updates, current_intent: "register", current_flow: null, flow_data: null };
    } else {
      nextRoute = "transfer";
      updates = {
        ...updates,
        current_intent: intent,
        current_flow: null,
        flow_data: null,
        transfer_to_agent: true,
      };
    }
  }

  updates.in_flow_next_route = nextRoute;

  console.log(
    `[graph][in_flow_intent_check] triggered | current_flow=${currentFlow} | current_step=${currentStep} | lastUserMessage="${snippet}" | detected=${intent} | next_route=${nextRoute}`
  );

  return {
    current_intent: updates.current_intent ?? state.current_intent,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            ...updates,
          },
        }
      : undefined,
  };
}
