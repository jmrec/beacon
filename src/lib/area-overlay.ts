import type { AreaResolution } from "./beneco-area/types/internal.ts";

/** Number of outages affecting each pcode, split by admin level. */
export interface AreaOverlayCounts {
  city: Map<string, number>;
  barangay: Map<string, number>;
}

export function aggregateAffectedCounts(
  outages: readonly AreaResolution[],
): AreaOverlayCounts {
  const city = new Map<string, number>();
  const barangay = new Map<string, number>();
  const bump = (map: Map<string, number>, pcode: string) =>
    map.set(pcode, (map.get(pcode) ?? 0) + 1);

  for (const outage of outages) {
    const citySeen = new Set<string>();
    const barangaySeen = new Set<string>();

    for (const mun of outage.municipalities) {
      const { kind } = mun.scope;
      if (kind === "included") {
        for (const b of mun.scope.barangays) {
          if (b.pcode) barangaySeen.add(b.pcode);
        }
      } else if (kind === "whole" || kind === "partial" || kind === "excluded") {
        if (mun.pcode) citySeen.add(mun.pcode);
      }
    }

    for (const pcode of citySeen) bump(city, pcode);
    for (const pcode of barangaySeen) bump(barangay, pcode);
  }

  return { city, barangay };
}
