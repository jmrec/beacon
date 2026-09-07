import { createServerFn } from "@tanstack/react-start";
import { env } from "../../env.ts";
import type { AreaOverlayOutage } from "./area-overlay.ts";
import { fetchScheduledFeed, fetchUnscheduledFeed } from "./feed.ts";
import {
  fingerprintText,
  getResolvedOutageRows,
  type ResolutionRow,
  upsertResolvedOutageRows,
} from "./repos/dedup.ts";
import {
  type ResolveTelemetry,
  resolveOutageAreas,
  tasksFromOutageFeed,
} from "./resolver.ts";
import type { AreaResolutionOutcome, Outage, OutagePeriod } from "./types/internal.ts";

function isOngoing(
  outcome: AreaResolutionOutcome,
  unscheduled: Outage[],
): boolean {
  if (outcome.kind !== "unscheduled") return false;
  const item = unscheduled.find((o) => o.id === outcome.outageId);
  return item?.status.state === "ongoing";
}

async function appendResolveTelemetry(info: ResolveTelemetry): Promise<void> {
  const file = env.BENECO_AREA_TELEMETRY_FILE;
  if (!file) return;
  try {
    const fs = await import("node:fs");
    fs.appendFileSync(
      file,
      `${JSON.stringify({ ...info, at: new Date().toISOString() })}\n`,
    );
  } catch (error) {
    console.error("[beneco-area] telemetry write failed:", error);
  }
}

export const getResolvedOutageAreas = createServerFn({ method: "GET" })
  .validator((data: { period: OutagePeriod }) => data)
  .handler(async ({ data }): Promise<AreaOverlayOutage[]> => {
    const period = data.period;
    const [unscheduled, scheduled] = await Promise.all([
      fetchUnscheduledFeed(period),
      fetchScheduledFeed(period),
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
        maxIterations: 10,
        onResolve: (info) => {
          void appendResolveTelemetry(info);
        },
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
      const ongoing = isOngoing(outcome, unscheduled);
      results.push({
        ...outcome,
        ongoing,
        resolvedRecently: outcome.kind === "unscheduled" && !ongoing,
      });
    }
    return results;
  });
