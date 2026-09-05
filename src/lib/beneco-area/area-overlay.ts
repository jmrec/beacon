import type { AreaResolutionOutcome, Pcode } from "./types/internal.ts";

export interface AreaOverlayOutage extends AreaResolutionOutcome {
  ongoing: boolean;
  resolvedRecently: boolean;
}

export interface PcodeTally {
  ongoing: number;
  resolvedRecently: number;
}

export interface AreaOverlayCounts {
  city: Map<Pcode, PcodeTally>;
  barangay: Map<Pcode, PcodeTally>;
}

function bump(
  map: Map<Pcode, PcodeTally>,
  pcode: Pcode,
  key: keyof PcodeTally,
) {
  const entry = map.get(pcode) ?? { ongoing: 0, resolvedRecently: 0 };
  entry[key] += 1;
  map.set(pcode, entry);
}

export function aggregateAffectedCounts(
  outages: readonly AreaOverlayOutage[],
): AreaOverlayCounts {
  const city = new Map<Pcode, PcodeTally>();
  const barangay = new Map<Pcode, PcodeTally>();

  for (const outage of outages) {
    const tallyKey: keyof PcodeTally | null = outage.ongoing
      ? "ongoing"
      : outage.resolvedRecently
        ? "resolvedRecently"
        : null;
    if (tallyKey === null) continue;

    const citySeen = new Set<Pcode>();
    const barangaySeen = new Set<Pcode>();

    for (const mun of outage.municipalities) {
      const { kind } = mun.scope;
      if (kind === "included") {
        for (const b of mun.scope.barangays) {
          if (b.pcode) barangaySeen.add(b.pcode);
        }
      } else if (
        kind === "whole" ||
        kind === "partial" ||
        kind === "excluded"
      ) {
        if (mun.pcode) citySeen.add(mun.pcode);
      }
    }

    for (const pcode of citySeen) bump(city, pcode, tallyKey);
    for (const pcode of barangaySeen) bump(barangay, pcode, tallyKey);
  }

  return { city, barangay };
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
