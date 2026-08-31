import { createFileRoute } from "@tanstack/react-router";
import OutageMap from "../components/OutageMap";

export const Route = createFileRoute("/map")({
  component: MapPage,
});

function MapPage() {
  return (
    <main className="px-4 pt-6">
      <section className="h-[calc(100dvh-9rem)] min-h-120 overflow-hidden rounded-2xl border border-(--line) shadow-lg">
        <OutageMap />
      </section>
    </main>
  );
}
