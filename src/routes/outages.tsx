import { createFileRoute } from "@tanstack/react-router";
import OutageList from "../components/OutageList";

export const Route = createFileRoute("/outages")({
  component: Outages,
});

function Outages() {
  return (
    <main className="p-4 md:p-6">
      <section className="flex flex-col gap-6 rounded-2xl">
        <OutageList />
      </section>
    </main>
  );
}
