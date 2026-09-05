import { z } from "zod";

export type OutagePeriod = "today" | "this_week" | "last_week";

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

export const UnscheduledOutageSchema = z.object({
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

export type UnscheduledOutage = z.infer<typeof UnscheduledOutageSchema>;

export const ScheduledOutageSchema = z.object({
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

export type ScheduledOutage = z.infer<typeof ScheduledOutageSchema>;

export const unscheduledFeedSchema = z.array(UnscheduledOutageSchema);
export const scheduledFeedSchema = z.array(ScheduledOutageSchema);

export const OutageFeedSchema = z.object({
  unscheduled: unscheduledFeedSchema,
  scheduled: scheduledFeedSchema,
});

export type OutageFeed = z.infer<typeof OutageFeedSchema>;
