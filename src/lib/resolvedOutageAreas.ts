import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { AreaResolutionOutcome } from "./beneco-area/types/internal.ts";

export const getResolvedOutageAreas = createServerFn({ method: "GET" }).handler(
  async (): Promise<AreaResolutionOutcome[]> => {
    const raw = readFileSync(
      resolve("src/data/resolved_outage_areas.json"),
      "utf8",
    );
    return JSON.parse(raw) as AreaResolutionOutcome[];
  },
);
