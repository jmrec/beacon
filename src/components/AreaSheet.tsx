import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef } from "react";
import type { AreaOverlayOutage } from "#/lib/beneco-area/area-overlay.ts";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type StatusKey,
  statusKey,
} from "#/lib/beneco-area/outage-status";
import {
  type AreaLevel,
  affectedAreasOf,
  affectedPcodesOf,
  areaLevelOf,
  outagesAffecting,
  type SheetNode,
} from "#/lib/beneco-area/sheet.ts";
import type { OutageFeed } from "#/lib/beneco-area/types/internal";
import type { Outage, Pcode } from "#/lib/beneco-area/types/internal.ts";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export interface MapHighlight {
  level: AreaLevel;
  pcodes: Pcode[];
}

interface AreaOutageRow {
  id: string;
  outage: AreaOverlayOutage;
  area: string;
  schedule: string;
  status: StatusKey;
}

interface AffectedAreaRow {
  id: string;
  pcode?: Pcode;
  name: string;
  context?: string;
  whole: boolean;
}

const EMPTY_AREAS: AreaOutageRow[] = [];
const EMPTY_AFFECTED: AffectedAreaRow[] = [];

function detailOf(outage: AreaOverlayOutage, feed: OutageFeed): Outage | null {
  const arr = outage.kind === "unscheduled" ? feed.unscheduled : feed.scheduled;
  return arr.find((o) => o.id === outage.outageId) ?? null;
}

function outageRow(outage: AreaOverlayOutage, feed: OutageFeed): AreaOutageRow {
  const item = detailOf(outage, feed);
  return {
    id: `${outage.kind === "unscheduled" ? "u" : "s"}-${outage.outageId}`,
    outage,
    area: item?.area || item?.feeder || `Outage #${outage.outageId}`,
    schedule: item?.schedule ?? "",
    status: item ? statusKey(item.status) : "ongoing",
  };
}

const features = tableFeatures({});
const outageHelper = createColumnHelper<typeof features, AreaOutageRow>();
const outageColumns = outageHelper.columns([
  outageHelper.accessor("area", {
    header: "Outage",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          {row.original.area}
        </span>
        {row.original.schedule ? (
          <span className="truncate text-xs text-muted-foreground">
            {row.original.schedule}
          </span>
        ) : null}
      </div>
    ),
  }),
  outageHelper.accessor("status", {
    header: "",
    cell: ({ row }) => (
      <Badge variant="secondary" className={STATUS_TONE[row.original.status]}>
        {STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  }),
]);

const areaHelper = createColumnHelper<typeof features, AffectedAreaRow>();
const areaColumns = areaHelper.columns([
  areaHelper.accessor("name", {
    header: "Area",
    cell: ({ row }) => {
      const area = row.original;
      return (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{area.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {[area.context, area.whole ? "Whole" : "Partial"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      );
    },
  }),
]);

export default function AreaSheet({
  nodes,
  onNodesChange,
  activeLevel,
  resolvedAreas,
  outages,
  onHighlight,
}: {
  nodes: SheetNode[];
  onNodesChange: (nodes: SheetNode[]) => void;
  activeLevel: AreaLevel;
  resolvedAreas: AreaOverlayOutage[];
  outages: OutageFeed;
  onHighlight: (h: MapHighlight | null) => void;
}) {
  const open = nodes.length > 0;
  const top = nodes[nodes.length - 1] ?? null;

  const feed: OutageFeed = outages;
  const activeLevelRef = useRef(activeLevel);
  activeLevelRef.current = activeLevel;

  const clearHighlight = () => onHighlight(null);

  const crumbLabel = (node: SheetNode): string => {
    if (node.kind === "area") return node.labels.primary;
    const row = resolvedAreas.find(
      (o) =>
        o.outageId === node.outageId &&
        (node.scheduled ? o.kind === "scheduled" : o.kind === "unscheduled"),
    );
    if (row) return detailOf(row, feed)?.feeder || `Outage #${node.outageId}`;
    return `Outage #${node.outageId}`;
  };

  const areaRows = useMemo<AreaOutageRow[]>(() => {
    if (!top || top.kind !== "area") return EMPTY_AREAS;
    const level = areaLevelOf(top.pcode);
    if (!level) return EMPTY_AREAS;
    return outagesAffecting(resolvedAreas, level, top.pcode).map((o) =>
      outageRow(o, feed),
    );
  }, [top, resolvedAreas, feed]);

  const outageFocus = useMemo(() => {
    if (!top || top.kind !== "outage") return null;
    return (
      resolvedAreas.find(
        (o) =>
          o.outageId === top.outageId &&
          (top.scheduled ? o.kind === "scheduled" : o.kind === "unscheduled"),
      ) ?? null
    );
  }, [top, resolvedAreas]);

  const affectedRows = useMemo<AffectedAreaRow[]>(() => {
    if (!outageFocus) return EMPTY_AFFECTED;
    return affectedAreasOf(outageFocus, activeLevel).map((a, i) => ({
      id: a.pcode ?? `${a.name}-${i}`,
      pcode: a.pcode,
      name: a.name,
      context: a.context,
      whole: a.whole,
    }));
  }, [outageFocus, activeLevel]);

  const detail = outageFocus ? detailOf(outageFocus, feed) : null;
  const status = detail ? statusKey(detail.status) : null;

  const highlightOutage = (outage: AreaOverlayOutage | null) => {
    if (!outage) return onHighlight(null);
    const pcodes = Array.from(affectedPcodesOf(outage, activeLevelRef.current));
    onHighlight(
      pcodes.length > 0 ? { level: activeLevelRef.current, pcodes } : null,
    );
  };

  const drillOutage = (outage: AreaOverlayOutage) => {
    onNodesChange([
      ...nodes,
      {
        kind: "outage",
        outageId: outage.outageId,
        scheduled: outage.kind === "scheduled",
      },
    ]);
  };

  const drillArea = (pcode: string, name: string) => {
    onNodesChange([
      ...nodes,
      { kind: "area", pcode, labels: { primary: name } },
    ]);
  };

  const navigateTo = (index: number) =>
    onNodesChange(nodes.slice(0, index + 1));
  const back = () => {
    if (nodes.length > 1) onNodesChange(nodes.slice(0, -1));
    else onNodesChange([]);
  };

  const title =
    top?.kind === "area"
      ? top.labels.primary
      : detail?.feeder ||
        (top?.kind === "outage" ? `Outage #${top.outageId}` : "");
  const subtitle =
    top?.kind === "area"
      ? [top.labels.secondary, top.labels.tertiary].filter(Boolean).join(", ")
      : detail?.schedule || "";

  const outageTable = useTable({
    features,
    columns: outageColumns,
    data: areaRows,
  });
  const affectedTable = useTable({
    features,
    columns: areaColumns,
    data: affectedRows,
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onNodesChange([]);
      }}
    >
      <SheetContent side="right" className="w-80 overflow-hidden sm:max-w-md">
        <SheetHeader className="shrink-0 border-b px-4 pb-3">
          <div className="flex items-center gap-2">
            {nodes.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                onClick={back}
                className="cursor-pointer"
              >
                <ArrowLeft />
              </Button>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <SheetTitle className="truncate text-base">{title}</SheetTitle>
              {subtitle && (
                <SheetDescription className="truncate text-xs">
                  {subtitle}
                </SheetDescription>
              )}
            </div>
          </div>
          {nodes.length > 1 && (
            <nav className="mt-1 flex items-center gap-1 overflow-x-auto text-[11px] text-muted-foreground">
              {nodes.map((node, i) => (
                <span
                  key={
                    node.kind === "area"
                      ? `a-${node.pcode}`
                      : `o-${node.outageId}`
                  }
                  className="flex min-w-0 items-center gap-1"
                >
                  {i > 0 && <ChevronRight className="size-3 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => navigateTo(i)}
                    className={`cursor-pointer truncate transition hover:text-foreground ${
                      i === nodes.length - 1
                        ? "font-semibold text-foreground"
                        : ""
                    }`}
                  >
                    {crumbLabel(node)}
                  </button>
                </span>
              ))}
            </nav>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {top?.kind === "area" ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {areaRows.length === 0
                  ? "No active outages affecting this area."
                  : `${areaRows.length} active ${
                      areaRows.length === 1 ? "outage" : "outages"
                    } · hover to preview on the map`}
              </p>
              {areaRows.length > 0 && (
                <table
                  onMouseLeave={clearHighlight}
                  className="w-full overflow-hidden rounded-lg border border-[var(--line)]"
                >
                  <tbody>
                    {outageTable.getRowModel().rows.map((row) => {
                      const outage = row.original.outage;
                      return (
                        <tr
                          key={row.original.id}
                          onClick={() => drillOutage(outage)}
                          onMouseEnter={() => highlightOutage(outage)}
                          className="cursor-pointer border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--surface)]"
                        >
                          {row.getAllCells().map((cell) => (
                            <td
                              key={cell.id}
                              className="px-3 py-2 align-middle"
                            >
                              <outageTable.FlexRender cell={cell} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : outageFocus ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {detail?.feeder || `Outage #${outageFocus.outageId}`}
                  </p>
                  {status && (
                    <Badge variant="secondary" className={STATUS_TONE[status]}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  )}
                </div>
                {detail?.area && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {detail.area}
                  </p>
                )}
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd>{detail?.schedule || "—"}</dd>
                  {outageFocus.kind === "unscheduled" && (
                    <>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd>
                        {detail ? STATUS_LABEL[statusKey(detail.status)] : "—"}
                      </dd>
                    </>
                  )}
                  {outageFocus.kind === "scheduled" &&
                    detail?.consumers != null && (
                      <>
                        <dt className="text-muted-foreground">Consumers</dt>
                        <dd>{detail.consumers.toLocaleString()}</dd>
                      </>
                    )}
                  {outageFocus.kind === "scheduled" && detail?.purpose && (
                    <>
                      <dt className="text-muted-foreground">Purpose</dt>
                      <dd>{detail.purpose}</dd>
                    </>
                  )}
                </dl>
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                Affected areas ·{" "}
                {activeLevel === "barangay"
                  ? "barangay"
                  : activeLevel === "city"
                    ? "city/municipality"
                    : "province"}{" "}
                level · hover to preview, click to focus
              </p>
              {affectedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No enumerable areas at this zoom level. Switch the admin level
                  for a coarser view.
                </p>
              ) : (
                <table
                  onMouseLeave={clearHighlight}
                  className="w-full overflow-hidden rounded-lg border border-[var(--line)]"
                >
                  <tbody>
                    {affectedTable.getRowModel().rows.map((row) => {
                      const area = row.original;
                      return (
                        <tr
                          key={area.id}
                          onClick={() =>
                            area.pcode && drillArea(area.pcode, area.name)
                          }
                          onMouseEnter={() =>
                            area.pcode
                              ? onHighlight({
                                  level: activeLevel,
                                  pcodes: [area.pcode],
                                })
                              : onHighlight(null)
                          }
                          className={`border-b border-[var(--line)] transition last:border-0 hover:bg-[var(--surface)] ${
                            area.pcode
                              ? "cursor-pointer"
                              : "cursor-default opacity-60"
                          }`}
                        >
                          {row.getAllCells().map((cell) => (
                            <td
                              key={cell.id}
                              className="px-3 py-2 align-middle"
                            >
                              <affectedTable.FlexRender cell={cell} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This outage is no longer active.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
