import { Request } from "express";
import { config } from "./config";
import type { GraphState } from "./graph/state.js";

const store = new Map<string, GraphState>();

/**
 * Resolve call ID from request: VAPI body.call.id, then header (CALL_ID_HEADER), then body path (CALL_ID_BODY_PATH), then fallback.
 */
export function resolveCallId(req: Request): string {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body?.call && typeof body.call === "object") {
    const callId = (body.call as Record<string, unknown>).id;
    if (typeof callId === "string" && callId.trim()) return callId.trim();
  }
  const header = config.callIdHeader;
  const headerValue = req.headers[header.toLowerCase()] ?? req.headers[header];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }
  const path = config.callIdBodyPath;
  const parts = path.split(".");
  let value: unknown = body;
  for (const key of parts) {
    if (value == null || typeof value !== "object") break;
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  const firstMessage = Array.isArray(body?.messages) ? body.messages[0] : null;
  const ts = Date.now();
  const hash = firstMessage != null ? String(JSON.stringify(firstMessage).length) : "0";
  return `call-${hash}-${ts}`;
}

export function getState(callId: string): GraphState | undefined {
  return store.get(callId);
}

export function setState(callId: string, state: GraphState): void {
  store.set(callId, state);
}
