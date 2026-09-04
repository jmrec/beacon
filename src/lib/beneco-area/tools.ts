import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import * as repo from "./repo.ts";

const listMunicipalitiesDef = toolDefinition({
  name: "list_municipalities",
  description:
    "List all municipalities/cities served by BENECO. Each barangay belongs to one municipality. Use this to learn about the municipalities, or when an area text names a municipality you want to confirm.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    municipalities: z.array(z.object({ id: z.number(), name: z.string() })),
  }),
});

const listMunicipalitiesTool = listMunicipalitiesDef.server(async () => {
  const rows = await repo.listMunicipalities();
  return { municipalities: rows };
});

const barangaysInMunicipalityDef = toolDefinition({
  name: "list_barangays_in_municipality",
  description:
    "List every barangay for a municipality (e.g. 'La Trinidad', 'Baguio City', 'Buguias'). The municipality name is matched loosely. When a match is found, use the returned id/name pairs to pick which barangays an area text refers to. When no match is found, `suggestions` lists close municipality names to try instead.",
  inputSchema: z.object({
    municipalityName: z
      .string()
      .describe("Municipality or city name to look up."),
  }),
  outputSchema: z.object({
    matchedMunicipality: z
      .object({ id: z.number(), name: z.string() })
      .nullable(),
    suggestions: z.array(z.string()),
    barangays: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        pcode: z.string().nullable(),
      }),
    ),
  }),
});

const barangaysInMunicipalityTool = barangaysInMunicipalityDef.server(
  async (args) => {
    const matched = await repo.findMunicipality(args.municipalityName);
    if (!matched) {
      const suggestions = await repo.suggestMunicipalities(
        args.municipalityName,
      );
      return {
        matchedMunicipality: null,
        suggestions: suggestions.map((m) => m.name),
        barangays: [],
      };
    }

    const barangays = await repo.barangaysForMunicipality(matched.id);
    return {
      matchedMunicipality: { id: matched.id, name: matched.name },
      suggestions: [],
      barangays: barangays.map((b) => ({
        id: b.id,
        name: b.name,
        pcode: b.pcode,
      })),
    };
  },
);

const fuzzyMatchBarangaysDef = toolDefinition({
  name: "fuzzy_match_barangays",
  description:
    "Fuzzy-match (pg_trgm) a list of barangay-like names in ONE call, optionally scoped to a municipality. Use it ONCE per municipality, passing ALL names from the text that you could not match from the official list (loose spellings, or sub-areas that may hide a barangay). Returns the best DB match (id/name/pcode) or null per input. Do not call it repeatedly.",
  inputSchema: z.object({
    names: z
      .array(z.string())
      .min(1)
      .describe("Barangay-like names to resolve."),
    municipalityName: z
      .string()
      .optional()
      .describe("Scope the fuzzy match to this municipality when known."),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        input: z.string(),
        match: z
          .object({
            id: z.number(),
            name: z.string(),
            municipality: z.string(),
            pcode: z.string().nullable(),
            score: z.number(),
          })
          .nullable(),
      }),
    ),
  }),
});

const fuzzyMatchBarangaysTool = fuzzyMatchBarangaysDef.server(async (args) => {
  let municipalityId: number | undefined;
  if (args.municipalityName) {
    const mun = await repo.findMunicipality(args.municipalityName);
    municipalityId = mun?.id;
  }
  const matches = await repo.fuzzyMatchBarangays({
    names: args.names,
    municipalityId,
  });
  return {
    results: matches.map((m) => ({
      input: m.input,
      match: m.match
        ? {
            id: m.match.id,
            name: m.match.name,
            municipality: m.match.municipality,
            pcode: m.match.pcode,
            score: m.match.score,
          }
        : null,
    })),
  };
});

export const areaResolverTools = [
  listMunicipalitiesTool,
  barangaysInMunicipalityTool,
  fuzzyMatchBarangaysTool,
];
