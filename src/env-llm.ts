import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const llmEnv = createEnv({
  server: {
    LLM_PROVIDER: z
      .enum(["gemini", "deepseek", "together", "openrouter"])
      .default("gemini"),
    LLM_MODEL: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_MAX_ITERATIONS: z.coerce.number().default(10),
    LLM_MAX_VALIDATION_RETRIES: z.coerce.number().default(2),
    LLM_MAX_TOOL_CALLS: z.coerce.number().default(8),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().default(8192),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
