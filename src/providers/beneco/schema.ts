import { z } from "zod";
import type { Outage } from "../../outages/types.ts";

export const benecoRawFeedSchema = z.object({
  unscheduled: z.array(z.unknown()),
  scheduled: z.array(z.unknown()),
});

function collapse(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
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
  .transform((value): string => (value == null ? "" : String(value)));
const textField = (clean: (value: string) => string) =>
  z
    .unknown()
    .transform((value): string => (value == null ? "" : clean(String(value))));
const nullableTextField = (clean: (value: string) => string) =>
  z
    .unknown()
    .transform((value): string | null =>
      value == null ? null : clean(String(value)),
    );

export const unscheduledItemSchema = z.object({
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

export const scheduledItemSchema = z.object({
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

export type BenecoUnscheduledItem = z.infer<typeof unscheduledItemSchema>;
export type BenecoScheduledItem = z.infer<typeof scheduledItemSchema>;

export function normalizeUnscheduled(item: BenecoUnscheduledItem): Outage {
  return {
    id: item.id,
    kind: "unscheduled",
    feeder: item.feeder,
    area: item.area,
    status: {
      kind: "unscheduled",
      state: /ongoing/i.test(item.status) ? "ongoing" : "restored",
    },
    consumers: null,
    purpose: "",
    schedule: `Off ${item.timeoff} · ${item.duration}`,
  };
}

export function normalizeScheduled(item: BenecoScheduledItem): Outage {
  return {
    id: item.id,
    kind: "scheduled",
    feeder: item.feeder,
    area: item.areas,
    status: {
      kind: "scheduled",
      state: item.cancelled === 1 ? "cancelled" : "scheduled",
    },
    consumers: item.noofcons,
    purpose: item.purpose,
    schedule: `${item.date} · ${item.timeoff}–${item.timerestored}`,
  };
}
