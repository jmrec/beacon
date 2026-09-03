import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import OutageMap from "../components/OutageMap";

export const Route = createFileRoute("/")({
  component: MapPage,
});

function MapPage() {
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
        <OutageMap />
      </section>
    </main>
  );
}
