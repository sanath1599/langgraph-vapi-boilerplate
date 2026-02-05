/**
 * Test script for the booking flow.
 * Runs the LangGraph directly with a sequence of user messages (no HTTP).
 *
 * Prerequisites:
 * - Backend (Appointment API) running at MOCK_API_BASE_URL (default http://localhost:4000)
 * - Azure OpenAI env vars set (for LLM calls)
 * - CLINIC_TIMEZONE in .env (e.g. America/New_York)
 *
 * Usage: npm run test:booking
 *        (from repo root: cd custom-llm-mock-server && npm run test:booking)
 *
 * Start the backend first: from repo root, cd backend && npm run dev
 */

import "dotenv/config";
import { config } from "../src/config.js";
import { createInitialCallState, type GraphState } from "../src/graph/state.js";
import { compiledGraph } from "../src/graph/graph.js";
import type { ChatMessage } from "../src/graph/state.js";

async function checkBackend(): Promise<void> {
  try {
    const res = await fetch(`${config.mockApiBaseUrl}/availability?organizationId=1`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Backend not reachable at", config.mockApiBaseUrl);
    console.error("Start the backend first: cd backend && npm run dev");
    console.error("Error:", msg);
    process.exit(1);
  }
}

const CALL_ID = "test-booking-" + Date.now();

// User from seed: Sanath Mulky, phone +1-408-622-1882 (normalized as 14086221882 or similar)
const RAW_CALLER_PHONE = "+14086221882";

/** Build next state for a new turn: previous result + assistant reply + new user message, iteration_count incremented. */
function nextTurnState(
  result: GraphState,
  nextUserContent: string
): GraphState {
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
          state: {
            ...prevInner,
            iteration_count: iter,
          },
        }
      : result.metadata,
  };
}

async function run(): Promise<void> {
  console.log("=== Booking flow test ===\n");
  await checkBackend();
  console.log("Backend OK at", config.mockApiBaseUrl);
  console.log("Call ID:", CALL_ID);
  console.log("Caller phone:", RAW_CALLER_PHONE);
  console.log("");

  // Turn 1: Hello → normalize, lookup, greet
  const initialMessages: ChatMessage[] = [{ role: "user", content: "Hello" }];
  let state: GraphState = createInitialCallState(CALL_ID, initialMessages, RAW_CALLER_PHONE);

  const runConfig = {
    configurable: { callId: CALL_ID },
    recursionLimit: 50,
  };

  const turns: Array<{ user: string; expectContain?: string[] }> = [
    { user: "Hello" },
    { user: "Yes", expectContain: ["confirm", "date of birth", "DOB"] },
    { user: "March 15 1999", expectContain: ["book", "reschedule", "cancel", "register", "How would you like"] },
    { user: "I'd like to book an appointment", expectContain: ["availability", "slot", "option"] },
    { user: "option 1", expectContain: ["confirm", "book", "one you'd like"] },
    { user: "yes", expectContain: ["confirmed", "set", "appointment"] },
  ];

  for (let i = 0; i < turns.length; i++) {
    const { user, expectContain } = turns[i];
    console.log(`--- Turn ${i + 1} ---`);
    console.log("User:", user);

    try {
      const result = (await compiledGraph.invoke(state as Parameters<typeof compiledGraph.invoke>[0], runConfig)) as GraphState & { assistantResponse?: string };
      const response = result.assistantResponse ?? "";

      console.log("Assistant:", response.slice(0, 300) + (response.length > 300 ? "..." : ""));
      console.log("");

      if (expectContain && expectContain.length > 0) {
        const lower = response.toLowerCase();
        const found = expectContain.filter((phrase) => lower.includes(phrase.toLowerCase()));
        if (found.length === 0) {
          console.log("[WARN] Expected one of:", expectContain.join(", "));
        }
      }

      if (i < turns.length - 1) {
        state = nextTurnState(result, turns[i + 1].user);
      }
    } catch (err) {
      console.error("Error:", err);
      if (err instanceof Error && err.stack) console.error(err.stack);
      process.exitCode = 1;
      return;
    }
  }

  console.log("=== Test run finished ===\n");
}

run();
