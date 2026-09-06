import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import OutageMap from "../components/OutageMap";
import { env } from "../env";
import { getResolvedOutageAreas } from "../lib/beneco-area";

export const Route = createFileRoute("/")({
  loader: async () => ({
    resolvedAreas: await getResolvedOutageAreas(),
    recentlyResolvedWindow: env.BENECO_RECENTLY_RESOLVED_WINDOW,
  }),
  component: MapPage,
});

function MapPage() {
  const { resolvedAreas, recentlyResolvedWindow } = Route.useLoaderData();

  console.debug("resolvedAreas", resolvedAreas.length);

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
          resolvedAreas={resolvedAreas}
          recentlyResolvedWindow={recentlyResolvedWindow}
        />
      </section>
    </main>
  );
}
