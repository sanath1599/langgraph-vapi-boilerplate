/**
 * Server and LangGraph config.
 * MOCK_API_BASE_URL: backend (caller-id, users, organizations, appointments).
 * APPOINTMENT_API_KEY / MOCK_API_KEY: sent as x-api-key when backend requires API key auth.
 * CALL_ID_*: how to resolve VAPI call ID from request.
 */
export const config = {
  port: Number(process.env.PORT) || 6000,
  mockApiBaseUrl: (process.env.MOCK_API_BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  apiKey: process.env.APPOINTMENT_API_KEY || process.env.MOCK_API_KEY || "",
  callIdHeader: process.env.CALL_ID_HEADER || "x-vapi-call-id",
  callIdBodyPath: process.env.CALL_ID_BODY_PATH || "metadata.vapiCallId",
};
