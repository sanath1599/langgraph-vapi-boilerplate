import { detectIntentWithLLM, type IntentLabel } from "../llm.js";
import type { GraphState } from "../state.js";

const LOG_PREFIX = "[graph][detect_intent]";

/**
 * Detect intent from last user message; update current_intent, previous_intent, intent_history.
 */
export async function detectIntent(state: GraphState): Promise<Partial<GraphState>> {
  const inner = state.metadata?.state;
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === "user");
  const lastUserContent = (lastUser?.content ?? "").trim();
  const snippet = lastUserContent.slice(0, 80) + (lastUserContent.length > 80 ? "…" : "");

  const intent = await detectIntentWithLLM(state.messages, {
    userName: inner?.user_name ?? null,
    currentStep: inner?.current_step ?? undefined,
    previousIntent: inner?.previous_intent ?? state.current_intent ?? null,
  });
  const prev = state.current_intent ?? inner?.current_intent ?? "invalid";
  const iter = (state.metadata?.state?.iteration_count ?? 0) + 1;
  const now = new Date().toISOString();
  const history = [...(state.metadata?.state?.intent_history ?? [])];
  history.push({ intent, timestamp: now, iteration: iter });

  const nextAction = intentToNextAction(intent);
  console.log(
    `${LOG_PREFIX} triggered | lastUserMessage="${snippet}" | detected=${intent} | next_action=${nextAction}`
  );
  return {
    current_intent: intent,
    metadata: state.metadata
      ? {
          ...state.metadata,
          last_updated: now,
          state: {
            ...state.metadata.state,
            current_intent: intent,
            previous_intent: prev,
            intent_history: history,
            iteration_count: iter,
            current_step: `intent_${intent}`,
            next_action: nextAction,
            is_emergency: intent === "emergency",
            is_frustrated: intent === "frustration",
            should_transfer: intent === "unsupported" || intent === "frustration",
            transfer_to_agent: intent === "unsupported" || intent === "frustration",
          },
        }
      : undefined,
  };
}

function intentToNextAction(intent: IntentLabel): string {
  switch (intent) {
    case "no_request":
      return "thanks_end";
    case "emergency":
      return "advise_911";
    case "invalid_business":
      return "polite_rejection";
    case "unsupported":
    case "frustration":
      return "transfer";
    case "org_info":
      return "org_info";
    case "register":
      return "register_flow";
    case "book":
      return "book_flow";
    case "reschedule":
      return "reschedule_flow";
    case "cancel":
      return "cancel_flow";
    case "get_appointments":
      return "get_appointments_flow";
    default:
      return "transfer";
  }
}
