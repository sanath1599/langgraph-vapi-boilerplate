import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { getDefaultModel } from "./azureClient";
import { resolveCallId, getState, setState } from "./stateStore";
import { createInitialCallState } from "./graph/state";
import { compiledGraph } from "./graph/graph";
import { setApiCallLogStore, type ApiCallLog } from "./apiClient";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

function sendError(res: Response, status: number, message: string, type = "internal_error") {
  res.status(status).json({ error: { message, type } });
}

function normalizeModel(model?: string): string {
  try {
    const defaultModel = getDefaultModel();
    if (!model || typeof model !== "string") return defaultModel;
    return model.trim() || defaultModel;
  } catch {
    return "default";
  }

}

app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  try {
    // console.log("req.body", req.body);
    const body = req.body as {
      model?: string;
      messages?: unknown;
      stream?: boolean;
      metadata?: { rawCallerPhone?: string; vapiCallId?: string };
      call?: { id?: string };
      customer?: { number?: string };
      max_completion_tokens?: number;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      stop?: string | string[] | null;
    };

    const messages = body.messages as ChatCompletionMessageParam[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendError(res, 400, "messages is required and must be a non-empty array", "invalid_request_error");
    }

    const rawCallerPhone =
      (typeof body.customer?.number === "string" && body.customer.number.trim()
        ? body.customer.number.trim()
        : null) ??
      (typeof body.metadata?.rawCallerPhone === "string" ? body.metadata.rawCallerPhone : null);
    const callId = resolveCallId(req);
    const chatMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: String(m.content ?? ""),
    }));
    let state = getState(callId);
    const now = new Date().toISOString();
    if (!state) {
      state = createInitialCallState(callId, chatMessages, rawCallerPhone);
    } else {
      state = {
        ...state,
        messages: chatMessages,
        metadata: state.metadata
          ? {
              ...state.metadata,
              message_count: chatMessages.length,
              last_updated: now,
              state: {
                ...state.metadata.state,
                iteration_count: (state.metadata.state.iteration_count ?? 0) + 1,
              },
            }
          : state.metadata,
      };
    }
    const apiCalls: ApiCallLog[] = [];
    setApiCallLogStore({ apiCalls });
    const runConfig = {
      configurable: { callId },
      recursionLimit: 50,
      tags: [`callId:${callId}`],
      metadata: {
        callId,
        iteration: state.metadata?.state?.iteration_count,
        thread_id: callId,
        session_id: callId,
        api_request_response: apiCalls,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await compiledGraph.invoke(state as any, runConfig);
    setApiCallLogStore(null);
    if (apiCalls.length > 0 && process.env.LANGSMITH_TRACING_V2 === "true" && process.env.LANGSMITH_API_KEY) {
      try {
        const { Client } = await import("langsmith");
        const client = new Client();
        const project = process.env.LANGSMITH_PROJECT ?? "default";
        const runs: { id: string }[] = [];
        for await (const run of client.listRuns({
          projectName: project,
          filter: `and(eq(metadata_key, "thread_id"), eq(metadata_value, "${callId}"))`,
          limit: 1,
          order: "desc",
        })) {
          runs.push({ id: run.id });
          break;
        }
        if (runs.length > 0) {
          await client.updateRun(runs[0].id, {
            extra: { metadata: { api_request_response: apiCalls } },
          });
        }
      } catch {
        // ignore if LangSmith update fails
      }
    }
    setState(callId, result as Parameters<typeof setState>[1]);
    const content = (result as { assistantResponse?: string }).assistantResponse ?? "";
    const payload = {
      id: `chatcmpl-${Date.now()}-${callId.slice(0, 8)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: normalizeModel(body.model),
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content },
          finish_reason: "stop",
        },
      ],
    };

    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const chunk1 = {
        id: payload.id,
        object: "chat.completion.chunk" as const,
        created: payload.created,
        model: payload.model,
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk1)}\n\n`);
      res.write(`data: ${JSON.stringify({ ...chunk1, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    return res.status(200).json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chat/completions]", err);

    if (message.includes("Missing Azure OpenAI env") || message.includes("AZURE_OPENAI")) {
      return sendError(res, 503, "Azure OpenAI configuration error", "service_unavailable");
    }
    if (message.includes("blocked") || message.includes("security") || message.includes("Security")) {
      return sendError(res, 403, message, "security_error");
    }
    if (message.includes("rate") || message.includes("429")) {
      return sendError(res, 502, "Upstream rate limit", "rate_limit_error");
    }

    return sendError(res, 500, message, "internal_error");
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.send("Custom LLM Server – POST /v1/chat/completions (LangGraph appointment assistant, OpenAI-compatible)");
});

const PORT = Number(process.env.PORT) || 6000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log("POST /v1/chat/completions – LangGraph appointment assistant (OpenAI-compatible)");
});
