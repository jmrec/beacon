import { Layers, Loader2, Map as MapIcon, Settings2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "../env";
import {
  type AreaOverlayCounts,
  aggregateAffectedCounts,
} from "../lib/area-overlay";
import type { AreaResolutionOutcome } from "../lib/beneco-area/types/internal.ts";

const LEVELS = ["barangay", "city", "province"] as const;

type AdminLevel = (typeof LEVELS)[number];

const LEVEL_LABELS: Record<AdminLevel, string> = {
  province: "Province",
  city: "City/Mun.",
  barangay: "Barangay",
};

const LEVEL_COLORS: Record<AdminLevel, string> = {
  province: "#d97706",
  city: "#2563eb",
  barangay: "#088",
};

const CENTER: [number, number] = [120.594542, 16.410872];
const INITIAL_ZOOM = 12;
const MAX_ZOOM = 16;
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const BENGUET_BOUNDS: [[number, number], [number, number]] = [
  [119.711151, 16.060331],
  [121.654358, 16.988502],
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

type CountMap = Map<string, number>;

function severityColor(count: number): string {
  if (count >= 3) return "#ef4444"; // red-500
  if (count === 2) return "#eab308"; // yellow-500
  return "#22c55e"; // green-500
}

/** Map each affected pcode to a severity color; all others transparent. */
function buildColorExpression(
  counts: CountMap,
  pcodeKey: "adm3_pcode" | "adm4_pcode",
) {
  const expression: unknown[] = ["match", ["get", pcodeKey]];
  for (const [pcode, count] of counts) {
    expression.push(pcode, severityColor(count));
  }
  expression.push("rgba(0,0,0,0)");
  return expression;
}

function applyOverlayLayer(
  map: MapLibreMap,
  id: string,
  sourceLayer: string,
  before: string,
  pcodeKey: "adm3_pcode" | "adm4_pcode",
  level: "city" | "barangay",
  counts: CountMap,
  visible: boolean,
) {
  if (!map.getLayer(id)) {
    map.addLayer(
      {
        id,
        type: "fill",
        source: "benguet",
        "source-layer": sourceLayer,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "rgba(0,0,0,0)",
          "fill-opacity": level === "city" ? 0.45 : 0.6,
        },
      },
      before,
    );
  }
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  map.setPaintProperty(
    id,
    "fill-color",
    buildColorExpression(counts, pcodeKey) as never,
  );
}

function updateAreaOverlays(
  map: MapLibreMap,
  counts: AreaOverlayCounts,
  visible: boolean,
) {
  applyOverlayLayer(
    map,
    "area-city-fill",
    "city",
    "city-outline",
    "adm3_pcode",
    "city",
    counts.city,
    visible,
  );
  applyOverlayLayer(
    map,
    "area-barangay-fill",
    "barangay",
    "barangay-outline",
    "adm4_pcode",
    "barangay",
    counts.barangay,
    visible,
  );
}

export default function OutageMap({
  resolvedAreas,
}: {
  resolvedAreas?: AreaResolutionOutcome[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [activeLevel, setActiveLevel] = useState<AdminLevel>("barangay");
  const [hoveredInfo, setHoveredInfo] = useState<HoverInfo>(null);

  const affectedCounts = useMemo(
    () => aggregateAffectedCounts(resolvedAreas ?? []),
    [resolvedAreas],
  );

  const activeLevelRef = useRef(activeLevel);
  activeLevelRef.current = activeLevel;
  const showBaseMapRef = useRef(showBaseMap);
  const showBoundariesRef = useRef(showBoundaries);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupWidthRef = useRef(0);
  const [popupSide, setPopupSide] = useState<"left" | "right">("right");

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
        zoom: INITIAL_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: new LngLatBounds(BENGUET_BOUNDS[0], BENGUET_BOUNDS[1]),
        attributionControl: false,
      });

      if ("geolocation" in navigator) {
        const geolocate = new GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true,
        });
        geolocate.on("error", () => {});
        map.addControl(geolocate, "bottom-right");
      }
      map.addControl(new NavigationControl({}), "bottom-right");

      map.on("load", () => {
        if (disposed || !map) return;
        const m = map;

        m.addSource("benguet", {
          type: "vector",
          url: env.VITE_PH_BOUNDARIES_URL,
          promoteId: {
            barangay: "adm4_pcode",
            city: "adm3_pcode",
            province: "adm2_pcode",
          },
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
        setMapReady(true);
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

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const hasAffected =
      affectedCounts.city.size > 0 || affectedCounts.barangay.size > 0;
    updateAreaOverlays(
      mapRef.current,
      affectedCounts,
      showBoundaries && hasAffected,
    );
  }, [mapReady, affectedCounts, showBoundaries]);

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el || !hoveredInfo) return;
    popupWidthRef.current = el.offsetWidth;
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const useRightSide = hoveredInfo.x <= containerWidth / 1.3;
    setPopupSide((prev) =>
      prev === (useRightSide ? "right" : "left")
        ? prev
        : useRightSide
          ? "right"
          : "left",
    );
  }, [hoveredInfo]);

  const labels = hoveredInfo ? tooltipLabels(hoveredInfo.props) : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

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
          ref={popupRef}
          className="pointer-events-none absolute z-50 flex flex-col gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md backdrop-blur-sm"
          style={{
            left:
              popupSide === "left"
                ? hoveredInfo.x - popupWidthRef.current - 12
                : hoveredInfo.x + 12,
            top: hoveredInfo.y + 12,
          }}
        >
          <p className="font-semibold">{labels.primary}</p>
          {labels.secondary && (
            <p className="text-muted-foreground">{labels.secondary}</p>
          )}
          {labels.tertiary && (
            <p className="text-muted-foreground">{labels.tertiary}</p>
          )}
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
