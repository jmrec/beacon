import { createServerFn } from "@tanstack/react-start";
import {
  type Duration,
  isWithinInterval,
  parseISO,
  startOfDay,
  sub,
} from "date-fns";
import { env } from "../../env.ts";
import type { AreaOverlayOutage } from "./area-overlay.ts";
import { fetchScheduledFeed, fetchUnscheduledFeed } from "./feed.ts";
import {
  fingerprintText,
  getResolvedOutageRows,
  type ResolutionRow,
  upsertResolvedOutageRows,
} from "./repos/dedup.ts";
import { resolveOutageAreas, tasksFromOutageFeed } from "./resolver.ts";
import type { ScheduledOutage, UnscheduledOutage } from "./types/api.ts";
import type { AreaResolutionOutcome, AreaTask } from "./types/internal.ts";

type RecentlyResolvedWindow =
  | { mode: "sameDay" }
  | { mode: "within"; span: Duration };

const RECENTLY_RESOLVED_WINDOW: RecentlyResolvedWindow = {
  mode: "sameDay",
};
const ZERO_DATE_PREFIX = "0000-00-00";

function iterationBudget(task: AreaTask): number {
  const period =
    task.kind === "scheduled"
      ? env.BENECO_SCHEDULED_PERIOD
      : env.BENECO_UNSCHEDULED_PERIOD;
  return period === "today" ? 10 : 24;
}

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
          RECENTLY_RESOLVED_WINDOW,
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
          RECENTLY_RESOLVED_WINDOW,
        ),
      };
    }
  }
}

export const getResolvedOutageAreas = createServerFn({ method: "GET" }).handler(
  async (): Promise<AreaOverlayOutage[]> => {
    const [unscheduled, scheduled] = await Promise.all([
      fetchUnscheduledFeed(env.BENECO_UNSCHEDULED_PERIOD),
      fetchScheduledFeed(env.BENECO_SCHEDULED_PERIOD),
    ]).catch(() => [[], []]);

    const tasks = tasksFromOutageFeed({ unscheduled, scheduled });
    if (tasks.length === 0) return [];

    const fingerprintByOutage = new Map(
      tasks.map((task) => [task.outageId, fingerprintText(task.text)]),
    );
    const liveIds = tasks.map((task) => task.outageId);

    let stored: ResolutionRow[] = [];
    try {
      stored = await getResolvedOutageRows(liveIds);
    } catch (error) {
      console.error("[beneco-area] durable store read failed:", error);
      return [];
    }

    const storedByOutage = new Map(stored.map((row) => [row.outageId, row]));

    const needResolve = tasks.filter((task) => {
      const row = storedByOutage.get(task.outageId);
      return (
        !row ||
        row.kind !== task.kind ||
        row.fingerprint !== fingerprintByOutage.get(task.outageId)
      );
    });

    if (needResolve.length > 0) {
      const fresh = await resolveOutageAreas(needResolve, {
        concurrency: 3,
        maxIterations: iterationBudget,
      });
      try {
        await upsertResolvedOutageRows(
          fresh.map((outcome) => ({
            outageId: outcome.outageId,
            kind: outcome.kind,
            key: outcome.key,
            fingerprint: fingerprintByOutage.get(outcome.outageId) ?? "",
            resolution: {
              municipalities: outcome.municipalities,
              unresolved: outcome.unresolved,
            },
          })),
        );
      } catch (error) {
        console.error("[beneco-area] durable store write failed:", error);
        return [];
      }

      for (const outcome of fresh) {
        storedByOutage.set(outcome.outageId, {
          outageId: outcome.outageId,
          kind: outcome.kind,
          key: outcome.key,
          fingerprint: fingerprintByOutage.get(outcome.outageId) ?? "",
          resolution: {
            municipalities: outcome.municipalities,
            unresolved: outcome.unresolved,
          },
          resolvedAt: new Date(),
        });
      }
    }

    const unscheduledById = new Map(unscheduled.map((o) => [o.id, o]));
    const scheduledById = new Map(scheduled.map((o) => [o.id, o]));
    const now = new Date();

    const results: AreaOverlayOutage[] = [];
    for (const task of tasks) {
      const row = storedByOutage.get(task.outageId);
      if (!row) continue;
      const outcome: AreaResolutionOutcome = {
        key: task.key,
        kind: task.kind,
        outageId: task.outageId,
        municipalities: row.resolution.municipalities,
        unresolved: row.resolution.unresolved,
      };
      results.push({
        ...outcome,
        ...classify(outcome, unscheduledById, scheduledById, now),
      });
    }
    return results;
  },
);
