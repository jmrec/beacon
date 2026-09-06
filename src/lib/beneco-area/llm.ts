import { createGeminiChat } from "@tanstack/ai-gemini";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { llmEnv } from "../../env-llm.ts";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_TOGETHER_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

type LlmProvider = (typeof llmEnv)["LLM_PROVIDER"];

type GeminiModel = Parameters<typeof createGeminiChat>[0];
type OpenRouterModel = Parameters<typeof createOpenRouterText>[0];

const OPENAI_COMPAT_BASE_URL: Partial<Record<LlmProvider, string>> = {
  deepseek: "https://api.deepseek.com",
  together: "https://api.together.xyz/v1",
};

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  gemini: DEFAULT_GEMINI_MODEL,
  deepseek: DEFAULT_DEEPSEEK_MODEL,
  together: DEFAULT_TOGETHER_MODEL,
  openrouter: DEFAULT_OPENROUTER_MODEL,
};

function modelFor(provider: LlmProvider): string {
  return llmEnv.LLM_MODEL?.trim() ?? DEFAULT_MODEL[provider];
}

function apiKeyFor(provider: LlmProvider): string {
  const apiKey = llmEnv.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      `beneco-area resolver: missing LLM_API_KEY for provider "${provider}". Set LLM_API_KEY in your environment.`,
    );
  }
  return apiKey;
}

/** Build the text adapter for the provider/model selected via env. */
export function createLlmAdapter() {
  const provider = llmEnv.LLM_PROVIDER;
  const apiKey = apiKeyFor(provider);

  if (provider === "openrouter") {
    return createOpenRouterText(modelFor(provider) as OpenRouterModel, apiKey);
  }

  const baseURL = OPENAI_COMPAT_BASE_URL[provider];
  if (baseURL) {
    return openaiCompatibleText(modelFor(provider), { baseURL, apiKey });
  }

  return createGeminiChat(modelFor(provider) as GeminiModel, apiKey);
}

export function createLlmModelOptions(): Record<string, number> {
  switch (llmEnv.LLM_PROVIDER) {
    case "openrouter":
      return { maxCompletionTokens: llmEnv.LLM_MAX_OUTPUT_TOKENS };
    case "deepseek":
    case "together":
      return { max_tokens: llmEnv.LLM_MAX_OUTPUT_TOKENS };
    case "gemini":
      return {};
  }
}

export function getActiveLlm(): { provider: LlmProvider; model: string } {
  const provider = llmEnv.LLM_PROVIDER;
  return { provider, model: modelFor(provider) };
}
