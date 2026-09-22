import { calloutsExtension } from "@tanstack/markdown/extensions/callouts";
import { parseMarkdown } from "@tanstack/markdown/parser";
import { Markdown } from "@tanstack/markdown/react";
import { createFileRoute } from "@tanstack/react-router";
import aboutMarkdown from "#/data/about.md?raw";
import { LlmProcessDemo } from "../components/LlmProcessDemo";

export const Route = createFileRoute("/about")({
  component: About,
});

const parsed = parseMarkdown(aboutMarkdown, {
  extensions: [calloutsExtension()],
});

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="flex flex-col gap-10 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="island-kicker">About</p>
          <h1 className="display-title text-4xl font-bold text-(--sea-ink) sm:text-5xl">
            Purpose of Beacon
          </h1>
        </div>
        <div className="prose max-w-3xl dark:prose-invert">
          <Markdown>{parsed}</Markdown>
        </div>
        <LlmProcessDemo />
      </section>
    </main>
  );
}
