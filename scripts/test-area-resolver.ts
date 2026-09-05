import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveOutageAreas,
  tasksFromOutageFeed,
} from "../src/lib/beneco-area/resolver.ts";
import type {
  OutageFeed,
  ScheduledOutage,
  UnscheduledOutage,
} from "../src/lib/beneco-area/types/api.ts";

interface FeedSource {
  unscheduled?: string;
  scheduled?: string;
}

const SAMPLE_FILES: FeedSource = {
  unscheduled: "src/data/sample_short_unscheduled.json",
  scheduled: "src/data/sample_short_scheduled.json",
};

const OUTPUT_PATH = resolve("src/data/resolved_outage_areas.json");

const SOURCE: FeedSource = {
  unscheduled: "https://api.beneco.com.ph/wballoutages.php?period=today",
  // scheduled: "https://api.beneco.com.ph/wbscheduledoutages.php?period=today",
};

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${source}: ${res.status} ${res.statusText}`,
      );
    }
    return res.text();
  }
  return readFileSync(resolve(source), "utf8");
}

async function loadKindArray(
  kind: "unscheduled" | "scheduled",
  source: string | undefined,
): Promise<unknown[]> {
  const raw = source
    ? await readSource(source)
    : readFileSync(resolve(SAMPLE_FILES[kind]!), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${source ? `SOURCE.${kind} (${source})` : SAMPLE_FILES[kind]} must contain a JSON array`,
    );
  }
  return parsed;
}

async function loadFeed(source: FeedSource): Promise<OutageFeed> {
  return {
    unscheduled: (await loadKindArray(
      "unscheduled",
      source.unscheduled,
    )) as UnscheduledOutage[],
    scheduled: (await loadKindArray(
      "scheduled",
      source.scheduled,
    )) as ScheduledOutage[],
  };
}

const feed = await loadFeed(SOURCE);

const tasks = tasksFromOutageFeed(feed);
const active = (["unscheduled", "scheduled"] as const)
  .filter((kind) => SOURCE[kind])
  .map((kind) => `${kind}@${SOURCE[kind]}`);
console.log(
  `Resolving ${tasks.length} area task(s) from ${active.length ? active.join(", ") : "sample files"}...`,
);

const out = await resolveOutageAreas(tasks, { concurrency: 2 });

writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2), "utf8");

console.log(`Saved output to ${OUTPUT_PATH}`);
