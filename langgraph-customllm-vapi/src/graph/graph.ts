import { START, END, StateGraph } from "@langchain/langgraph";
import { GraphStateAnnotation, type GraphState } from "./state.js";
import { normalize } from "./nodes/normalize.js";
import { lookup } from "./nodes/lookup.js";
import { greetPersonalized, greetGeneral } from "./nodes/greet.js";
import { mentionServices } from "./nodes/mentionServices.js";
import { confirmIdentity } from "./nodes/confirmIdentity.js";
import { identityFailedEnd } from "./nodes/identityFailedEnd.js";
import { detectIntent } from "./nodes/detectIntent.js";
import { inFlowIntentCheck } from "./nodes/inFlowIntentCheck.js";
import { thanksEnd } from "./nodes/thanksEnd.js";
import { advise911 } from "./nodes/advise911.js";
import { politeRejection } from "./nodes/politeRejection.js";
import { transfer } from "./nodes/transfer.js";
import { registerFlow } from "./nodes/registerFlow.js";
import { bookFlow } from "./nodes/bookFlow.js";
import { rescheduleFlow } from "./nodes/rescheduleFlow.js";
import { cancelFlow } from "./nodes/cancelFlow.js";
import { getAppointmentsFlow } from "./nodes/getAppointmentsFlow.js";
import { verifyUser } from "./nodes/verifyUser.js";
import { orgInfo } from "./nodes/orgInfo.js";

const MID_FLOW = ["booking", "registration", "reschedule", "cancel"] as const;

function entryRouter(
  state: GraphState
): "normalize" | "confirm_identity" | "detect_intent" | "in_flow_intent_check" | "verify_flow" {
  const iter = state.metadata?.state?.iteration_count ?? 0;
  if (iter === 1) return "normalize";
  const step = state.metadata?.state?.current_step ?? "";
  if (step === "ask_are_you_name" || step === "ask_dob") return "confirm_identity";
  const currentFlow = state.metadata?.state?.current_flow ?? null;
  const flowData = state.metadata?.state?.flow_data;
  const verifyStep = state.metadata?.state?.verify_step ?? null;
  if (currentFlow === "verify_user" && verifyStep) return "verify_flow";
  // When already in book/registration/reschedule/cancel (including confirmation), run in-flow intent check only — skip detect_intent so state and step (e.g. cancel_confirm) are preserved.
  if (
    currentFlow &&
    flowData?.step &&
    (MID_FLOW as readonly string[]).includes(currentFlow)
  ) {
    return "in_flow_intent_check";
  }
  return "detect_intent";
}

function routeUserFound(state: GraphState): "greet_personalized" | "greet_general" {
  const found =
    (state.metadata?.state?.is_registered === true) ||
    (state.user_id != null) ||
    (state.user != null);
  return found ? "greet_personalized" : "greet_general";
}

/** After confirm_identity: route to register, transfer, identity_failed_end, or end. */
function routeAfterConfirmIdentity(
  state: GraphState
): "identity_failed_end" | "end" | "register_flow" | "transfer" {
  const offer = state.metadata?.state?.identity_offer_register_or_transfer ?? null;
  if (offer === "yes") return "register_flow";
  if (offer === "no") return "transfer";
  const failed = state.metadata?.state?.identity_failed_end === true;
  return failed ? "identity_failed_end" : "end";
}

/** On first turn, stop after greeting (do not run intent on "Hello"). On later turns, run intent. */
function routeAfterMentionServices(state: GraphState): "end" | "detect_intent" {
  const iter = state.metadata?.state?.iteration_count ?? 0;
  return iter === 1 ? "end" : "detect_intent";
}

/** Only treat as explicit "nothing else" if user clearly said they're done (e.g. no, nothing else, goodbye). */
function isExplicitNothingElse(lastUserContent: string): boolean {
  const t = lastUserContent.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  const explicitPatterns = [
    /^no(\s|,|\.|$)/,
    /nothing\s*else/,
    /that'?s\s*all/,
    /goodbye|bye\b/,
    /that'?s\s*it/,
    /no\s*thanks/,
    /i'?m\s*done/,
    /all\s*done/,
    /nothing\s*more/,
    /not\s*really/,
    /we're\s*good|we\s*are\s*good/,
    /that\s*will\s*be\s*all/,
    /no\s*that'?s\s*(it|all)/,
  ];
  return explicitPatterns.some((p) => p.test(t));
}

function intentRouter(state: GraphState): string {
  const currentFlow = state.metadata?.state?.current_flow ?? null;
  const flowData = state.metadata?.state?.flow_data;

  // Every mid-flow message goes through intent detection so the user can exit or switch (e.g. "cancel", "see my appointments").
  if (currentFlow === "registration" && flowData?.step) {
    return "in_flow_intent_check";
  }
  if (currentFlow === "booking" && flowData?.step) {
    return "in_flow_intent_check";
  }
  if (currentFlow === "reschedule" && flowData?.step) {
    return "in_flow_intent_check";
  }
  if (currentFlow === "cancel" && flowData?.step) {
    return "in_flow_intent_check";
  }

  const intent = state.current_intent ?? state.metadata?.state?.current_intent ?? "unsupported";
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === "user");
  const lastUserContent = (lastUser?.content ?? "").trim();
  const hasUser =
    state.user_id != null ||
    state.user != null ||
    state.metadata?.state?.is_registered === true;

  const map: Record<string, string> = {
    no_request: "thanks_end",
    emergency: "advise_911",
    invalid_business: "polite_rejection",
    unsupported: "transfer",
    frustration: "transfer",
    org_info: "org_info",
    register: "register_flow",
    book: hasUser ? "book_flow" : "verify_flow",
    reschedule: hasUser ? "reschedule_flow" : "verify_flow",
    cancel: hasUser ? "cancel_flow" : "verify_flow",
    get_appointments: hasUser ? "get_appointments_flow" : "verify_flow",
  };
  const next = map[intent] ?? "transfer";

  if (next === "thanks_end" && !isExplicitNothingElse(lastUserContent)) {
    return "transfer";
  }
  return next;
}

function verifyFlowRouter(state: GraphState): string {
  const next = state.metadata?.state?.verify_next ?? null;
  if (next === "register") return "register_flow";
  if (next === "transfer") return "transfer";
  if (next === "book_flow") return "book_flow";
  if (next === "reschedule_flow") return "reschedule_flow";
  if (next === "cancel_flow") return "cancel_flow";
  if (next === "get_appointments_flow") return "get_appointments_flow";
  return "end";
}

/** After in-flow intent check (reschedule/cancel): route to the node set by inFlowIntentCheck. */
function inFlowNextRouter(state: GraphState): string {
  const next = state.metadata?.state?.in_flow_next_route ?? "transfer";
  return next;
}

const builder = new StateGraph(GraphStateAnnotation)
  .addNode("normalize", normalize)
  .addNode("lookup", lookup)
  .addNode("greet_personalized", greetPersonalized)
  .addNode("greet_general", greetGeneral)
  .addNode("mention_services", mentionServices)
  .addNode("confirm_identity", confirmIdentity)
  .addNode("identity_failed_end", identityFailedEnd)
  .addNode("detect_intent", detectIntent)
  .addNode("in_flow_intent_check", inFlowIntentCheck)
  .addNode("thanks_end", thanksEnd)
  .addNode("advise_911", advise911)
  .addNode("polite_rejection", politeRejection)
  .addNode("transfer", transfer)
  .addNode("register_flow", registerFlow)
  .addNode("book_flow", bookFlow)
  .addNode("reschedule_flow", rescheduleFlow)
  .addNode("cancel_flow", cancelFlow)
  .addNode("get_appointments_flow", getAppointmentsFlow)
  .addNode("verify_flow", verifyUser)
  .addNode("org_info", orgInfo);

builder.addConditionalEdges(START, entryRouter, {
  normalize: "normalize",
  confirm_identity: "confirm_identity",
  detect_intent: "detect_intent",
  in_flow_intent_check: "in_flow_intent_check",
  verify_flow: "verify_flow",
});
builder.addEdge("normalize", "lookup");
builder.addConditionalEdges("lookup", routeUserFound, {
  greet_personalized: "greet_personalized",
  greet_general: "greet_general",
});
builder.addEdge("greet_personalized", END);
builder.addEdge("greet_general", "mention_services");
builder.addConditionalEdges("confirm_identity", routeAfterConfirmIdentity, {
  identity_failed_end: "identity_failed_end",
  end: END,
  register_flow: "register_flow",
  transfer: "transfer",
});
builder.addEdge("identity_failed_end", END);
builder.addConditionalEdges("mention_services", routeAfterMentionServices, {
  end: END,
  detect_intent: "detect_intent",
});
builder.addConditionalEdges("detect_intent", intentRouter, {
  thanks_end: "thanks_end",
  advise_911: "advise_911",
  polite_rejection: "polite_rejection",
  transfer: "transfer",
  org_info: "org_info",
  register_flow: "register_flow",
  book_flow: "book_flow",
  reschedule_flow: "reschedule_flow",
  cancel_flow: "cancel_flow",
  get_appointments_flow: "get_appointments_flow",
  verify_flow: "verify_flow",
  in_flow_intent_check: "in_flow_intent_check",
});
builder.addConditionalEdges("in_flow_intent_check", inFlowNextRouter, {
  thanks_end: "thanks_end",
  advise_911: "advise_911",
  polite_rejection: "polite_rejection",
  transfer: "transfer",
  org_info: "org_info",
  register_flow: "register_flow",
  book_flow: "book_flow",
  reschedule_flow: "reschedule_flow",
  cancel_flow: "cancel_flow",
  get_appointments_flow: "get_appointments_flow",
  verify_flow: "verify_flow",
});
builder.addEdge("org_info", END);
builder.addConditionalEdges("verify_flow", verifyFlowRouter, {
  register_flow: "register_flow",
  transfer: "transfer",
  book_flow: "book_flow",
  reschedule_flow: "reschedule_flow",
  cancel_flow: "cancel_flow",
  get_appointments_flow: "get_appointments_flow",
  end: END,
});
builder.addEdge("thanks_end", END);
builder.addEdge("advise_911", END);
builder.addEdge("polite_rejection", END);
builder.addEdge("transfer", END);
// Flows go to END so we don't loop: detect_intent runs once per request; next request has new message.
builder.addEdge("register_flow", END);
builder.addEdge("book_flow", END);
builder.addEdge("reschedule_flow", END);
builder.addEdge("cancel_flow", END);
builder.addEdge("get_appointments_flow", END);

export const compiledGraph = builder.compile();

export function compileGraph() {
  return compiledGraph;
}
