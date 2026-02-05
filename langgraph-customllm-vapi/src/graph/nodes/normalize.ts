import { normalizeCallerId } from "../../apiClient.js";
import type { GraphState } from "../state.js";

/**
 * Normalize VAPI caller ID via backend API. Uses rawCallerPhone only (from request metadata).
 */
export async function normalize(state: GraphState): Promise<Partial<GraphState>> {
  const raw = state.rawCallerPhone;
  const existing = state.metadata?.state?.normalized_phone;
  if (!raw || existing) {
    return {
      metadata: state.metadata
        ? {
            ...state.metadata,
            state: {
              ...state.metadata.state,
              current_step: "normalize",
              next_action: "lookup",
            },
          }
        : undefined,
    };
  }
  try {
    const result = await normalizeCallerId(raw);
    const now = new Date().toISOString();
    return {
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              normalized_phone: result.normalizedNumber,
              current_step: "normalized",
              next_action: "lookup",
            },
          }
        : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    return {
      metadata: state.metadata
        ? {
            ...state.metadata,
            last_updated: now,
            state: {
              ...state.metadata.state,
              last_error: msg,
              failure_count: (state.metadata.state.failure_count ?? 0) + 1,
              current_step: "normalize_failed",
              next_action: "lookup",
            },
          }
        : undefined,
    };
  }
}
