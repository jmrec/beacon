import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import {
  type Duration,
  isWithinInterval,
  parseISO,
  startOfDay,
  sub,
} from "date-fns";
import type { AreaOverlayOutage } from "../area-overlay";
import { fetchScheduledFeed, fetchUnscheduledFeed } from "./feed";
import type { ScheduledOutage, UnscheduledOutage } from "./types/api";
import type { AreaResolutionOutcome } from "./types/internal.ts";

type RecentlyResolvedWindow =
  | { mode: "sameDay" }
  | { mode: "within"; span: Duration };

const DEFAULT_RECENTLY_RESOLVED_WINDOW: RecentlyResolvedWindow = {
  mode: "sameDay",
};
const ZERO_DATE_PREFIX = "0000-00-00";

function toDate(raw?: string): Date | null {
  if (!raw || raw.startsWith(ZERO_DATE_PREFIX)) return null;
  const parsed = parseISO(raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRecentlyResolved(
  resolvedAt: Date | null,
  now: Date,
  window: RecentlyResolvedWindow,
): boolean {
  if (!resolvedAt || resolvedAt > now) return false;
  const cutoff =
    window.mode === "sameDay" ? startOfDay(now) : sub(now, window.span);
  return resolvedAt >= cutoff;
}

function scheduledInstant(
  item: ScheduledOutage,
  field: "timeoff" | "timerestored",
): Date | null {
  return toDate(`${item.date} ${item[field]}`);
}

type OutageStatus = { ongoing: boolean; resolvedRecently: boolean };

function classify(
  outcome: AreaResolutionOutcome,
  unscheduledById: Map<UnscheduledOutage["id"], UnscheduledOutage>,
  scheduledById: Map<ScheduledOutage["id"], ScheduledOutage>,
  now: Date,
): OutageStatus {
  switch (outcome.kind) {
    case "unscheduled": {
      const item = unscheduledById.get(outcome.outageId);
      if (!item || /ongoing/i.test(item.status))
        return { ongoing: true, resolvedRecently: false };
      return {
        ongoing: false,
        resolvedRecently: isRecentlyResolved(
          toDate(item.timerestored),
          now,
          DEFAULT_RECENTLY_RESOLVED_WINDOW,
        ),
      };
    }
    case "scheduled": {
      const item = scheduledById.get(outcome.outageId);
      if (!item || item.cancelled)
        return { ongoing: false, resolvedRecently: false };

      const start = scheduledInstant(item, "timeoff");
      const end = scheduledInstant(item, "timerestored");
      const ongoing = Boolean(
        start && end && isWithinInterval(now, { start, end }),
      );

      return {
        ongoing,
        resolvedRecently: isRecentlyResolved(
          ongoing ? null : end,
          now,
          DEFAULT_RECENTLY_RESOLVED_WINDOW,
        ),
      };
    } 
  }
}

export const getResolvedOutageAreas = createServerFn({ method: "GET" }).handler(
  async (): Promise<AreaOverlayOutage[]> => {
    const raw = readFileSync(
      resolve("src/data/resolved_outage_areas.json"),
      "utf8",
    );
    const outcomes = JSON.parse(raw) as AreaResolutionOutcome[];

    const [unscheduled, scheduled] = await Promise.all([
      fetchUnscheduledFeed("today"),
      fetchScheduledFeed("today"),
    ]).catch(() => [[], []]);

    const unscheduledById = new Map(unscheduled.map((o) => [o.id, o]));
    const scheduledById = new Map(scheduled.map((o) => [o.id, o]));
    const now = new Date();

    return outcomes.map((outcome) => ({
      ...outcome,
      ...classify(outcome, unscheduledById, scheduledById, now),
    }));
  },
);
