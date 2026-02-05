import { ReskSecurityFilter } from "resk-llm-ts/dist/frontend/resk_security_filter.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isReskEnabled, getReskStreamFilterConfig } from "./reskConfig";

/** Result of validating messages before streaming. */
export interface StreamValidationResult {
  allowed: boolean;
  blockReason?: string;
  errors?: string[];
  warnings?: string[];
}

/** Singleton ReskSecurityFilter for streaming path (input validation only). */
let securityFilterInstance: ReskSecurityFilter | null = null;

function getSecurityFilter(): ReskSecurityFilter {
  if (!securityFilterInstance) {
    securityFilterInstance = new ReskSecurityFilter(getReskStreamFilterConfig());
  }
  return securityFilterInstance;
}

/**
 * Validate messages for the streaming path using ReskSecurityFilter.
 * When resk is disabled, returns { allowed: true } without running the filter.
 */
export async function validateMessagesForStream(
  model: string,
  messages: ChatCompletionMessageParam[]
): Promise<StreamValidationResult> {
  if (!isReskEnabled()) {
    return { allowed: true };
  }
  const filter = getSecurityFilter();
  const providerMessages = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    ...(typeof (m as { name?: string }).name === "string" && { name: (m as { name: string }).name }),
  }));

  const request = {
    provider: "openai" as const,
    model,
    messages: providerMessages,
  };

  const result = await filter.validateRequest(request);

  if (result.blocked || !result.valid) {
    return {
      allowed: false,
      blockReason: result.errors?.length ? result.errors.join("; ") : "Request blocked by security policy",
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  return {
    allowed: true,
    warnings: result.warnings?.length ? result.warnings : undefined,
  };
}
