import { useQuery } from "@tanstack/react-query";
import { Layers, Loader2, Map as MapIcon, Settings2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "../env";
import { getOutages, type OutageFeed, type OutagePeriod } from "../lib/beneco";

type AdminLevel = "barangays" | "municipalities" | "provinces";

const LEVELS: readonly AdminLevel[] = [
  "barangays",
  "municipalities",
  "provinces",
];

const LEVEL_LABELS: Record<AdminLevel, string> = {
  provinces: "Province",
  municipalities: "City/Mun.",
  barangays: "Barangay",
};

const LEVEL_COLORS: Record<AdminLevel, string> = {
  provinces: "#d97706",
  municipalities: "#2563eb",
  barangays: "#088",
};

const CENTER: [number, number] = [120.69185, 16.5529];
const MAX_ZOOM = 16;
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const BENGUET_BOUNDS: [[number, number], [number, number]] = [
  [119.5, 15.2],
  [122.0, 18.0],
];

type HoverInfo = {
  x: number;
  y: number;
  props: Record<string, unknown>;
} | null;

function tooltipLabels(props: Record<string, unknown>) {
  if ("adm4_name" in props) {
    return {
      primary: String(props.adm4_name),
      secondary: `${props.adm3_name}, ${props.adm2_name}`,
      tertiary: String(props.adm1_name),
    };
  }
  if ("adm3_name" in props) {
    return {
      primary: String(props.adm3_name),
      secondary: String(props.adm2_name),
      tertiary: String(props.adm1_name),
    };
  }
  return {
    primary: String(props.adm2_name),
    secondary: "",
    tertiary: String(props.adm1_name),
  };
}

function updateBaseMapVisibility(map: MapLibreMap, visible: boolean) {
  const style = map.getStyle();
  if (!style?.layers) return;
  const visibility = visible ? "visible" : "none";
  for (const layer of style.layers) {
    const isCustomLayer =
      LEVELS.some(
        (l) => layer.id === `${l}-fill` || layer.id === `${l}-outline`,
      ) || layer.id.includes("gl-draw");
    if (!isCustomLayer) {
      map.setLayoutProperty(layer.id, "visibility", visibility);
    }
  }
}

function updateBoundaryVisibility(
  map: MapLibreMap,
  activeLevel: AdminLevel,
  visible: boolean,
) {
  for (const level of LEVELS) {
    const v = visible && activeLevel === level ? "visible" : "none";
    for (const suffix of ["fill", "outline"]) {
      const id = `${level}-${suffix}`;
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", v);
      }
    }
  }
}

export default function OutageMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [activeLevel, setActiveLevel] = useState<AdminLevel>("barangays");
  const [hoveredInfo, setHoveredInfo] = useState<HoverInfo>(null);
  const [period, setPeriod] = useState<OutagePeriod>("this_week");

  const activeLevelRef = useRef(activeLevel);
  activeLevelRef.current = activeLevel;
  const showBaseMapRef = useRef(showBaseMap);
  const showBoundariesRef = useRef(showBoundaries);

  const outages = useQuery({
    queryKey: ["beneco", period],
    queryFn: () => getOutages({ data: { period } }),
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const {
        Map: MapLibreMapConstructor,
        NavigationControl,
        GeolocateControl,
        LngLatBounds,
      } = await import("maplibre-gl");

      if (disposed || !container) return;

      map = new MapLibreMapConstructor({
        container,
        center: CENTER,
        style: STYLE_URL,
        maxZoom: MAX_ZOOM,
        maxBounds: new LngLatBounds(BENGUET_BOUNDS[0], BENGUET_BOUNDS[1]),
        attributionControl: false,
      });

      map.addControl(
        new GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true,
        }),
        "bottom-right",
      );
      map.addControl(new NavigationControl({}), "bottom-right");

      map.on("load", () => {
        if (disposed || !map) return;
        const m = map;

        m.addSource("benguet", {
          type: "vector",
          url: env.VITE_PH_BOUNDARIES_URL,
          promoteId: "ADM4_PCODE",
          encoding: "mlt",
          maxzoom: MAX_ZOOM,
        });

        for (const level of LEVELS) {
          const color = LEVEL_COLORS[level];
          m.addLayer({
            id: `${level}-fill`,
            type: "fill",
            source: "benguet",
            "source-layer": level,
            paint: { "fill-color": color, "fill-opacity": 0.1 },
          });
          m.addLayer({
            id: `${level}-outline`,
            type: "line",
            source: "benguet",
            "source-layer": level,
            paint: { "line-color": color, "line-width": 1 },
          });
        }

        updateBaseMapVisibility(m, showBaseMapRef.current);
        updateBoundaryVisibility(
          m,
          activeLevelRef.current,
          showBoundariesRef.current,
        );

        for (const level of LEVELS) {
          m.on("mousemove", `${level}-fill`, (e) => {
            const feature = e.features?.[0];
            if (feature && activeLevelRef.current === level) {
              m.getCanvas().style.cursor = "pointer";
              setHoveredInfo({
                x: e.point.x,
                y: e.point.y,
                props: (feature.properties ?? {}) as Record<string, unknown>,
              });
            }
          });
          m.on("mouseleave", `${level}-fill`, () => {
            m.getCanvas().style.cursor = "";
            setHoveredInfo(null);
          });
        }

        mapRef.current = m;
        setIsLoading(false);
      });

      resizeObserver = new ResizeObserver(() => {
        map?.resize();
      });
      resizeObserver.observe(container);
      map.resize();
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) updateBaseMapVisibility(mapRef.current, showBaseMap);
  }, [showBaseMap]);

  useEffect(() => {
    if (mapRef.current)
      updateBoundaryVisibility(mapRef.current, activeLevel, showBoundaries);
  }, [activeLevel, showBoundaries]);

  const labels = hoveredInfo ? tooltipLabels(hoveredInfo.props) : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <OutagePanel
        data={outages.data}
        isLoading={outages.isLoading}
        isError={outages.isError}
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className="absolute right-2 top-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setShowBaseMap((v) => !v)}
          title={showBaseMap ? "Hide Base Map" : "Show Base Map"}
          className="rounded-lg border border-slate-700/50 bg-slate-900/90 p-2 text-slate-200 shadow-lg backdrop-blur-sm transition hover:bg-slate-800"
        >
          <MapIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowBoundaries((v) => !v)}
          title={showBoundaries ? "Hide Boundaries" : "Show Boundaries"}
          className="rounded-lg border border-slate-700/50 bg-slate-900/90 p-2 text-slate-200 shadow-lg backdrop-blur-sm transition hover:bg-slate-800"
        >
          <Layers className="size-4" />
        </button>
        <details className="relative">
          <summary className="flex list-none cursor-pointer rounded-lg border border-slate-700/50 bg-slate-900/90 p-2 text-slate-200 shadow-lg backdrop-blur-sm transition hover:bg-slate-800">
            <Settings2 className="size-4" />
          </summary>
          <div className="absolute right-0 mt-1 flex w-40 flex-col rounded-lg border border-slate-700/50 bg-slate-900/90 p-1 text-xs text-slate-200 shadow-lg backdrop-blur-sm">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setActiveLevel(level)}
                className={`rounded-md px-3 py-1.5 text-left transition hover:bg-slate-800 ${
                  activeLevel === level
                    ? "bg-slate-800 font-semibold text-white"
                    : "text-slate-400"
                }`}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        </details>
      </div>

      {labels && hoveredInfo && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-slate-700/50 bg-slate-900/90 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur-sm"
          style={{ left: hoveredInfo.x + 12, top: hoveredInfo.y + 12 }}
        >
          <p className="font-semibold text-white">{labels.primary}</p>
          {labels.secondary && (
            <p className="text-[11px] text-slate-400">{labels.secondary}</p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-500">{labels.tertiary}</p>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 text-blue-200 backdrop-blur-sm">
          <Loader2 className="mb-4 size-10 animate-spin" />
          <p className="font-mono text-xs uppercase tracking-[0.2em]">
            Initializing Map
          </p>
        </div>
      )}
    </div>
  );
}

function OutagePanel({
  data,
  isLoading,
  isError,
  period,
  onPeriodChange,
}: {
  data: OutageFeed | undefined;
  isLoading: boolean;
  isError: boolean;
  period: OutagePeriod;
  onPeriodChange: (period: OutagePeriod) => void;
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-80 max-w-[calc(100%-1.5rem)] flex-col rounded-xl border border-slate-700/50 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/50 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Outages
        </p>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as OutagePeriod)}
          className="rounded-md border border-slate-700/50 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
        >
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="last_week">Last Week</option>
        </select>
      </div>

      {isLoading && (
        <p className="px-3 py-2 text-xs text-slate-500">Loading outages…</p>
      )}
      {isError && (
        <p className="px-3 py-2 text-xs text-rose-400">
          Failed to load outages.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="overflow-y-auto px-3 py-2 text-xs">
          <p className="mb-1.5 font-semibold text-amber-400">
            Unscheduled · {data.unscheduled.length}
          </p>
          {data.unscheduled.length === 0 && (
            <p className="mb-2 text-slate-500">No unscheduled outages.</p>
          )}
          <ul className="mb-3 space-y-2">
            {data.unscheduled.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">
                    {o.feeder.trim()}
                  </span>
                  <span
                    className={
                      o.status === "Ongoing"
                        ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                        : "rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                    }
                  >
                    {o.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-slate-400">{o.area}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Off {o.timeoff} · {o.duration}
                </p>
              </li>
            ))}
          </ul>

          <p className="mb-1.5 font-semibold text-sky-400">
            Scheduled · {data.scheduled.length}
          </p>
          {data.scheduled.length === 0 && (
            <p className="mb-2 text-slate-500">No scheduled outages.</p>
          )}
          <ul className="space-y-2">
            {data.scheduled.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">
                    {o.feeder.trim()}
                  </span>
                  {o.cancelled === 1 && (
                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                      Cancelled
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-slate-400">{o.areas}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {o.date} · {o.timeoff}–{o.timerestored} · {o.noofcons} cons
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
