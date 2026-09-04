import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveOutageAreas,
  tasksFromOutageFeed,
} from "../src/lib/beneco-area/resolver.ts";

const feed = {
  unscheduled: JSON.parse(
    readFileSync(resolve("src/data/sample_short_unscheduled.json"), "utf8"),
  ),
  scheduled: JSON.parse(
    readFileSync(resolve("src/data/sample_short_scheduled.json"), "utf8"),
  ),
};

const tasks = tasksFromOutageFeed(feed);
const out = await resolveOutageAreas(tasks, { concurrency: 2 });

const outputPath = resolve("src/data/resolved_outage_areas.json");
writeFileSync(outputPath, JSON.stringify(out, null, 2), "utf8");

console.log(`Saved output to ${outputPath}`);
