import { ReskLLMClient } from "resk-llm-ts";
import type OpenAI from "openai";
import { getReskSecurityConfig } from "./reskConfig";

/**
 * Create ReskLLMClient with the given Azure OpenAI client and security config from env.
 * Used for non-streaming requests (full pre + post security checks). Only call when resk is enabled.
 */
export function createReskClient(openaiClient: OpenAI): ReskLLMClient {
  const securityConfig = getReskSecurityConfig();
  return new ReskLLMClient({
    openaiClient: openaiClient as any,
    securityConfig,
  });
}
