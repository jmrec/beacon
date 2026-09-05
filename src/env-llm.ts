import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const llmEnv = createEnv({
  server: {
    LLM_PROVIDER: z.enum(["gemini", "deepseek"]).default("gemini"),
    LLM_MODEL: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
