import type { AreaOverlayOutage } from "./area-overlay.ts";
import type { BarangayAffect, MunicipalityAffect } from "./types/internal.ts";

export type AreaLevel = "barangay" | "city" | "province";

export const PCODE_LEN: Record<AreaLevel, number> = {
  province: 7,
  city: 9,
  barangay: 12,
};

export function areaLevelOf(pcode: string): AreaLevel | null {
  if (pcode.length >= PCODE_LEN.barangay) return "barangay";
  if (pcode.length >= PCODE_LEN.city) return "city";
  if (pcode.length >= PCODE_LEN.province) return "province";
  return null;
}

export function pcodeAtLevel(
  pcode: string | undefined,
  level: AreaLevel,
): string | undefined {
  const len = PCODE_LEN[level];
  return pcode && pcode.length >= len ? pcode.slice(0, len) : undefined;
}

export const PROVINCE_NAME = "Benguet";

export interface AreaLabels {
  primary: string;
  secondary?: string;
  tertiary?: string;
}

export type SheetNode =
  | { kind: "area"; pcode: string; labels: AreaLabels }
  | { kind: "outage"; outageId: number; scheduled: boolean };

export function isAreaNode(
  node: SheetNode,
): node is Extract<SheetNode, { kind: "area" }> {
  return node.kind === "area";
}

export function currentAreaNode(nodes: readonly SheetNode[]): SheetNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (isAreaNode(nodes[i])) return nodes[i];
  }
  return null;
}

export interface AffectedArea {
  level: AreaLevel;
  pcode?: string;
  name: string;
  context?: string;
  whole: boolean;
}

function includedBarangays(
  mun: MunicipalityAffect,
): { barangay: BarangayAffect; whole: boolean }[] {
  if (mun.scope.kind !== "included") return [];
  const out: { barangay: BarangayAffect; whole: boolean }[] = [];
  for (const barangay of mun.scope.barangays) {
    if (barangay.scope.kind === "excluded") continue;
    out.push({
      barangay,
      whole: barangay.scope.kind === "whole",
    });
  }
  return out;
}

export function affectedAreasOf(
  outage: AreaOverlayOutage,
  level: AreaLevel,
): AffectedArea[] {
  const result: AffectedArea[] = [];
  const seen = new Set<string>();

  if (level === "barangay") {
    for (const mun of outage.municipalities) {
      for (const { barangay, whole } of includedBarangays(mun)) {
        const key = barangay.pcode ?? `${mun.id}:${barangay.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          level: "barangay",
          pcode: barangay.pcode,
          name: barangay.name,
          context: mun.name,
          whole,
        });
      }
    }
    return result;
  }

  if (level === "city") {
    for (const mun of outage.municipalities) {
      if (mun.scope.kind === "excluded") continue;
      // Prefer the municipality's own pcode, else derive it from its barangays.
      const fromBarangays = includedBarangays(mun)[0]?.barangay.pcode;
      const pcode =
        pcodeAtLevel(mun.pcode, "city") ?? pcodeAtLevel(fromBarangays, "city");
      const key = pcode ?? `mun:${mun.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        level: "city",
        pcode,
        name: mun.name,
        whole: mun.scope.kind === "whole",
      });
    }
    return result;
  }

  // province
  const seenProv = new Set<string>();
  const anyWhole = outage.municipalities.every(
    (mun) => mun.scope.kind === "whole",
  );
  for (const mun of outage.municipalities) {
    const pcode = pcodeAtLevel(mun.pcode, "province");
    if (pcode) {
      if (seenProv.has(pcode)) continue;
      seenProv.add(pcode);
      result.push({
        level: "province",
        pcode,
        name: PROVINCE_NAME,
        whole: anyWhole,
      });
      return result;
    }
    const first = includedBarangays(mun)[0]?.barangay.pcode;
    const derived = pcodeAtLevel(first, "province");
    if (derived) {
      if (seenProv.has(derived)) continue;
      seenProv.add(derived);
      result.push({
        level: "province",
        pcode: derived,
        name: PROVINCE_NAME,
        whole: anyWhole,
      });
      return result;
    }
  }
  return result;
}

/**
 * The pcodes (at `level`) an outage affects — a fast membership view over
 * {@link affectedAreasOf}. Used for map highlighting.
 */
export function affectedPcodesOf(
  outage: AreaOverlayOutage,
  level: AreaLevel,
): Set<string> {
  const out = new Set<string>();
  for (const area of affectedAreasOf(outage, level)) {
    if (area.pcode) out.add(area.pcode);
  }
  return out;
}

/** Whether an outage is currently shown/colored on the map. */
export function isActiveOverlay(outage: AreaOverlayOutage): boolean {
  return outage.ongoing || outage.resolvedRecently;
}

/**
 * The outages relevant to a given area (identified by its own-level pcode):
 * active/resolved-recent outages whose affected set at that level includes it.
 */
export function outagesAffecting(
  outages: readonly AreaOverlayOutage[],
  level: AreaLevel,
  pcode: string,
): AreaOverlayOutage[] {
  const want = pcodeAtLevel(pcode, level) ?? pcode;
  const result: AreaOverlayOutage[] = [];
  for (const outage of outages) {
    if (!isActiveOverlay(outage)) continue;
    if (affectedPcodesOf(outage, level).has(want)) result.push(outage);
  }
  return result;
}
