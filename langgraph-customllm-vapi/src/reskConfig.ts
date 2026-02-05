/**
 * Resk (resk-llm-ts) configuration from environment variables.
 * When RESK_ENABLED is false, the server bypasses resk and calls Azure OpenAI directly for both stream and non-stream.
 */

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const v = value.toLowerCase().trim();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultValue;
}

function parseSeverity(value: string | undefined): "low" | "medium" | "high" {
  if (!value) return "medium";
  const v = value.toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function parsePromptInjectionLevel(value: string | undefined): "basic" | "advanced" {
  if (!value) return "basic";
  const v = value.toLowerCase().trim();
  if (v === "advanced") return "advanced";
  return "basic";
}

/** Whether resk-llm-ts is enabled. When false, Azure OpenAI is called directly (no security layer). */
export function isReskEnabled(): boolean {
  return parseBool(process.env.RESK_ENABLED, true);
}

/** Security config for ReskLLMClient (non-stream path). Only used when isReskEnabled() is true. */
export function getReskSecurityConfig(): {
  inputSanitization: { enabled: boolean };
  piiDetection: { enabled: boolean; redact: boolean };
  promptInjection: { enabled: boolean; level: "basic" | "advanced" };
  heuristicFilter: { enabled: boolean };
  canaryTokens: { enabled: boolean };
  contentModeration: { enabled: boolean; severity: "low" | "medium" | "high" };
  vectorDb: { enabled: boolean };
} {
  const inputSanitization = parseBool(process.env.RESK_INPUT_SANITIZATION_ENABLED, true);
  const piiRedact = parseBool(process.env.RESK_PII_REDACT, true);
  const promptInjectionLevel = parsePromptInjectionLevel(process.env.RESK_PROMPT_INJECTION_LEVEL);
  const heuristicEnabled = parseBool(process.env.RESK_HEURISTIC_ENABLED, true);
  const canaryTokensEnabled = parseBool(process.env.RESK_CANARY_TOKENS_ENABLED, true);
  const contentModerationSeverity = parseSeverity(process.env.RESK_CONTENT_MODERATION_SEVERITY);

  return {
    inputSanitization: { enabled: inputSanitization },
    piiDetection: { enabled: true, redact: piiRedact },
    promptInjection: { enabled: true, level: promptInjectionLevel },
    heuristicFilter: { enabled: heuristicEnabled },
    canaryTokens: { enabled: canaryTokensEnabled },
    contentModeration: {
      enabled: true,
      severity: contentModerationSeverity,
    },
    vectorDb: { enabled: false },
  };
}

/** Config for ReskSecurityFilter (stream path). Only used when isReskEnabled() is true. */
export function getReskStreamFilterConfig(): {
  inputSanitization: { enabled: boolean; sanitizeHtml: boolean };
  piiDetection: { enabled: boolean; redact: boolean; highlightOnly: boolean };
  promptInjection: { enabled: boolean; level: "basic" | "advanced"; clientSideOnly: boolean };
  heuristicFilter: { enabled: boolean; severity: "low" | "medium" | "high" };
  contentModeration: { enabled: boolean; severity: "low" | "medium" | "high" };
  canaryDetection: { enabled: boolean };
  ui: { showWarnings: boolean; blockSubmission: boolean; highlightIssues: boolean; realTimeValidation: boolean };
} {
  const main = getReskSecurityConfig();
  return {
    inputSanitization: { enabled: main.inputSanitization.enabled, sanitizeHtml: true },
    piiDetection: { enabled: true, redact: false, highlightOnly: true },
    promptInjection: { enabled: true, level: main.promptInjection.level, clientSideOnly: true },
    heuristicFilter: { enabled: main.heuristicFilter.enabled, severity: main.contentModeration.severity },
    contentModeration: { enabled: true, severity: main.contentModeration.severity },
    canaryDetection: { enabled: main.canaryTokens.enabled },
    ui: {
      showWarnings: true,
      blockSubmission: true,
      highlightIssues: true,
      realTimeValidation: true,
    },
  };
}
