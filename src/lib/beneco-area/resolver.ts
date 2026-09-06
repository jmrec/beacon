import { type ChatMiddleware, chat, maxIterations } from "@tanstack/ai";
import { env } from "../../env.ts";
import { llmEnv } from "../../env-llm.ts";
import {
  createLlmAdapter,
  createLlmModelOptions,
  getActiveLlm,
} from "./llm.ts";
import { areaResolverTools } from "./tools.ts";
import type { OutageFeed } from "./types/api.ts";
import {
  type AreaResolution,
  type AreaResolutionOutcome,
  type AreaTask,
  parseAreaResolution,
} from "./types/internal.ts";
import { AreaResolutionWireSchema } from "./types/llm.ts";

const SYSTEM_PROMPT = `Map BENECO outage "affected area" text to affected municipalities/barangays from a reference dataset. Output ONE object: municipalities[] + unresolved[].

Municipality scope.kind:
- "whole": every barangay affected (prefer when text implies the whole municipality).
- "partial": partly affected, barangays not named.
- "included": only the barangays in scope.barangays are affected.
- "excluded": every barangay affected except those in scope.barangays.

Barangay scope.kind:
- "whole": entire barangay. "partial": partly affected, sub-areas not named.
- "included": only the named scope.areas (sitio/purok/landmark) affected.
- "excluded": whole barangay except the named scope.areas.
(Inside an "excluded" municipality, each listed barangay's scope says how much is carved OUT.)

Grounding (use tools sparingly, municipality by municipality)
- list_municipalities: at most once.
- list_barangays_in_municipality: ONCE per municipality named, then pick affected barangays from its returned list.
- Use ONLY ids/pcodes returned by tools; never invent. Copy pcode when present.
- Then STOP — never call a tool more than once per municipality.

Sub-areas vs barangays
- A token that is not a municipality and is in no barangay list is a SUB-AREA of the NEAREST barangay in the same clause. Attach it to that barangay's scope.areas — do NOT re-list municipalities hunting for it (it will never be a barangay).
  e.g. "Inuman, Pasdong, Ambuwaya ... Naguey" => Pasdong.areas [Inuman, Ambuwaya], Naguey.areas [Pangkiwa, Boneng]; "Napsong, Madaymen" => Madaymen.areas [Napsong].
- unresolved holds a token only if it matches no municipality, is in no barangay list, AND has no nearby barangay to attach to. Never repeat a captured sub-area in unresolved.

Text patterns
- "Mun: A, B, C" => that municipality "included" with A, B, C.
- "Whole of Mun" => "whole". "Whole of Mun except X, Y, parts of Z" => "excluded" (X whole, Y whole, Z partial).
- "Parts of <barangay>" => that barangay "partial". "<barangay> (a, b)" => "included", areas [a, b].
- Prefer "whole"/"excluded" when a municipality is wholly affected (don't enumerate every barangay).

confidence: high=verbatim; medium=parts-of/parenthetical/loose spelling; low=uncertain.

Return ONLY raw JSON — a single object with municipalities[] + unresolved[]. Do NOT wrap it in markdown code fences or backticks (no \\\`\\\`\\\`json ... \\\`\\\`\\\`), do NOT add prose, explanations, or trailing commentary before or after the object. The message must contain the JSON object and nothing else. Return it in your very next message; never end your turn with a tool call.`;

function buildUserMessage(task: AreaTask, hint?: string): string {
  const kind =
    task.kind === "scheduled" ? "Scheduled interruption" : "Unscheduled outage";
  const header = [
    `Type: ${kind}`,
    `Outage ID: ${task.outageId}`,
    task.feeder ? `Feeder: ${task.feeder}` : null,
  ]
    .filter((x): x is string => x != null)
    .join("\n");

  const base = [
    "Resolve the affected-area text below into barangays.",
    "",
    header,
    "",
    "Affected area text:",
    '"""',
    task.text.trim(),
    '"""',
  ].join("\n");

  if (!hint) return base;
  else return [
    base,
    "",
    "Feedback from a rejected previous attempt: your structured output",
    "violated the output rules below. Re-emit ONE fully valid object that",
    "satisfies them",
    "",
    `- ${hint}`,
  ].join("\n");
}

function isValidationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === "structured-output-validation-failed" ||
    message.includes("structured-output-validation-failed")
  );
}

function validationHint(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Validation failed:\s*/i, "");
}

export interface ResolveMetrics {
  attempts: number;
  iterations: number;
  toolCalls: number;
  tokens: number;
  reasoningTokens: number;
  cost: number;
  tools: string[];
}

function agentMiddleware(
  metrics: ResolveMetrics,
  maxToolCalls: number,
): ChatMiddleware {
  let toolCalls = 0;
  return {
    name: "beneco-agent",
    onIteration: () => {
      metrics.iterations += 1;
    },
    onBeforeToolCall: (_ctx, hookCtx) => {
      toolCalls += 1;
      metrics.toolCalls += 1;
      metrics.tools.push(
        toolCalls > maxToolCalls
          ? `${hookCtx.toolName}(blocked)`
          : hookCtx.toolName,
      );
      if (toolCalls > maxToolCalls) {
        return {
          type: "skip",
          result: {
            error: `Skipped: tool-call budget (${maxToolCalls}) exceeded`,
          },
        };
      }
      return undefined;
    },
    onUsage: (_ctx, usage) => {
      metrics.tokens = usage?.totalTokens ?? metrics.tokens;
      metrics.reasoningTokens =
        usage?.completionTokensDetails?.reasoningTokens ??
        metrics.reasoningTokens;
      metrics.cost = usage?.cost ?? metrics.cost;
    },
  };
}

type ResolveSingleResult = {
  resolution: AreaResolution;
  metrics: ResolveMetrics;
};

async function resolveSingle(
  task: AreaTask,
  maxTurns: number,
): Promise<ResolveSingleResult> {
  const metrics: ResolveMetrics = {
    attempts: 0,
    iterations: 0,
    toolCalls: 0,
    tokens: 0,
    reasoningTokens: 0,
    cost: 0,
    tools: [],
  };

  let retriesLeft = llmEnv.LLM_MAX_VALIDATION_RETRIES;
  let hint: string | undefined;

  const adapter = createLlmAdapter();
  const modelOptions = createLlmModelOptions();
  const middleware = [agentMiddleware(metrics, llmEnv.LLM_MAX_TOOL_CALLS)];
  const agentLoop = maxIterations(maxTurns);
  
  for (;;) {
    metrics.attempts++;

    try {
      const wire = await chat({
        adapter,
        modelOptions,
        systemPrompts: [SYSTEM_PROMPT],
        messages: [{ role: "user", content: buildUserMessage(task, hint) }],
        tools: areaResolverTools,
        outputSchema: AreaResolutionWireSchema,
        agentLoopStrategy: agentLoop,
        middleware
      });

      return { resolution: parseAreaResolution(wire), metrics };
    } catch (error) {
      if (!isValidationFailure(error) || retriesLeft === 0) throw error;

      retriesLeft--;
      hint = validationHint(error);
    }
  }
}

export interface ResolveTelemetry extends ResolveMetrics {
  provider: string;
  model: string;
  outageId: AreaTask["outageId"];
  kind: AreaTask["kind"];
  area: AreaTask["text"];
  municipalities: number;
  unresolved: number;
}

export interface ResolveOutageAreasOptions {
  concurrency?: number;
  maxIterations?: number;
  onResolve?: (info: ResolveTelemetry) => void;
}

async function resolveOutageAreas(
  tasks: AreaTask[],
  opts: ResolveOutageAreasOptions = {},
): Promise<AreaResolutionOutcome[]> {
  const concurrency = Math.max(
    1,
    Math.min(opts.concurrency ?? env.BENECO_AREA_CONCURRENCY ?? 3, 8),
  );
  const { onResolve } = opts;
  const { provider, model } = getActiveLlm();

  const results: AreaResolutionOutcome[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      const task = tasks[index];
      const maxTurns = opts.maxIterations ?? llmEnv.LLM_MAX_ITERATIONS;

      let outcome: ResolveSingleResult;
      try {
        outcome = await resolveSingle(task, maxTurns);
      } catch (error) {
        console.error(
          `[beneco-area] failed to resolve ${task.kind}/${task.outageId}:`,
          error,
        );
        continue;
      }

      const { resolution, metrics } = outcome;
      results.push({
        ...resolution,
        key: task.key,
        kind: task.kind,
        outageId: task.outageId,
      });
      onResolve?.({
        provider,
        model,
        outageId: task.outageId,
        kind: task.kind,
        area: task.text,
        municipalities: resolution.municipalities.length,
        unresolved: resolution.unresolved.length,
        ...metrics,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );

  return results;
}

function tasksFromOutageFeed(feed: OutageFeed): AreaTask[] {
  const unscheduled: AreaTask[] | undefined = feed.unscheduled.map((o) => ({
    key: `u-${o.id}`,
    kind: "unscheduled",
    outageId: o.id,
    text: o.area,
    feeder: o.feeder,
  }));
  const scheduled: AreaTask[] | undefined = feed.scheduled.map((o) => ({
    key: `s-${o.id}`,
    kind: "scheduled",
    outageId: o.id,
    text: o.areas,
    feeder: o.feeder,
  }));
  return [...(unscheduled || []), ...(scheduled || [])];
}

export { resolveOutageAreas, tasksFromOutageFeed };
