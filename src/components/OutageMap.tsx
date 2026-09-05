import { Layers, Map as MapIcon, Settings2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "../env";
import {
  type AreaOverlayCounts,
  type AreaOverlayOutage,
  aggregateAffectedCounts,
  type PcodeTally,
  tallyColor,
} from "../lib/area-overlay";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

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

type CountMap = Map<string, PcodeTally>;

function buildColorExpression(
  counts: CountMap,
  pcodeKey: "adm3_pcode" | "adm4_pcode",
) {
  const expression: unknown[] = ["match", ["get", pcodeKey]];
  for (const [pcode, tally] of counts) {
    const color = tallyColor(tally);
    if (color) expression.push(pcode, color);
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
  resolvedAreas?: AreaOverlayOutage[];
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

      <TooltipProvider delayDuration={200}>
        <div className="absolute right-2 top-3 z-10 flex flex-col gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={showBaseMap ? "Hide base map" : "Show base map"}
                onClick={() => setShowBaseMap((v) => !v)}
              >
                <MapIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {showBaseMap ? "Hide base map" : "Show base map"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={
                  showBoundaries ? "Hide boundaries" : "Show boundaries"
                }
                onClick={() => setShowBoundaries((v) => !v)}
              >
                <Layers />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {showBoundaries ? "Hide boundaries" : "Show boundaries"}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Choose admin level"
              >
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {LEVELS.map((level) => (
                <DropdownMenuItem
                  key={level}
                  onSelect={() => setActiveLevel(level)}
                >
                  {LEVEL_LABELS[level]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>

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
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-4 w-44" />
        </div>
      )}
    </div>
  );
}
