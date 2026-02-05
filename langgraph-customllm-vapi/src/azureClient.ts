import OpenAI from "openai";

/**
 * Build an OpenAI client configured for Azure OpenAI.
 * Uses AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION.
 */
export function createAzureOpenAIClient(): OpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (!endpoint || !deployment || !apiKey || !apiVersion) {
    throw new Error(
      "Missing Azure OpenAI env: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION"
    );
  }

  const baseURL = endpoint.replace(/\/$/, "") + `/openai/deployments/${deployment}`;

  return new OpenAI({
    apiKey,
    baseURL,
    defaultQuery: { "api-version": apiVersion },
  });
}

/** Default model name for request/response (deployment name). */
export function getDefaultModel(): string {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  if (!deployment) {
    throw new Error("AZURE_OPENAI_DEPLOYMENT_NAME is not set");
  }
  return deployment;
}
