import {
  type AreaResolutionCache,
  InMemoryAreaResolutionCache,
  pruneCache,
} from "./cache.ts";
import { fetchScheduledFeed, fetchUnscheduledFeed } from "./feed.ts";
import { resolveOutageAreas, tasksFromOutageFeed } from "./resolver.ts";
import type { OutagePeriod } from "./types/api.ts";
import type { AreaResolutionOutcome } from "./types/internal.ts";

const DEFAULT_UNSCHEDULED_INTERVAL_MS = 60_000;
const DEFAULT_SCHEDULED_INTERVAL_MS = 3_600_000;

export type PollKind = "unscheduled" | "scheduled";

export interface PollRun {
  kind: PollKind;
  outcomes: AreaResolutionOutcome[];
  ranAgent: number;
  servedFromCache: number;
  tookMs: number;
}

export interface PollerOptions {
  cache?: AreaResolutionCache;
  concurrency?: number;
  period?: OutagePeriod;
  unscheduledIntervalMs?: number;
  scheduledIntervalMs?: number;
  onPoll?: (run: PollRun) => void;
  onError?: (kind: PollKind, error: unknown) => void;
  log?: (message: string) => void;
}

export interface Poller {
  start(): void;
  stop(): void;
  pollOnce(): Promise<PollRun[]>;
}

interface ResolveStats {
  outcomes: AreaResolutionOutcome[];
  ranAgent: number;
  servedFromCache: number;
}

export function createPoller(opts: PollerOptions = {}): Poller {
  const cache = opts.cache ?? new InMemoryAreaResolutionCache();
  const concurrency = opts.concurrency;
  const period = opts.period ?? "today";
  const log = opts.log ?? (() => {});
  const unscheduledMs =
    opts.unscheduledIntervalMs ?? DEFAULT_UNSCHEDULED_INTERVAL_MS;
  const scheduledMs = opts.scheduledIntervalMs ?? DEFAULT_SCHEDULED_INTERVAL_MS;

  async function runResolve(
    tasks: Parameters<typeof resolveOutageAreas>[0],
  ): Promise<ResolveStats> {
    let ranAgent = 0;
    let servedFromCache = 0;
    const outcomes = await resolveOutageAreas(tasks, {
      concurrency,
      cache,
      onResolve: (info) => {
        if (info.ranAgent) ranAgent += 1;
        else servedFromCache += 1;
      },
    });
    return { outcomes, ranAgent, servedFromCache };
  }

  function finish(
    kind: PollKind,
    stats: ResolveStats,
    startedAt: number,
  ): PollRun {
    const run: PollRun = {
      kind,
      outcomes: stats.outcomes,
      ranAgent: stats.ranAgent,
      servedFromCache: stats.servedFromCache,
      tookMs: Date.now() - startedAt,
    };
    opts.onPoll?.(run);
    log(
      `[beneco-area] ${kind}: ${run.outcomes.length} outage(s), ` +
        `${run.ranAgent} agent run(s), ${run.servedFromCache} from cache ` +
        `(${run.tookMs}ms)`,
    );
    return run;
  }

  async function pollUnscheduledOnce(): Promise<PollRun> {
    const startedAt = Date.now();
    const unscheduled = await fetchUnscheduledFeed(period);
    const tasks = tasksFromOutageFeed({ unscheduled, scheduled: [] });
    return finish("unscheduled", await runResolve(tasks), startedAt);
  }

  async function pollScheduledOnce(): Promise<PollRun> {
    const startedAt = Date.now();
    const scheduled = await fetchScheduledFeed(period);
    const tasks = tasksFromOutageFeed({ unscheduled: [], scheduled });
    const stats = await runResolve(tasks);
    const live = new Set<number>([
      ...scheduled.map((o) => o.id),
    ]);
    pruneCache(cache, live);
    return finish("scheduled", stats, startedAt);
  }

  function loop(
    kind: PollKind,
    run: () => Promise<unknown>,
    intervalMs: number,
  ): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let inFlight = false;

    async function tick(): Promise<void> {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await run();
      } catch (error) {
        opts.onError?.(kind, error);
        log(`[beneco-area] ${kind} poll failed: ${String(error)}`);
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  let started = false;
  let stopFns: Array<() => void> = [];

  function start(): void {
    if (started) return;
    started = true;
    stopFns = [
      loop("unscheduled", () => pollUnscheduledOnce(), unscheduledMs),
      loop("scheduled", () => pollScheduledOnce(), scheduledMs),
    ];
  }

  function stop(): void {
    started = false;
    for (const stopFn of stopFns) stopFn();
    stopFns = [];
  }

  async function pollOnce(): Promise<PollRun[]> {
    const runs: PollRun[] = [];
    for (const [kind, poll] of [
      ["unscheduled", pollUnscheduledOnce],
      ["scheduled", pollScheduledOnce],
    ] as const) {
      try {
        runs.push(await poll());
      } catch (error) {
        opts.onError?.(kind, error);
      }
    }
    return runs;
  }

  return { start, stop, pollOnce };
}
