import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import type { AreaOverlayOutage } from "#/lib/beneco-area/area-overlay.ts";
import type { SheetNode } from "#/lib/beneco-area/sheet.ts";
import type {OutageFeed} from "#/lib/beneco-area/types/internal"
import OutageMap from "../components/OutageMap";
import { getResolvedOutageAreas } from "../lib/beneco-area";
import { getOutageFeedForMap } from "../lib/beneco-area/feed";
import { outagePeriodStore } from "../lib/outage-period";

const EMPTY_FEED: OutageFeed = { unscheduled: [], scheduled: [] };

interface MapData {
  resolvedAreas: AreaOverlayOutage[];
  outages: OutageFeed;
}

function parseNodes(raw: string | undefined): SheetNode[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SheetNode[];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    v: typeof search.v === "string" ? search.v : undefined,
  }),
  component: MapPage,
});

function MapPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const period = useSelector(outagePeriodStore, (s) => s.period);

  const nodes = useMemo<SheetNode[]>(() => parseNodes(search.v), [search.v]);

  const setNodes = (next: SheetNode[]) => {
    void navigate({
      search: {
        v: next.length > 0 ? JSON.stringify(next) : undefined,
      },
    });
  };

  const { data } = useQuery<MapData>({
    queryKey: ["beneco-map", period],
    queryFn: async () => {
      const [resolvedAreas, outages] = await Promise.all([
        getResolvedOutageAreas({ data: { period } }),
        getOutageFeedForMap({ data: { period } }).catch(() => EMPTY_FEED),
      ]);
      return { resolvedAreas, outages };
    },
    // Keep the previous period's map visible while the new period loads.
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("map-layout");
    return () => {
      root.classList.remove("map-layout");
    };
  }, []);

  return (
    <main className="relative min-h-0 overflow-hidden">
      <section className="h-full w-full overflow-hidden">
        <OutageMap
          resolvedAreas={data?.resolvedAreas ?? []}
          period={period}
          outages={data?.outages ?? EMPTY_FEED}
          nodes={nodes}
          onNodesChange={setNodes}
        />
      </section>
    </main>
  );
}
