/**
 * Tests that requesting a specific slot (e.g. "6th February 1:30 am") confirms THAT slot
 * from the existing list instead of refetching and returning slots for the wrong day.
 *
 * Prerequisites: Backend + Azure OpenAI + CLINIC_TIMEZONE (e.g. America/New_York)
 * Usage: npm run test:booking:specific-slot
 *
 * Phone: 14086221882, DOB: 15th March 99 (seed user Sanath).
 */

import "dotenv/config";
import { config } from "../src/config.js";
import { createInitialCallState, type GraphState } from "../src/graph/state.js";
import { compiledGraph } from "../src/graph/graph.js";
import type { ChatMessage } from "../src/graph/state.js";

const CALL_ID = "test-specific-slot-" + Date.now();
const RAW_CALLER_PHONE = "+14086221882";

function nextTurnState(result: GraphState, nextUserContent: string): GraphState {
  const prevInner = result.metadata?.state ?? {};
  const iter = (prevInner.iteration_count ?? 0) + 1;
  const messages: ChatMessage[] = [
    ...(Array.isArray(result.messages) ? result.messages : []),
    { role: "assistant" as const, content: (result as { assistantResponse?: string }).assistantResponse ?? "" },
    { role: "user" as const, content: nextUserContent },
  ];
  return {
    ...result,
    messages,
    assistantResponse: "",
    metadata: result.metadata
      ? {
          ...result.metadata,
          message_count: messages.length,
          last_updated: new Date().toISOString(),
          state: { ...prevInner, iteration_count: iter },
        }
      : result.metadata,
  };
}

async function checkBackend(): Promise<void> {
  const res = await fetch(`${config.mockApiBaseUrl}/availability?organizationId=1`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
}

async function run(): Promise<void> {
  console.log("=== Specific-slot booking test (6th February 1:30 am) ===\n");
  await checkBackend();
  console.log("Backend OK. Caller:", RAW_CALLER_PHONE, "DOB: 15th March 99\n");

  const runConfig = { configurable: { callId: CALL_ID }, recursionLimit: 50 };

  const turns = [
    "Hello",
    "Yes",
    "March 15 1999",
    "I'd like to book an appointment",
    "let's do 6th february 1 30 am",
    "yes",
  ];

  let state: GraphState = createInitialCallState(CALL_ID, [{ role: "user", content: turns[0] }], RAW_CALLER_PHONE);
  const responses: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const userMsg = turns[i];
    console.log(`Turn ${i + 1} User: "${userMsg}"`);

    const result = (await compiledGraph.invoke(state as Parameters<typeof compiledGraph.invoke>[0], runConfig)) as GraphState & { assistantResponse?: string };
    const resp = result.assistantResponse ?? "";
    responses.push(resp);
    console.log(`Assistant: ${resp.slice(0, 280)}${resp.length > 280 ? "..." : ""}\n`);

    if (i < turns.length - 1) state = nextTurnState(result, turns[i + 1]);
  }

  // Assert on response after "let's do 6th february 1 30 am" (turn 5, index 4).
  const turn5Response = responses[4] ?? "";
  const lower = turn5Response.toLowerCase();
  const hasConfirmOneSlot = lower.includes("is that the one you'd like to book") || lower.includes("one you'd like to book");
  const hasFeb6 = lower.includes("february 6") || lower.includes("feb 6") || lower.includes("6th");
  const wronglyListsFeb5Slots = /february 5.*we have.*\d+:\d+\s*(am|pm)/i.test(turn5Response) && !hasConfirmOneSlot;

  if (!hasConfirmOneSlot) {
    console.error("[FAIL] After '6th february 1 30 am' expected to confirm ONE slot (e.g. 'Is that the one you'd like to book?'), but got a list or other response.");
    process.exitCode = 1;
  }
  if (!hasFeb6 && hasConfirmOneSlot) {
    console.warn("[WARN] Confirmation message should mention February 6 (or 6th). Got:", turn5Response.slice(0, 200));
  }
  if (wronglyListsFeb5Slots) {
    console.error("[FAIL] Response should not list February 5 slots when user asked for February 6 1:30 am.");
    process.exitCode = 1;
  }

  if (process.exitCode !== 1) {
    console.log("Assertions passed: specific slot request led to single-slot confirmation.\n");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
