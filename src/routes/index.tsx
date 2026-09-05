import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import OutageMap from "../components/OutageMap";
import { getResolvedOutageAreas } from "../lib/beneco-area";

export const Route = createFileRoute("/")({
  loader: async () => ({
    resolvedAreas: await getResolvedOutageAreas(),
  }),
  component: MapPage,
});

function MapPage() {
  const { resolvedAreas } = Route.useLoaderData();

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
        <OutageMap resolvedAreas={resolvedAreas} />
      </section>
    </main>
  );
}
