import { createEnv } from "@t3-oss/env-core";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { z } from "zod";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const llmEnv = createEnv({
  server: {
    LLM_PROVIDER: z.enum(["gemini", "deepseek"]).default("gemini"),
    LLM_MODEL: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

type LlmProvider = (typeof llmEnv)["LLM_PROVIDER"];

type GeminiModel = Parameters<typeof createGeminiChat>[0];

function modelFor(provider: LlmProvider): string {
  const model = llmEnv.LLM_MODEL?.trim();
  if (model) return model;
  return provider === "deepseek"
    ? DEFAULT_DEEPSEEK_MODEL
    : DEFAULT_GEMINI_MODEL;
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

  switch (provider) {
    case "gemini":
      return createGeminiChat(modelFor(provider) as GeminiModel, apiKey);
    case "deepseek":
      return openaiCompatibleText(modelFor(provider), {
        baseURL: DEEPSEEK_BASE_URL,
        apiKey,
      });
  }
}
