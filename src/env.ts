import { Temporal } from "@js-temporal/polyfill";
import { createEnv } from "@t3-oss/env-core";
import type { Duration } from "date-fns";
import { z } from "zod";

export type RecentlyResolvedWindow =
  | { mode: "sameDay" }
  | { mode: "within"; span: Duration };

function parseRecentlyResolvedWindow(input: string): RecentlyResolvedWindow {
  const trimmed = input.trim();
  if (/^sameDay$/i.test(trimmed)) return { mode: "sameDay" };


  let duration: Temporal.Duration;
  try {
    duration = Temporal.Duration.from(trimmed.toUpperCase());
  } catch {
    throw new Error(`Invalid BENECO_RECENTLY_RESOLVED_WINDOW value: ${input}`);
  }

  return {
      mode: "within",
      span: {
        years: duration.years,
      months: duration.months,
      weeks: duration.weeks,
      days: duration.days,
      hours: duration.hours,
      minutes: duration.minutes,
      seconds: duration.seconds,
    },
  }
}

export const env = createEnv({
  server: {
    SERVER_URL: z.url().optional(),
    DATABASE_URL: z.string().optional(),

    BENECO_UNSCHEDULED_OUTAGE_URL: z.url().optional(),
    BENECO_SCHEDULED_OUTAGE_URL: z.url().optional(),
    BENECO_UNSCHEDULED_PERIOD: z
      .enum(["today", "this_week", "last_week"])
      .default("today"),
    BENECO_SCHEDULED_PERIOD: z
      .enum(["today", "this_week", "last_week"])
      .default("today"),
    BENECO_AREA_CONCURRENCY: z.coerce.number().int().min(1).max(8).optional(),
    BENECO_AREA_TELEMETRY_FILE: z.string().optional(),
    BENECO_RECENTLY_RESOLVED_WINDOW: z
      .string()
      .transform(parseRecentlyResolvedWindow)
      .default({
        mode: "sameDay"
      }),
  },

  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
    VITE_TILE_SERVER_URL: z
      .url()
      .default("https://ph-boundaries.jmrecondo.com/benguet"),
  },

  runtimeEnv: {
    ...import.meta.env,
    ...(typeof process === "undefined" ? {} : process.env),
  },

  emptyStringAsUndefined: true,
});
