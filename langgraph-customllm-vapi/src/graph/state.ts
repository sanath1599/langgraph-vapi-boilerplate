import { Annotation } from "@langchain/langgraph";

/** Verify-user flow step (when caller ID did not find user). */
export type VerifyStep =
  | "ask_current_or_first"
  | "ask_name"
  | "ask_spell_last"
  | "confirm_spelling"
  | "ask_dob"
  | "ask_phone"
  | "offer_register_or_transfer";

/** Booking flow step. */
export type BookingStep =
  | "visit_type"
  | "reason"
  | "find_earliest"
  | "offer_earliest"
  | "alternatives"
  | "confirm"
  | "created";

/** Inner state stored under metadata.state (per-request schema). */
export interface CallStateInner {
  normalized_phone: string | null;
  user_id: number | null;
  user_name: string | null;
  is_registered: boolean;
  current_intent: string;
  previous_intent: string | null;
  current_step: string;
  next_action: string;
  intent_history: Array<{ intent: string; timestamp: string; iteration: number }>;
  iteration_count: number;
  current_flow: string | null;
  flow_data: { step: string; started_at: string } | null;
  registration_data: Record<string, unknown> | null;
  selected_appointment_id: number | null;
  selected_slot_id: number | null;
  _available_slots: Array<{ slotId: number; providerId: number; start: string; end: string }> | null;
  _cancellable_appointments: Array<unknown> | null;
  org_id: number | null;
  failure_count: number;
  last_error: string | null;
  is_emergency: boolean;
  is_frustrated: boolean;
  should_transfer: boolean;
  call_ended: boolean;
  rejection_count: number;
  requires_user_input: boolean;
  conversation_ended: boolean;
  transfer_to_agent: boolean;
  session_started_at: string;
  user_dob: string | null;
  dob_attempt_count: number;
  identity_confirmed: boolean;
  identity_failed_end: boolean;
  /** Verify-user flow: current step when looking up by name/spelling/DOB/phone. */
  verify_step: VerifyStep | null;
  /** Number of name-search attempts in verify-user flow. */
  name_search_attempts: number;
  /** Last spelled name (e.g. last name) for confirm-spelling step. */
  last_spelled_name: string | null;
  /** Pending intent to run after verify succeeds (book | reschedule | cancel). */
  pending_intent_after_verify: string | null;
  /** Booking flow: current step. */
  booking_step: BookingStep | null;
  /** Booking: in_person | phone. */
  visit_type: string | null;
  /** Booking: B | 2 | 3 | P (or backend visitType string). */
  appointment_type: string | null;
  /** Booking: user's reason text (optional). */
  reason_text: string | null;
  /** After verify_flow: where to route next (set by verifyUser node). */
  verify_next: "register" | "transfer" | "book_flow" | "reschedule_flow" | "cancel_flow" | "get_appointments_flow" | null;
  /** After DOB mismatch + phone try: user chose register (yes) or transfer (no). */
  identity_offer_register_or_transfer: "offered" | "yes" | "no" | null;
  /** After in-flow intent check (reschedule/cancel): where to route (reschedule_flow, cancel_flow, book_flow, etc.). */
  in_flow_next_route: string | null;
}

export interface MetadataState {
  message_count: number;
  last_updated: string;
  state: CallStateInner;
}

/** User info from lookup (for internal use in nodes). */
export interface UserInfo {
  id: number;
  firstName: string;
  lastName: string;
  name?: { firstName: string; lastName: string };
  phone?: string;
  dob?: string;
}

/** OpenAI-style message for conversation history. */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function defaultCallStateInner(sessionStartedAt: string): CallStateInner {
  return {
    normalized_phone: null,
    user_id: null,
    user_name: null,
    is_registered: false,
    current_intent: "invalid",
    previous_intent: null,
    current_step: "entry",
    next_action: "normalize",
    intent_history: [],
    iteration_count: 0,
    current_flow: null,
    flow_data: null,
    registration_data: null,
    selected_appointment_id: null,
    selected_slot_id: null,
    _available_slots: null,
    _cancellable_appointments: null,
    org_id: null,
    failure_count: 0,
    last_error: null,
    is_emergency: false,
    is_frustrated: false,
    should_transfer: false,
    call_ended: false,
    rejection_count: 0,
    requires_user_input: true,
    conversation_ended: false,
    transfer_to_agent: false,
    session_started_at: sessionStartedAt,
    user_dob: null,
    dob_attempt_count: 0,
    identity_confirmed: false,
    identity_failed_end: false,
    verify_step: null,
    name_search_attempts: 0,
    last_spelled_name: null,
    pending_intent_after_verify: null,
    booking_step: null,
    visit_type: null,
    appointment_type: null,
    reason_text: null,
    verify_next: null,
    identity_offer_register_or_transfer: null,
    in_flow_next_route: null,
  };
}

/** LangGraph state annotation. Messages use a reducer to append. */
export const GraphStateAnnotation = Annotation.Root({
  callId: Annotation<string>,
  rawCallerPhone: Annotation<string | null>(),
  user_id: Annotation<number | null>(),
  current_intent: Annotation<string>(),
  messages: Annotation<ChatMessage[]>({
    reducer: (left, right) => (Array.isArray(right) ? left.concat(right) : left.concat([right])),
    default: () => [],
  }),
  assistantResponse: Annotation<string>(),
  metadata: Annotation<MetadataState>(),
  user: Annotation<UserInfo | null>(),
});

export type GraphState = typeof GraphStateAnnotation.State;

/** Create initial call state for a new call (first request). */
export function createInitialCallState(
  callId: string,
  messages: ChatMessage[],
  rawCallerPhone: string | null
): GraphState {
  const now = new Date().toISOString();
  const inner = defaultCallStateInner(now);
  inner.iteration_count = 1;
  return {
    callId,
    rawCallerPhone,
    user_id: null,
    current_intent: "invalid",
    messages: [...messages],
    assistantResponse: "",
    metadata: {
      message_count: messages.length,
      last_updated: now,
      state: inner,
    },
    user: null,
  };
}

/** Helper: user from API by-phone lookup to UserInfo. */
export function userFromLookup(p: {
  id: number;
  name: { firstName: string; lastName: string };
  phone?: string;
  dob?: string;
}): UserInfo {
  return {
    id: p.id,
    firstName: p.name.firstName,
    lastName: p.name.lastName,
    name: p.name,
    phone: p.phone,
    dob: p.dob,
  };
}
