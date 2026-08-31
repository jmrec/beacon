import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    SERVER_URL: z.url().optional(),
    BENECO_UNSCHEDULED_OUTAGE_URL: z.url().optional(),
    BENECO_SCHEDULED_OUTAGE_URL: z.url().optional(),
  },

  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
    VITE_PH_BOUNDARIES_URL: z
      .url()
      .default("https://ph-boundaries.jmrecondo.com/benguet"),
  },

  runtimeEnv: import.meta.env,

  emptyStringAsUndefined: true,
});
