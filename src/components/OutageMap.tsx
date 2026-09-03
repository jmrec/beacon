import { Layers, Loader2, Map as MapIcon, Settings2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "../env";

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

export default function OutageMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [activeLevel, setActiveLevel] = useState<AdminLevel>("barangay");
  const [hoveredInfo, setHoveredInfo] = useState<HoverInfo>(null);

  const activeLevelRef = useRef(activeLevel);
  activeLevelRef.current = activeLevel;
  const showBaseMapRef = useRef(showBaseMap);
  const showBoundariesRef = useRef(showBoundaries);

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
