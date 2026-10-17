import { z } from "zod";

const confidence = z
  .enum(["high", "medium", "low"])
  .describe(
    "Confidence level of the match: 'high' = verbatim match; 'medium' = matched via parts-of / parenthetical context / a loose spelling; 'low' = inferred with uncertainty.",
  );

//
// BARANGAY
//

export const BarangayScopeWireSchema = z
  .object({
    kind: z
      .enum(["whole", "partial", "included", "excluded"])
      .describe(
        "'whole' = all areas; 'partial' = some areas but none are specified by name; 'included' = only the named areas; 'excluded' = all areas except the named ones.",
      ),
    areas: z
      .array(z.string())
      .optional()
      .describe(
        "List of specific sitio/purok/sub-area names. Only provide when kind is 'included' or 'excluded'.",
      ),
  })
  .superRefine((s, ctx) => {
    const hasAreas = s.areas !== undefined && s.areas.length > 0;
    const requiresAreas = s.kind === "included" || s.kind === "excluded";

    if (requiresAreas && !hasAreas) {
      ctx.addIssue({
        code: "custom",
        path: ["areas"],
        message: `'${s.kind}' requires at least one area name`,
      });
    }
    if (!requiresAreas && s.areas !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["areas"],
        message: `'${s.kind}' must not specify areas`,
      });
    }
  });

export type BarangayScopeWire = z.infer<typeof BarangayScopeWireSchema>;

export const BarangayAffectWireSchema = z.object({
  id: z.number().int().describe("beneco.barangays.id"),
  name: z.string(),
  pcode: z.string().optional().describe("Philippine barangay code, if any"),
  confidence,
  scope: BarangayScopeWireSchema,
});

export type BarangayAffectWire = z.infer<typeof BarangayAffectWireSchema>;

//
// MUNICIPALITY
//

export const MunicipalityScopeWireSchema = z
  .object({
    kind: z
      .enum(["whole", "partial", "included", "excluded"])
      .describe(
        "'whole' = all barangays affected; 'partial' = partly affected but not itemised; 'included' = only these barangays affected; 'excluded' = all barangays affected except these.",
      ),
    barangays: z
      .array(BarangayAffectWireSchema)
      .optional()
      .describe(
        "Barangays affected (kind=included) or not affected (kind=excluded). Only provide when kind is 'included' or 'excluded'.",
      ),
  })
  .superRefine((s, ctx) => {
    const hasBarangays = s.barangays !== undefined && s.barangays.length > 0;
    const requiresBarangays = s.kind === "included" || s.kind === "excluded";

    if (requiresBarangays && !hasBarangays) {
      ctx.addIssue({
        code: "custom",
        path: ["barangays"],
        message: `'${s.kind}' requires at least one barangay`,
      });
    }
    if (!requiresBarangays && s.barangays !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["barangays"],
        message: `'${s.kind}' must not specify barangays`,
      });
    }
  });

export type MunicipalityScopeWire = z.infer<typeof MunicipalityScopeWireSchema>;

export const MunicipalityAffectWireSchema = z.object({
  id: z.number().int().describe("beneco.municipalities.id"),
  name: z.string(),
  pcode: z.string().optional().describe("Philippine municipality code, if any"),
  confidence,
  scope: MunicipalityScopeWireSchema,
});

export type MunicipalityAffectWire = z.infer<
  typeof MunicipalityAffectWireSchema
>;

//
// AREA RESOLUTION
//

export const AreaResolutionWireSchema = z.object({
  municipalities: z
    .array(MunicipalityAffectWireSchema)
    .describe("Affected municipalities, each with its affected barangays."),
  unresolved: z
    .array(z.string())
    .describe(
      "Place-looking tokens that could not be mapped to any municipality/barangay.",
    ),
});

export type AreaResolutionWire = z.infer<typeof AreaResolutionWireSchema>;
