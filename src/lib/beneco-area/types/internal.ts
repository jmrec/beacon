import type {
  AreaResolutionWire,
  BarangayAffectWire,
  BarangayScopeWire,
  MunicipalityAffectWire,
  MunicipalityScopeWire,
} from "./llm";
import { AreaResolutionWireSchema } from "./llm";

export type Confidence = "high" | "medium" | "low";

export type Pcode = string;

//
// BARANGAY
//

export type BarangayScope =
  | { kind: "whole" | "partial" }
  | { kind: "included" | "excluded"; areas: [string, ...string[]] }; // `areas` is guaranteed to be non-empty by the wire schema's superRefine.

function toBarangayScope(wire: BarangayScopeWire): BarangayScope {
  if (wire.kind === "included" || wire.kind === "excluded") {
    return {
      kind: wire.kind,
      areas: wire.areas as [string, ...string[]],
    };
  }
  return { kind: wire.kind };
}

export interface BarangayAffect {
  id: number;
  name: string;
  pcode?: Pcode;
  confidence: Confidence;
  scope: BarangayScope;
}

function toBarangayAffect(wire: BarangayAffectWire): BarangayAffect {
  return {
    id: wire.id,
    name: wire.name,
    pcode: wire.pcode,
    confidence: wire.confidence,
    scope: toBarangayScope(wire.scope),
  };
}

//
// MUNICIPALITY
//

export type MunicipalityScope =
  | { kind: "whole" | "partial" }
  | {
      kind: "included" | "excluded";
      barangays: [BarangayAffect, ...BarangayAffect[]];
    }; // `barangays` is guaranteed to be non-empty by the wire schema's superRefine.

function toMunicipalityScope(wire: MunicipalityScopeWire): MunicipalityScope {
  if (wire.kind === "included" || wire.kind === "excluded") {
    const barangays = (wire.barangays ?? []).map(toBarangayAffect) as [
      BarangayAffect,
      ...BarangayAffect[],
    ];
    return { kind: wire.kind, barangays };
  }
  return { kind: wire.kind };
}

export interface MunicipalityAffect {
  id: number;
  name: string;
  pcode?: Pcode;
  confidence: Confidence;
  scope: MunicipalityScope;
}

function toMunicipalityAffect(
  wire: MunicipalityAffectWire,
): MunicipalityAffect {
  return {
    id: wire.id,
    name: wire.name,
    pcode: wire.pcode,
    confidence: wire.confidence,
    scope: toMunicipalityScope(wire.scope),
  };
}

//
// AREA RESOLUTION
//

export interface AreaResolution {
  municipalities: MunicipalityAffect[];
  unresolved: string[];
}

function toAreaResolution(wire: AreaResolutionWire): AreaResolution {
  return {
    municipalities: wire.municipalities.map(toMunicipalityAffect),
    unresolved: wire.unresolved,
  };
}

/** Validate raw model output against the wire schema, then narrow to domain. */
export function parseAreaResolution(raw: unknown): AreaResolution {
  return toAreaResolution(AreaResolutionWireSchema.parse(raw));
}

//
// TASKS
//

export interface AreaTask {
  key: string;
  kind: "unscheduled" | "scheduled";
  outageId: number;
  text: string;
  feeder?: string;
}

export interface AreaResolutionOutcome extends AreaResolution {
  key: string;
  kind: AreaTask["kind"];
  outageId: number;
}

//
// BENECO API
//

export type { OutageFeed, OutagePeriod } from "./api";

export type OutageKind = AreaTask["kind"];

export type OutageStatus =
  | { kind: "unscheduled"; state: "ongoing" | "restored" }
  | { kind: "scheduled"; state: "scheduled" | "cancelled" };

export interface Outage {
  id: number;
  kind: OutageKind;
  feeder: string;
  area: string;
  status: OutageStatus;
  consumers: number | null;
  purpose: string;
  schedule: string;
}
