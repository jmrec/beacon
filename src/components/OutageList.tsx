import { useQuery } from "@tanstack/react-query";
import type { ColDef, GridApi } from "ag-grid-community";
import {
  AllCommunityModule,
  enableDevValidations,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  Activity,
  CalendarDays,
  CalendarX2,
  Power,
  Search,
  Users,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getOutages } from "../lib/beneco-area/feed";
import type { OutageFeed, OutagePeriod } from "../lib/beneco-area/types/api";
import { Badge } from "./ui/badge";

ModuleRegistry.registerModules([AllCommunityModule]);
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  enableDevValidations();
}

const PERIODS: { value: OutagePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
];

// Colours reference the app's theme tokens (via var()) so the grid follows the
// light/dark toggle automatically.
const gridTheme = themeQuartz.withParams({
  fontFamily: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
  backgroundColor: "var(--bg-base)",
  foregroundColor: "var(--sea-ink)",
  textColor: "var(--sea-ink)",
  cellTextColor: "var(--sea-ink)",
  headerTextColor: "var(--sea-ink-soft)",
  headerBackgroundColor: "var(--surface)",
  dataBackgroundColor: "var(--surface-strong)",
  borderColor: "var(--line)",
  accentColor: "var(--lagoon)",
});

const defaultColDef = {
  sortable: true,
  resizable: true,
  filter: false,
};

type View = "all" | "scheduled";

interface OutageRow {
  id: string;
  type: "Unscheduled" | "Scheduled";
  feeder: string;
  area: string;
  when: string;
  status: string;
  consumers: number | null;
}

const EMPTY_ROWS: OutageRow[] = [];

function TypeCell({ value }: { value?: string }) {
  const scheduled = value === "Scheduled";
  return (
    <Badge
      variant="secondary"
      className={
        scheduled
          ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      }
    >
      {value ?? ""}
    </Badge>
  );
}

function StatusCell({ data }: { data?: OutageRow }) {
  if (!data) return null;
  if (data.type === "Scheduled") {
    const cancelled = data.status === "Cancelled";
    return (
      <Badge
        variant="secondary"
        className={
          cancelled
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
        }
      >
        {cancelled ? "Cancelled" : "Scheduled"}
      </Badge>
    );
  }
  const ongoing = data.status === "Ongoing";
  return (
    <Badge
      variant="secondary"
      className={
        ongoing
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      }
    >
      {ongoing ? "Ongoing" : data.status || "Restored"}
    </Badge>
  );
}

const colDefs: ColDef<OutageRow>[] = [
  {
    field: "type",
    headerName: "Type",
    width: 140,
    filter: true,
    filterParams: {
      buttons: ["reset"],
    },
    cellRenderer: TypeCell,
  },
  {
    field: "feeder",
    headerName: "Feeder",
    flex: 1,
    filter: true,
    filterParams: {
      buttons: ["reset"],
    },
    minWidth: 120,
  },
  {
    field: "area",
    headerName: "Area",
    flex: 2,
    filter: true,
    filterParams: { buttons: ["reset"] },
    minWidth: 200,
  },
  {
    field: "when",
    headerName: "Schedule",
    flex: 1.5,
    filter: true,
    filterParams: {
      buttons: ["reset"],
    },
    minWidth: 180,
  },
  {
    field: "status",
    headerName: "Status",
    width: 130,
    filter: true,
    filterParams: {
      buttons: ["reset"],
    },
    cellRenderer: StatusCell,
  },
  {
    field: "consumers",
    headerName: "Consumers",
    width: 120,
    filter: true,
    filterParams: {
      buttons: ["reset"],
    },
    valueFormatter: (p) => (p.value ? Number(p.value).toLocaleString() : ""),
  },
];

export default function OutageList() {
  const [period, setPeriod] = useState<OutagePeriod>("this_week");
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [resultCount, setResultCount] = useState(0);

  const gridApiRef = useRef<GridApi | null>(null);

  const { data, isLoading, isError } = useQuery<OutageFeed>({
    queryKey: ["beneco", period],
    queryFn: () => getOutages({ data: { period } }),
  });

  const rows = useMemo<OutageRow[]>(() => {
    if (!data) return EMPTY_ROWS;
    const unscheduled: OutageRow[] = data.unscheduled.map((o) => ({
      id: `u-${o.id}`,
      type: "Unscheduled",
      feeder: o.feeder.trim(),
      area: o.area,
      when: `Off ${o.timeoff} · ${o.duration}`,
      status: o.status,
      consumers: null,
    }));
    const scheduled: OutageRow[] = data.scheduled.map((o) => ({
      id: `s-${o.id}`,
      type: "Scheduled",
      feeder: o.feeder.trim(),
      area: o.areas,
      when: `${o.date} · ${o.timeoff}–${o.timerestored}`,
      status: o.cancelled === 1 ? "Cancelled" : "Scheduled",
      consumers: o.noofcons,
    }));
    return [...unscheduled, ...scheduled];
  }, [data]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort(),
    [rows],
  );

  // Rows for the active view. View switching happens OUTSIDE the grid (we feed
  // it a different dataset), so nothing ever mutates filters back — no loops.
  const viewRows = useMemo(
    () =>
      view === "scheduled" ? rows.filter((r) => r.type === "Scheduled") : rows,
    [rows, view],
  );

  // Mirror of search + status, used only for the INACTIVE tab badge (the grid
  // can't report a filtered count for a dataset it isn't showing).
  const mirror = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const m = (r: OutageRow) => {
      if (status !== "all" && r.status !== status) return false;
      if (tokens.length === 0) return true;
      const hay = [
        r.type,
        r.feeder,
        r.area,
        r.when,
        r.status,
        r.consumers ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    };
    return {
      all: rows.filter(m).length,
      scheduled: rows.filter((r) => r.type === "Scheduled" && m(r)).length,
    };
  }, [rows, search, status]);

  // Status enum drives AG Grid's own column filter on the loaded dataset.
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const model =
      status === "all"
        ? null
        : { filterType: "text", type: "equals", filter: status };
    api.setColumnFilterModel("status", model).then(() => api.onFilterChanged());
  }, [status]);

  // The active tab and paragraph use the grid's live displayed count (includes
  // the search box and AG Grid's built-in column filters). The inactive tab
  // falls back to the search/status mirror above.
  const allCount = view === "all" ? resultCount : mirror.all;
  const scheduledCount = view === "scheduled" ? resultCount : mirror.scheduled;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--sea-ink-soft)]">
          Power interruptions reported by BENECO.
        </p>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as OutagePeriod)}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink)] outline-none"
          aria-label="Outage period"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading outages…</p>
      )}
      {isError && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Failed to load outages. Please try again later.
        </p>
      )}

      {!isLoading && !isError && data && (
        <>
          <Overview data={data} />
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ViewTabs
                view={view}
                onChange={setView}
                allCount={allCount}
                scheduledCount={scheduledCount}
              />
              <div className="relative min-w-55 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--sea-ink-soft)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search outages…"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] py-2 pl-9 pr-3 text-sm text-[var(--sea-ink)] outline-none transition placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)]"
                />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filter by status"
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-medium text-[var(--sea-ink)] outline-none"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {viewRows.length === 0 ? (
              <EmptyNote text="No outages in this view." />
            ) : (
              <GridShell>
                <AgGridReact
                  theme={gridTheme}
                  rowData={viewRows}
                  columnDefs={colDefs}
                  defaultColDef={defaultColDef}
                  quickFilterText={search}
                  onGridReady={(params) => {
                    gridApiRef.current = params.api;
                    setResultCount(params.api.getDisplayedRowCount());
                  }}
                  onModelUpdated={(event) =>
                    setResultCount(event.api.getDisplayedRowCount())
                  }
                  getRowId={(params) => String(params.data.id)}
                />
              </GridShell>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ViewTabs({
  view,
  onChange,
  allCount,
  scheduledCount,
}: {
  view: View;
  onChange: (view: View) => void;
  allCount: number;
  scheduledCount: number;
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: allCount },
    { key: "scheduled", label: "Scheduled", count: scheduledCount },
  ];
  return (
    <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
      {tabs.map((tab) => {
        const active = view === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={active}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-[var(--sea-ink)] text-[var(--foam)]"
                : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 text-[10px] font-bold ${
                active
                  ? "bg-white/20 text-[var(--foam)]"
                  : "bg-[var(--line)] text-[var(--sea-ink-soft)]"
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GridShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="outage-grid overflow-hidden rounded-2xl"
      style={{ height: 480 }}
    >
      {children}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-sm text-[var(--sea-ink-soft)]">
      {text}
    </p>
  );
}

function Overview({ data }: { data: OutageFeed }) {
  const total = data.unscheduled.length + data.scheduled.length;
  const ongoing = data.unscheduled.filter((o) => o.status === "Ongoing").length;
  const cancelled = data.scheduled.filter((o) => o.cancelled === 1).length;
  const consumers = data.scheduled.reduce(
    (sum, o) => sum + Number(o.noofcons || 0),
    0,
  );

  const stats: {
    label: string;
    value: string;
    icon: typeof Power;
    iconClass: string;
  }[] = [
    {
      label: "Total",
      value: String(total),
      icon: Power,
      iconClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Unscheduled",
      value: String(data.unscheduled.length),
      icon: Zap,
      iconClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      label: "Ongoing",
      value: String(ongoing),
      icon: Activity,
      iconClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    },
    {
      label: "Scheduled",
      value: String(data.scheduled.length),
      icon: CalendarDays,
      iconClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    {
      label: "Cancelled",
      value: String(cancelled),
      icon: CalendarX2,
      iconClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    },
    {
      label: "Consumers affected",
      value: consumers.toLocaleString(),
      icon: Users,
      iconClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-lg ${stat.iconClass}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                {stat.label}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--sea-ink)]">
              {stat.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
