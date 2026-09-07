import { z } from "zod";
import type { Outage } from "./internal.ts";

export type OutagePeriod = "today" | "this_week" | "last_week";

export type OutageFeed = {
  unscheduled: Outage[];
  scheduled: Outage[];
};

function collapse(v?: string | null): string {
  if (!v) return "";
  return v.replace(/\s+/g, " ").trim();
}

function cleanArea(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(", ");
}

const rawString = z
  .unknown()
  .transform((v): string => (v == null ? "" : String(v)));

const textField = (clean: (s: string) => string) =>
  z.unknown().transform((v): string => (v == null ? "" : clean(String(v))));

const nullableTextField = (clean: (s: string) => string) =>
  z
    .unknown()
    .transform((v): string | null => (v == null ? null : clean(String(v))));

const unscheduledItem = z.object({
  id: z.number().int(),
  feeder: textField(collapse),
  area: textField(cleanArea),
  cause: textField(collapse),
  timeoff: rawString,
  timerestored: rawString,
  duration: textField(collapse),
  status: textField(collapse),
  latest_update: nullableTextField(collapse),
});

const toUnscheduledOutage = (o: z.infer<typeof unscheduledItem>): Outage => ({
  id: o.id,
  kind: "unscheduled",
  feeder: o.feeder,
  area: o.area,
  status: {
    kind: "unscheduled",
    state: /ongoing/i.test(o.status) ? "ongoing" : "restored",
  },
  consumers: null,
  purpose: "",
  schedule: `Off ${o.timeoff} · ${o.duration}`,
});

export const unscheduledFeedSchema = z
  .array(unscheduledItem)
  .transform((items) => items.map(toUnscheduledOutage));

const scheduledItem = z.object({
  id: z.number().int(),
  intrtype: textField(collapse),
  feeder: textField(collapse),
  deenergized: textField(collapse),
  poleid: textField(collapse),
  areas: textField(cleanArea),
  date: rawString,
  timeoff: rawString,
  timerestored: rawString,
  purpose: textField(collapse),
  logged: z.number().int(),
  noofcons: z.number().int(),
  remarks: textField(collapse),
  cancelled: z.number().int(),
});

const toScheduledOutage = (o: z.infer<typeof scheduledItem>): Outage => ({
  id: o.id,
  kind: "scheduled",
  feeder: o.feeder,
  area: o.areas,
  status: {
    kind: "scheduled",
    state: o.cancelled === 1 ? "cancelled" : "scheduled",
  },
  consumers: o.noofcons,
  purpose: o.purpose,
  schedule: `${o.date} · ${o.timeoff}–${o.timerestored}`,
});

export const scheduledFeedSchema = z
  .array(scheduledItem)
  .transform((items) => items.map(toScheduledOutage));
