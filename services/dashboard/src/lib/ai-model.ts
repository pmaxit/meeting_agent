import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export function parseAIModel(): { provider: string; model: string } | null {
  const aiModel = process.env.AI_MODEL;
  if (!aiModel) return null;

  const [provider, ...modelParts] = aiModel.split("/");
  const model = modelParts.join("/");

  if (!provider || !model) return null;

  return { provider: provider.toLowerCase(), model };
}

export function isAIConfigured(): boolean {
  return parseAIModel() !== null;
}

export function getModel() {
  const config = parseAIModel();
  if (!config) {
    throw new Error("AI not configured. Set AI_MODEL environment variable.");
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const apiVersion = process.env.AI_API_VERSION;
  const { provider, model } = config;

  switch (provider) {
    case "azure": {
      if (!apiKey) throw new Error("AI_API_KEY is required for Azure OpenAI");
      if (!baseUrl) throw new Error("AI_BASE_URL is required for Azure OpenAI");
      const azureBaseUrl = baseUrl.replace(/\/$/, "");

      const azure = createOpenAI({
        apiKey,
        baseURL: azureBaseUrl,
        fetch: (url, options) => {
          const requestUrl = url instanceof Request ? new URL(url.url) : new URL(url);
          if (apiVersion && !requestUrl.searchParams.has("api-version")) {
            requestUrl.searchParams.set("api-version", apiVersion);
          }
          const headers = new Headers((url instanceof Request ? url.headers : options?.headers) || {});
          if (!headers.has("api-key")) {
            headers.set("api-key", apiKey);
          }
          if (headers.has("authorization")) {
            headers.delete("authorization");
          }
          if (url instanceof Request) {
            return fetch(new Request(requestUrl.toString(), { ...url, headers }));
          }
          return fetch(requestUrl.toString(), { ...options, headers });
        },
      });
      return azure(model);
    }

    case "openai": {
      if (!apiKey) throw new Error("AI_API_KEY is required for OpenAI");
      const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl || "https://api.openai.com/v1",
      });
      return openai(model);
    }

    case "anthropic": {
      if (!apiKey) throw new Error("AI_API_KEY is required for Anthropic");
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }

    case "groq": {
      if (!apiKey) throw new Error("AI_API_KEY is required for Groq");
      const groq = createOpenAI({
        apiKey,
        baseURL: baseUrl || "https://api.groq.com/openai/v1",
      });
      return groq(model);
    }

    case "openrouter": {
      if (!apiKey) throw new Error("AI_API_KEY is required for OpenRouter");
      const openrouter = createOpenAI({
        apiKey,
        baseURL: baseUrl || "https://openrouter.ai/api/v1",
      });
      return openrouter(model);
    }

    case "ollama":
    case "local":
    case "custom": {
      const custom = createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl || "http://localhost:11434/v1",
      });
      return custom(model);
    }

    default: {
      if (!baseUrl) {
        throw new Error(`Unknown provider "${provider}". Set AI_BASE_URL for custom providers.`);
      }
      const customProvider = createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl,
      });
      return customProvider(model);
    }
  }
}
