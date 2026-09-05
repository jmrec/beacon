import { chat, maxIterations } from "@tanstack/ai";
import { createServerFn } from "@tanstack/react-start";
import { type AreaResolutionCache, fingerprintText } from "./cache.ts";
import { createLlmAdapter } from "./llm.ts";
import { areaResolverTools } from "./tools.ts";
import type { OutageFeed } from "./types/api.ts";
import {
  type AreaResolution,
  type AreaResolutionOutcome,
  type AreaTask,
  parseAreaResolution,
} from "./types/internal.ts";
import { AreaResolutionWireSchema } from "./types/llm.ts";

const SYSTEM_PROMPT = `You resolve power-outage "affected area" descriptions into the affected municipalities and barangays, grounded in a BENECO reference dataset.

Output model (single area text -> one object)
Top level has two arrays: municipalities[] and unresolved[]. Each municipality has a scope describing how that municipality is affected:
- kind "whole": EVERY barangay in the municipality is affected. Prefer this (instead of enumerating) when the text implies the whole municipality.
- kind "partial": the municipality is partly affected but you cannot itemise the barangays.
- kind "included": ONLY the barangays listed under scope.barangays are affected.
- kind "excluded": EVERY barangay is affected EXCEPT the ones listed under scope.barangays.

Each barangay has its own scope describing how much of that barangay is affected:
- kind "whole": entire barangay affected.
- kind "partial": partly affected, sub-areas not named by the text.
- kind "included" + areas: only the named sub-areas (sitio/purok/landmark/etc.) are affected; put them in scope.areas.
- kind "excluded" + areas: the whole barangay is affected except the named sub-areas.
Inside a municipality scope of kind "excluded", the scope of each listed barangay says how much is carved OUT: "whole" = that barangay is not affected; "partial"/"included"/"excluded" = only part of it is excluded.

Grounding with tools (keep it small — resolve municipality by municipality)
- list_municipalities: call at most once, to confirm municipality names and ids.
- list_barangays_in_municipality: for EACH municipality named in the text, call it ONCE to get that municipality's official barangay list, then pick the affected barangays from that returned list (prefer official spellings).
- Map loose spellings and sub-areas to the CLOSEST official barangay name already returned by list_barangays_in_municipality for that municipality. Prefer an official name verbatim; only fall back to a close spelling when clearly needed. If a token has no plausibly close official barangay, treat it as unresolved (do not invent one).
- Emit ONLY municipality/barangay ids returned by a tool. Never invent an id or name.
- Copy each entity's pcode (Philippine code) from its tool result; omit pcode when the tool returned none.
- Gather what you need quickly and then STOP calling tools. Never call a tool more than once for the same municipality, and never search individual place names.

Mapping the raw text
- Text groups barangays under a municipality prefix, e.g. "Buguias: A, B, C". -> that municipality kind "included" with those barangays.
- "Whole of <municipality>" -> municipality kind "whole".
- "Whole of <municipality> except X, Y and parts of Z" -> municipality kind "excluded", listing X (whole), Y (whole) and Z (partial) under barangays.
- "Parts of <barangay>" -> that barangay kind "partial".
- "<barangay> (sub-a, sub-b, ...)" -> that barangay kind "included" with scope.areas [sub-a, sub-b, ...].
- When a municipality is wholly or almost-wholly affected, prefer "whole"/"excluded" so you do NOT enumerate every barangay.
- A municipality that appears affected is included once; fold its barangays into that single entry.

confidence: "high" when named verbatim; "medium" when matched via parts-of / parenthetical context / a loose spelling; "low" when inferred with uncertainty.

unresolved
- Put a token in unresolved ONLY when it matches no municipality AND no barangay AND cannot be attached as a sub-area under some barangay's scope.areas.
- Sub-areas you captured in a barangay's scope.areas must NOT be repeated under unresolved. Never guess an id.

Return one JSON object matching the output schema for the single area text the user provides. Output it in your very next message after gathering; never end your turn with a tool call.`;

function buildUserMessage(task: AreaTask): string {
  const kind =
    task.kind === "scheduled" ? "Scheduled interruption" : "Unscheduled outage";
  const header = [
    `Type: ${kind}`,
    `Outage ID: ${task.outageId}`,
    task.feeder ? `Feeder: ${task.feeder}` : null,
  ]
    .filter((x): x is string => x != null)
    .join("\n");

  return [
    "Resolve the affected-area text below into barangays.",
    "",
    header,
    "",
    "Affected area text:",
    '"""',
    task.text.trim(),
    '"""',
  ].join("\n");
}

async function resolveSingle(task: AreaTask): Promise<AreaResolution> {
  const wire = await chat({
    adapter: createLlmAdapter(),
    systemPrompts: [SYSTEM_PROMPT],
    messages: [{ role: "user", content: buildUserMessage(task) }],
    tools: areaResolverTools,
    outputSchema: AreaResolutionWireSchema,
    agentLoopStrategy: maxIterations(10),
  });
  return parseAreaResolution(wire);
}

export interface ResolveOutageAreasOptions {
  concurrency?: number;
  cache?: AreaResolutionCache;
  onResolve?: (info: ResolveTelemetry) => void;
}

export interface ResolveTelemetry {
  outageId: number;
  kind: AreaTask["kind"];
  ranAgent: boolean;
  municipalities: number;
  unresolved: number;
}

async function resolveOne(
  task: AreaTask,
  cache: AreaResolutionCache | undefined,
): Promise<AreaResolution> {
  const fingerprint = fingerprintText(task.text);

  if (cache) {
    const hit = cache.get(task.outageId);
    if (hit && hit.fingerprint === fingerprint) {
      return hit.resolution;
    }
  }

  let resolution: AreaResolution;
  try {
    resolution = await resolveSingle(task);
  } catch (error) {
    console.error(
      `[beneco-area] failed to resolve ${task.kind}/${task.outageId}:`,
      error,
    );
    return { municipalities: [], unresolved: [] };
  }

  cache?.set({
    outageId: task.outageId,
    kind: task.kind,
    fingerprint,
    resolution,
    updatedAt: Date.now(),
  });

  return resolution;
}

async function resolveOutageAreas(
  tasks: AreaTask[],
  opts: ResolveOutageAreasOptions = {},
): Promise<AreaResolutionOutcome[]> {
  const configured = Number(process.env.BENECO_AREA_CONCURRENCY);
  const concurrency = Math.max(
    1,
    Math.min(
      opts.concurrency ?? (Number.isFinite(configured) ? configured : 3),
      8,
    ),
  );
  const { cache, onResolve } = opts;

  const outcomes: AreaResolutionOutcome[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      const task = tasks[index];
      const fingerprint = fingerprintText(task.text);
      const hit = cache?.get(task.outageId);
      const ranAgent = !(hit && hit.fingerprint === fingerprint);
      const resolution = await resolveOne(task, cache);
      outcomes[index] = {
        ...resolution,
        key: task.key,
        kind: task.kind,
        outageId: task.outageId,
      };
      onResolve?.({
        outageId: task.outageId,
        kind: task.kind,
        ranAgent,
        municipalities: resolution.municipalities.length,
        unresolved: resolution.unresolved.length,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );

  return outcomes;
}

const resolveOutageAreasFn = createServerFn({ method: "POST" })
  .validator((data: unknown): AreaTask[] => {
    if (!Array.isArray(data)) {
      throw new Error("resolveOutageAreas expects an array of area tasks");
    }
    return data as AreaTask[];
  })
  .handler(async ({ data }) => resolveOutageAreas(data));

function tasksFromOutageFeed(feed: OutageFeed): AreaTask[] {
  const unscheduled: AreaTask[] | undefined = feed.unscheduled?.map((o) => ({
    key: `u-${o.id}`,
    kind: "unscheduled",
    outageId: o.id,
    text: o.area,
    feeder: o.feeder,
  }));
  const scheduled: AreaTask[] | undefined = feed.scheduled?.map((o) => ({
    key: `s-${o.id}`,
    kind: "scheduled",
    outageId: o.id,
    text: o.areas,
    feeder: o.feeder,
  }));
  return [...(unscheduled || []), ...(scheduled || [])];
}

export { resolveOutageAreas, resolveOutageAreasFn, tasksFromOutageFeed };
