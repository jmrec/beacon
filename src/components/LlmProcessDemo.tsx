import { cn } from "cn";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

const rawOutage = {
  id: 68090,
  feeder: "Feeder 5A",
  area: "Baguio City: (parts of Bonifacio Rd. from Rex Hall), parts of Upper General Luna (along Laurel St. near BLET), Kabayanihan, Session Road (left-side going up, Upper Mabini, Assumption Rd., University of Baguio, BBCCCI, Porta Vaga, Post Office Loop, Cathedral, Barrio Fiesta, NBI), Salud Mitra (including Happy Glen Loop and Jungle Town), Lower General Luna (including SLU-LES, Notre Dame Hospital New and Old)",
  cause: "Repair and maintenance of cut high voltage line.",
  timeoff: "2026-09-03 18:44:31",
  timerestored: "2026-09-03 18:48:44",
  duration: "4Mins, 13Secs",
  status: "Restored",
  legacy_photos: [],
  latest_update: null,
  updates: [],
};

const resolvedOutage = {
  unresolved: [],
  municipalities: [
    {
      id: 2,
      name: "BAGUIO CITY",
      scope: {
        kind: "included",
        barangays: [
          {
            id: 18,
            name: "Andres Bonifacio",
            pcode: "PH1401102117",
            scope: {
              kind: "included",
              areas: ["Bonifacio Rd. from Rex Hall"],
            },
            confidence: "medium",
          },
          {
            id: 256,
            name: "Upper General Luna",
            pcode: "PH1401102038",
            scope: {
              kind: "included",
              areas: ["along Laurel St. near BLET"],
            },
            confidence: "high",
          },
          {
            id: 126,
            name: "Kabayanihan",
            pcode: "PH1401102142",
            scope: { kind: "whole" },
            confidence: "high",
          },
          {
            id: 221,
            name: "Session Road",
            pcode: "PH1401102106",
            scope: {
              kind: "included",
              areas: [
                "left-side going up",
                "Upper Mabini",
                "Assumption Rd.",
                "University of Baguio",
                "BBCCCI",
                "Porta Vaga",
                "Post Office Loop",
                "Cathedral",
                "Barrio Fiesta",
                "NBI",
              ],
            },
            confidence: "high",
          },
          {
            id: 212,
            name: "Salud Mitra",
            pcode: "PH1401102094",
            scope: {
              kind: "included",
              areas: ["Happy Glen Loop", "Jungle Town"],
            },
            confidence: "high",
          },
          {
            id: 145,
            name: "Lower General Luna",
            pcode: "PH1401102039",
            scope: {
              kind: "included",
              areas: ["SLU-LES", "Notre Dame Hospital New and Old"],
            },
            confidence: "high",
          },
        ],
      },
      confidence: "high",
    },
  ],
};

const RAW_JSON = JSON.stringify(rawOutage, null, 2);
const RESOLVED_JSON = JSON.stringify(resolvedOutage, null, 2);

function JsonBlock({ code, className }: { code: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-112 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs leading-5 text-foreground",
        className,
      )}
    >
      {code}
    </pre>
  );
}

export function LlmProcessDemo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>See the resolver in action</CardTitle>
        <CardDescription>
          One real BENECO advisory, and the structured areas Beacon extracts
          from its free-text description.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid items-start gap-6 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">
                Raw advisory
              </p>
              <p className="text-sm text-muted-foreground">
                What BENECO&rsquo;s API returns for one unscheduled outage.
                Everything the resolver needs lives inside the{" "}
                <code className="font-mono">area</code> string.
              </p>
            </div>
            <JsonBlock code={RAW_JSON} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">
                Resolved areas
              </p>
              <p className="text-sm text-muted-foreground">
                The resolver&rsquo;s output: each barangay gets a scope (whole
                vs. included areas) and a confidence. Here, nothing is left{" "}
                <code className="font-mono">unresolved</code>.
              </p>
            </div>
            <JsonBlock code={RESOLVED_JSON} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
