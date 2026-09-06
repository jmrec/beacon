import type { AreaResolutionOutcome, Pcode } from "./types/internal.ts";

export interface AreaOverlayOutage extends AreaResolutionOutcome {
  ongoing: boolean;
  resolvedRecently: boolean;
}

export interface PcodeTally {
  ongoing: number;
  resolvedRecently: number;
}

export interface CountMap extends Map<Pcode, PcodeTally> {}

export interface AreaOverlayCounts {
  province: CountMap;
  city: CountMap;
  barangay: CountMap;
}

function bump(map: CountMap, pcode: Pcode, key: keyof PcodeTally, by = 1) {
  const entry = map.get(pcode) ?? { ongoing: 0, resolvedRecently: 0 };
  entry[key] += by;
  map.set(pcode, entry);
}

const ADM2_PCODE_LEN = 7; // province
const ADM3_PCODE_LEN = 9; // city / municipality
const ADM4_PCODE_LEN = 12; // barangay

function prefixPcode(
  pcode: string | undefined,
  length: number,
): string | undefined {
  return pcode && pcode.length >= length ? pcode.slice(0, length) : undefined;
}

export function aggregateAffectedCounts(
  outages: readonly AreaOverlayOutage[],
): AreaOverlayCounts {
  const province: CountMap = new Map();
  const city: CountMap = new Map();
  const barangay: CountMap = new Map();

  for (const outage of outages) {
    const tallyKey: keyof PcodeTally | null = outage.ongoing
      ? "ongoing"
      : outage.resolvedRecently
        ? "resolvedRecently"
        : null;
    if (tallyKey === null) continue;

    const affected = {
      barangay: new Set<Pcode>(),
      city: new Set<Pcode>(),
      province: new Set<Pcode>(),
    };

    for (const mun of outage.municipalities) {
      if (mun.scope.kind === "included") {
        for (const b of mun.scope.barangays) {
          const bp = prefixPcode(b.pcode, ADM4_PCODE_LEN);
          const cp = bp && prefixPcode(bp, ADM3_PCODE_LEN);
          const pp = bp && prefixPcode(bp, ADM2_PCODE_LEN);
          if (bp) affected.barangay.add(bp);
          if (cp) affected.city.add(cp);
          if (pp) affected.province.add(pp);
        }
      } else {
        const cp = prefixPcode(mun.pcode, ADM3_PCODE_LEN);
        const pp = cp && prefixPcode(cp, ADM2_PCODE_LEN);
        if (cp) affected.city.add(cp);
        if (pp) affected.province.add(pp);
      }
    }

    for (const pcode of affected.barangay) bump(barangay, pcode, tallyKey);
    for (const pcode of affected.city) bump(city, pcode, tallyKey);
    for (const pcode of affected.province) bump(province, pcode, tallyKey);
  }

  return { province, city, barangay };
}

export function tallyColor(tally: PcodeTally): string | null {
  if (tally.ongoing > 0) {
    return RED_SHADES[Math.min(tally.ongoing, RED_SHADES.length) - 1];
  }
  if (tally.resolvedRecently > 0) return GREEN;
  return null;
}

const GREEN = "#22c55e";

const RED_SHADES = ["#f87171", "#ef4444", "#dc2626", "#b91c1c"];

export interface AreaOverlayPartial {
  province: Set<Pcode>;
  city: Set<Pcode>;
  barangay: Set<Pcode>;
}

export function aggregatePartial(
  outages: readonly AreaOverlayOutage[],
): AreaOverlayPartial {
  const partial = {
    province: new Set<Pcode>(),
    city: new Set<Pcode>(),
    barangay: new Set<Pcode>(),
  };

  for (const outage of outages) {
    const active = outage.ongoing || outage.resolvedRecently;
    if (!active) continue;

    for (const mun of outage.municipalities) {
      if (mun.scope.kind === "included") {
        for (const b of mun.scope.barangays) {
          const bp = prefixPcode(b.pcode, ADM4_PCODE_LEN);
          const cp = bp && prefixPcode(bp, ADM3_PCODE_LEN);
          const pp = bp && prefixPcode(bp, ADM2_PCODE_LEN);
          if (bp && b.scope.kind !== "whole") partial.barangay.add(bp);
          if (cp) partial.city.add(cp);
          if (pp) partial.province.add(pp);
        }
      } else {
        const cp = prefixPcode(mun.pcode, ADM3_PCODE_LEN);
        const pp = cp && prefixPcode(cp, ADM2_PCODE_LEN);
        if (cp && mun.scope.kind !== "whole") partial.city.add(cp);
        if (pp) partial.province.add(pp);
      }
    }
  }

  return partial;
}
