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

export function aggregateOverlay(outages: readonly AreaOverlayOutage[]): {
  counts: AreaOverlayCounts;
  partial: AreaOverlayPartial;
} {
  const province: CountMap = new Map();
  const city: CountMap = new Map();
  const barangay: CountMap = new Map();
  const wholeProvince = new Set<Pcode>();
  const wholeCity = new Set<Pcode>();
  const wholeBarangay = new Set<Pcode>();

  for (const outage of outages) {
    const tallyKey: keyof PcodeTally | null = outage.ongoing
      ? "ongoing"
      : outage.resolvedRecently
        ? "resolvedRecently"
        : null;
    if (tallyKey === null) continue;

    for (const mun of outage.municipalities) {
      if (mun.scope.kind === "included") {
        for (const b of mun.scope.barangays) {
          const bp = prefixPcode(b.pcode, ADM4_PCODE_LEN);
          const cp = bp && prefixPcode(bp, ADM3_PCODE_LEN);
          const pp = bp && prefixPcode(bp, ADM2_PCODE_LEN);
          if (bp) {
            bump(barangay, bp, tallyKey);
            if (b.scope.kind === "whole") wholeBarangay.add(bp);
          }
          if (cp) bump(city, cp, tallyKey);
          if (pp) bump(province, pp, tallyKey);
        }
      } else {
        const cp = prefixPcode(mun.pcode, ADM3_PCODE_LEN);
        const pp = cp && prefixPcode(cp, ADM2_PCODE_LEN);
        if (cp) {
          bump(city, cp, tallyKey);
          if (mun.scope.kind === "whole") wholeCity.add(cp);
        }
        if (pp) {
          bump(province, pp, tallyKey);
          if (mun.scope.kind === "whole") wholeProvince.add(pp);
        }
      }
    }
  }

  return {
    counts: { province, city, barangay },
    partial: {
      province: minusWhole(province, wholeProvince),
      city: minusWhole(city, wholeCity),
      barangay: minusWhole(barangay, wholeBarangay),
    },
  };
}

function minusWhole(counts: CountMap, whole: Set<Pcode>): Set<Pcode> {
  const out = new Set<Pcode>();
  for (const pcode of counts.keys()) {
    if (!whole.has(pcode)) out.add(pcode);
  }
  return out;
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
