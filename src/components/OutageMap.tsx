import { Layers, Map as MapIcon, Settings2 } from "lucide-react";
import type {
  DataDrivenPropertyValueSpecification,
  MapLayerMouseEvent,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Pcode } from "#/lib/beneco-area/types/internal.ts";
import { env, type RecentlyResolvedWindow } from "../env";
import {
  type AreaOverlayCounts,
  type AreaOverlayOutage,
  type AreaOverlayPartial,
  aggregateAffectedCounts,
  aggregatePartial,
  type CountMap,
  tallyColor,
} from "../lib/beneco-area/area-overlay";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { MapControls, Map as MapView, useMap } from "./ui/map";
import { Separator } from "./ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export const LEVEL_PCODE_MAP = {
  barangay: "adm4_pcode",
  city: "adm3_pcode",
  province: "adm2_pcode",
} as const;

export const LEVELS = [
  {
    id: "barangay",
    pcodeKey: LEVEL_PCODE_MAP.barangay,
    label: "Barangay",
    color: "#088",
  },
  {
    id: "city",
    pcodeKey: LEVEL_PCODE_MAP.city,
    label: "City/Mun.",
    color: "#088",
  },
  {
    id: "province",
    pcodeKey: LEVEL_PCODE_MAP.province,
    label: "Province",
    color: "#088",
  },
] as const;

export type AdminLevel = (typeof LEVELS)[number]["id"];
export type PcodeKey = (typeof LEVELS)[number]["pcodeKey"];

const MAP_ID = {
  source: "benguet",
  boundaryFill: (level: AdminLevel) => `${level}-boundary-fill`,
  boundaryOutline: (level: AdminLevel) => `${level}-boundary-outline`,
  outageFill: (level: AdminLevel) => `${level}-area-fill`,
  selectOutline: (level: AdminLevel) => `${level}-select-outline`,
} as const;

const CUSTOM_LAYER_IDS = new Set(
  LEVELS.flatMap((level) => [
    MAP_ID.boundaryFill(level.id),
    MAP_ID.boundaryOutline(level.id),
    MAP_ID.outageFill(level.id),
    MAP_ID.selectOutline(level.id),
  ]),
);

const OVERLAY_OPACITY: Record<AdminLevel, number> = {
  province: 0.35,
  city: 0.45,
  barangay: 0.6,
};

const CENTER: [number, number] = [120.594542, 16.410872];
const INITIAL_ZOOM = 12;
const MAX_ZOOM = 16;
const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
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

function resolvedWindowLabel(window: RecentlyResolvedWindow): string {
  if (window.mode === "sameDay") return "Resolved today";
  const units: Array<[string, number | undefined]> = [
    ["year", window.span.years],
    ["month", window.span.months],
    ["week", window.span.weeks],
    ["day", window.span.days],
    ["hour", window.span.hours],
    ["minute", window.span.minutes],
    ["second", window.span.seconds],
  ];
  const parts: string[] = [];
  for (const [name, n] of units) {
    if (n && n > 0) parts.push(`${n} ${name}${n === 1 ? "" : "s"}`);
  }
  return parts.length === 0
    ? "Recently resolved"
    : `Resolved within the last ${parts.join(", ")}`;
}

function updateBaseMapVisibility(map: MapLibreMap, visible: boolean) {
  const style = map.getStyle();
  const visibility = visible ? "visible" : "none";
  for (const layer of style.layers) {
    const isCustomLayer =
      CUSTOM_LAYER_IDS.has(layer.id) || layer.id.includes("gl-draw");
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
    const v = visible && activeLevel === level.id ? "visible" : "none";
    for (const id of [
      MAP_ID.boundaryFill(level.id),
      MAP_ID.boundaryOutline(level.id),
    ]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }
}

type FillColorSpec = DataDrivenPropertyValueSpecification<string>;
function buildColorExpression(
  counts: CountMap,
  pcodeKey: PcodeKey,
): FillColorSpec {
  const pairs: (string | string[])[] = [];

  for (const [pcode, tally] of counts) {
    const color = tallyColor(tally);
    if (color) pairs.push(pcode, color);
  }
  if (pairs.length === 0) return "rgba(0,0,0,0)";

  const expression = ["match", ["get", pcodeKey], ...pairs, "rgba(0,0,0,0)"];
  return expression as FillColorSpec;
}

const stripeImageCache = new Map<string, string>();
function stripeImageFor(map: MapLibreMap, color: string): string {
  const id = `stripe-${color.replace("#", "")}`;
  if (map.hasImage(id)) return id;
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return id;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 4;
  for (let x = -size; x < size * 2; x += size / 2) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.lineTo(x + size, 0);
    ctx.stroke();
  }
  map.addImage(id, ctx.getImageData(0, 0, size, size));
  stripeImageCache.set(color, id);
  return id;
}

function buildPatternExpression(
  map: MapLibreMap,
  counts: CountMap,
  partial: Set<string>,
  pcodeKey: PcodeKey,
): FillColorSpec {
  const pairs: (string | string[])[] = [];
  for (const [pcode, tally] of counts) {
    if (!partial.has(pcode)) continue;
    const color = tallyColor(tally);
    if (!color) continue;
    pairs.push(pcode, stripeImageFor(map, color));
  }
  if (pairs.length === 0) return "";
  const expression = ["match", ["get", pcodeKey], ...pairs, ""];
  return expression as FillColorSpec;
}

function buildOpacityExpression(
  counts: CountMap,
  partial: Set<string>,
  pcodeKey: PcodeKey,
  level: AdminLevel,
  hoveredPcode?: string | null,
  selectedPcode?: string | null,
): DataDrivenPropertyValueSpecification<number> {
  const solid = OVERLAY_OPACITY[level];
  const striped = solid * 0.5;
  const pairs: (string | string[] | number)[] = [];
  for (const pcode of counts.keys()) {
    if (selectedPcode && pcode === selectedPcode) {
      pairs.push(pcode, 0);
    } else if (hoveredPcode && pcode === hoveredPcode) {
      pairs.push(pcode, 0.9);
    } else if (partial.has(pcode)) {
      pairs.push(pcode, striped);
    }
  }
  if (pairs.length === 0) return solid;
  const expression = ["match", ["get", pcodeKey], ...pairs, solid];
  return expression as DataDrivenPropertyValueSpecification<number>;
}

function applyOverlayLayer(
  map: MapLibreMap,
  id: string,
  sourceLayer: string,
  before: string,
  pcodeKey: PcodeKey,
  level: AdminLevel,
  counts: CountMap,
  visible: boolean,
  partial: Set<string>,
) {
  if (!map.getLayer(id)) {
    map.addLayer(
      {
        id,
        type: "fill",
        source: MAP_ID.source,
        "source-layer": sourceLayer,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "rgba(0,0,0,0)",
          "fill-opacity": OVERLAY_OPACITY[level],
        },
      },
      before,
    );
  }
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  map.setPaintProperty(
    id,
    "fill-color",
    buildColorExpression(counts, pcodeKey),
  );
  map.setPaintProperty(
    id,
    "fill-pattern",
    buildPatternExpression(map, counts, partial, pcodeKey),
  );
  map.setPaintProperty(
    id,
    "fill-opacity",
    buildOpacityExpression(counts, partial, pcodeKey, level),
  );
}

function updateAreaOverlays(
  map: MapLibreMap,
  counts: AreaOverlayCounts,
  activeLevel: AdminLevel,
  show: boolean,
  partial: AreaOverlayPartial,
) {
  for (const level of LEVELS) {
    applyOverlayLayer(
      map,
      MAP_ID.outageFill(level.id),
      level.id,
      MAP_ID.boundaryOutline(level.id),
      level.pcodeKey,
      level.id,
      counts[level.id],
      show && activeLevel === level.id && counts[level.id].size > 0,
      partial[level.id],
    );
  }
}

function setAreaOpacity(
  map: MapLibreMap,
  level: AdminLevel,
  hoveredPcode: string | null,
  selectedPcode: string | null,
  counts: AreaOverlayCounts,
  partial: AreaOverlayPartial,
) {
  const layerId = MAP_ID.outageFill(level);
  const cfg = LEVELS.find((l) => l.id === level);
  if (!cfg || !map.getLayer(layerId)) return;
  map.setPaintProperty(
    layerId,
    "fill-opacity",
    buildOpacityExpression(
      counts[level],
      partial[level],
      cfg.pcodeKey,
      level,
      hoveredPcode,
      selectedPcode,
    ),
  );
}

const SELECT_COLOR = "#0f172a";
const SELECT_DASH: number[] = [2, 2] as const;

function ensureSelectOutline(map: MapLibreMap, level: AdminLevel) {
  const cfg = LEVELS.find((l) => l.id === level);
  if (!cfg) return;
  const id = MAP_ID.selectOutline(cfg.id);
  if (map.getLayer(id)) return id;
  map.addLayer(
    {
      id,
      type: "line",
      source: MAP_ID.source,
      "source-layer": cfg.id,
      layout: { visibility: "none" },
      paint: {
        "line-color": "rgba(0,0,0,0)",
        "line-width": 2.5,
        "line-dasharray": SELECT_DASH,
      },
    },
    MAP_ID.boundaryOutline(cfg.id),
  );
  return id;
}

function setSelectOutline(
  map: MapLibreMap,
  level: AdminLevel,
  selectedPcode: Pcode | null,
) {
  const cfg = LEVELS.find((l) => l.id === level);
  if (!cfg) return;
  const id = ensureSelectOutline(map, level);
  if (!id || !selectedPcode) {
    if (id && map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    return;
  }
  map.setLayoutProperty(id, "visibility", "visible");
  map.setPaintProperty(id, "line-color", [
    "match",
    ["get", cfg.pcodeKey],
    selectedPcode,
    SELECT_COLOR,
    "rgba(0,0,0,0)",
  ]);
}

function addBenguetSource(map: MapLibreMap) {
  if (map.getSource(MAP_ID.source)) return;
  map.addSource(MAP_ID.source, {
    type: "vector",
    url: env.VITE_TILE_SERVER_URL,
    promoteId: LEVEL_PCODE_MAP,
    encoding: "mlt",
    maxzoom: MAX_ZOOM,
  });
}

function addBoundaryLevels(map: MapLibreMap) {
  for (const level of LEVELS) {
    if (!map.getLayer(MAP_ID.boundaryFill(level.id))) {
      map.addLayer({
        id: MAP_ID.boundaryFill(level.id),
        type: "fill",
        source: MAP_ID.source,
        "source-layer": level.id,
        paint: { "fill-color": level.color, "fill-opacity": 0.1 },
      });
    }
    if (!map.getLayer(MAP_ID.boundaryOutline(level.id))) {
      map.addLayer({
        id: MAP_ID.boundaryOutline(level.id),
        type: "line",
        source: MAP_ID.source,
        "source-layer": level.id,
        paint: { "line-color": level.color, "line-width": 1 },
      });
    }
  }
}

function removeBoundaryLayers(map: MapLibreMap) {
  for (const level of LEVELS) {
    for (const id of [
      MAP_ID.boundaryFill(level.id),
      MAP_ID.boundaryOutline(level.id),
      MAP_ID.outageFill(level.id),
      MAP_ID.selectOutline(level.id),
    ]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
  }
  if (map.getSource(MAP_ID.source)) map.removeSource(MAP_ID.source);
}

type RefreshArgs = {
  activeLevel: AdminLevel;
  showBaseMap: boolean;
  showBoundaries: boolean;
  counts: AreaOverlayCounts;
  partial: AreaOverlayPartial;
  hoveredPcode: Pcode | null;
  selectedPcode: Pcode | null;
};

function refreshBoundaries(map: MapLibreMap, args: RefreshArgs) {
  updateBaseMapVisibility(map, args.showBaseMap);
  updateBoundaryVisibility(map, args.activeLevel, args.showBoundaries);
  updateAreaOverlays(
    map,
    args.counts,
    args.activeLevel,
    args.showBoundaries,
    args.partial,
  );
  setAreaOpacity(
    map,
    args.activeLevel,
    args.hoveredPcode,
    args.selectedPcode,
    args.counts,
    args.partial,
  );
  setSelectOutline(
    map,
    args.activeLevel,
    args.showBoundaries ? args.selectedPcode : null,
  );
}

type SelectedArea = {
  level: AdminLevel;
  pcode: Pcode;
  props: Record<string, unknown>;
};

type BoundaryLayersProps = {
  activeLevel: AdminLevel;
  showBaseMap: boolean;
  showBoundaries: boolean;
  counts: AreaOverlayCounts;
  partial: AreaOverlayPartial;
  selected: SelectedArea | null;
  onHover: (info: HoverInfo) => void;
  onSelect: (sel: SelectedArea) => void;
};

function BoundaryLayers({
  activeLevel,
  showBaseMap,
  showBoundaries,
  counts,
  partial,
  selected,
  onHover,
  onSelect,
}: BoundaryLayersProps) {
  const { map, isLoaded } = useMap();

  const activeLevelRef = useRef(activeLevel);
  activeLevelRef.current = activeLevel;
  const showBaseMapRef = useRef(showBaseMap);
  showBaseMapRef.current = showBaseMap;
  const showBoundariesRef = useRef(showBoundaries);
  showBoundariesRef.current = showBoundaries;
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const partialRef = useRef(partial);
  partialRef.current = partial;
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const m = map;
    if (!m || !isLoaded) return;

    addBenguetSource(m);
    addBoundaryLevels(m);
    refreshBoundaries(m, {
      activeLevel: activeLevelRef.current,
      showBaseMap: showBaseMapRef.current,
      showBoundaries: showBoundariesRef.current,
      counts: countsRef.current,
      partial: partialRef.current,
      hoveredPcode: hoveredRef.current,
      selectedPcode:
        selectedRef.current?.level === activeLevelRef.current
          ? selectedRef.current.pcode
          : null,
    });

    const moves: Array<[string, (e: MapLayerMouseEvent) => void]> = [];
    const leaves: Array<[string, () => void]> = [];
    const clicks: Array<[string, (e: MapLayerMouseEvent) => void]> = [];
    for (const level of LEVELS) {
      const id = MAP_ID.boundaryFill(level.id);
      const move = (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature && activeLevelRef.current === level.id) {
          m.getCanvas().style.cursor = "pointer";
          onHoverRef.current({
            x: e.point.x,
            y: e.point.y,
            props: (feature.properties ?? {}) as Record<string, unknown>,
          });
          const raw = feature.properties?.[level.pcodeKey];
          if (raw != null) {
            hoveredRef.current = String(raw);
            const sel =
              selectedRef.current?.level === level.id
                ? selectedRef.current.pcode
                : null;
            setAreaOpacity(
              m,
              level.id,
              hoveredRef.current,
              sel,
              countsRef.current,
              partialRef.current,
            );
          }
        }
      };
      const leave = () => {
        m.getCanvas().style.cursor = "";
        onHoverRef.current(null);
        hoveredRef.current = null;
        const sel =
          selectedRef.current?.level === level.id
            ? selectedRef.current.pcode
            : null;
        setAreaOpacity(
          m,
          level.id,
          null,
          sel,
          countsRef.current,
          partialRef.current,
        );
      };
      const click = (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature && activeLevelRef.current === level.id) {
          const raw = feature.properties?.[level.pcodeKey];
          if (raw != null) {
            onSelectRef.current({
              level: level.id,
              pcode: String(raw),
              props: (feature.properties ?? {}) as Record<string, unknown>,
            });
          }
        }
      };
      m.on("mousemove", id, move);
      m.on("mouseleave", id, leave);
      m.on("click", id, click);
      moves.push([id, move]);
      leaves.push([id, leave]);
      clicks.push([id, click]);
    }

    return () => {
      for (const [id, move] of moves) m.off("mousemove", id, move);
      for (const [id, leave] of leaves) m.off("mouseleave", id, leave);
      for (const [id, click] of clicks) m.off("click", id, click);
      removeBoundaryLayers(m);
    };
  }, [map, isLoaded]);

  useEffect(() => {
    if (!map || !isLoaded || !map.getSource(MAP_ID.source)) return;
    const sel =
      selected && selected.level === activeLevel ? selected.pcode : null;
    refreshBoundaries(map, {
      activeLevel,
      showBaseMap,
      showBoundaries,
      counts,
      partial,
      hoveredPcode: hoveredRef.current,
      selectedPcode: sel,
    });
  }, [
    map,
    isLoaded,
    activeLevel,
    showBaseMap,
    showBoundaries,
    counts,
    partial,
    selected,
  ]);

  useEffect(() => {
    const m = map;
    if (!m || !isLoaded) return;
    const container = m.getContainer();
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container);
    m.resize();
    return () => observer.disconnect();
  }, [map, isLoaded]);

  return null;
}

export default function OutageMap({
  resolvedAreas,
  recentlyResolvedWindow,
}: {
  resolvedAreas?: AreaOverlayOutage[];
  recentlyResolvedWindow?: RecentlyResolvedWindow;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showBaseMap, setShowBaseMap] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [activeLevel, setActiveLevel] = useState<AdminLevel>("barangay");
  const [hoveredInfo, setHoveredInfo] = useState<HoverInfo>(null);
  const [selected, setSelected] = useState<SelectedArea | null>(null);

  const affectedCounts = useMemo(
    () => aggregateAffectedCounts(resolvedAreas ?? []),
    [resolvedAreas],
  );
  const affectedPartial = useMemo(
    () => aggregatePartial(resolvedAreas ?? []),
    [resolvedAreas],
  );

  const popupRef = useRef<HTMLDivElement>(null);
  const popupWidthRef = useRef(0);
  const [popupSide, setPopupSide] = useState<"left" | "right">("right");

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
  const selectionLabels = selected ? tooltipLabels(selected.props) : null;
  const recentlyResolvedLabel = resolvedWindowLabel(
    recentlyResolvedWindow ?? { mode: "sameDay" },
  );
  const handleSelect = (sel: SelectedArea) => {
    setSelected((prev) =>
      prev && prev.level === sel.level && prev.pcode === sel.pcode ? null : sel,
    );
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <MapView
        className="absolute inset-0 h-full w-full"
        center={CENTER}
        zoom={INITIAL_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={BENGUET_BOUNDS}
        styles={{ light: LIGHT_STYLE_URL, dark: DARK_STYLE_URL }}
      >
        <MapControls position="bottom-right" showZoom showLocate />
        <BoundaryLayers
          activeLevel={activeLevel}
          showBaseMap={showBaseMap}
          showBoundaries={showBoundaries}
          counts={affectedCounts}
          partial={affectedPartial}
          selected={selected}
          onHover={setHoveredInfo}
          onSelect={handleSelect}
        />
      </MapView>

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
                className="cursor-pointer"
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
                className="cursor-pointer"
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
                className="cursor-pointer"
              >
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Admin level</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={activeLevel}
                  onValueChange={(value) => {
                    setActiveLevel(value as AdminLevel);
                    setSelected(null);
                  }}
                >
                  {LEVELS.map((level) => (
                    <DropdownMenuRadioItem
                      key={level.id}
                      value={level.id}
                      className="cursor-pointer"
                    >
                      {level.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>

      <div className="absolute bottom-3 left-3 z-10">
        <Card className="w-44">
          <CardHeader>
            <CardTitle className="text-xs font-semibold ">Legend</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full bg-[#ef4444]" />
              <span>Active outage</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full bg-[#22c55e]" />
              <span>{recentlyResolvedLabel}</span>
            </div>
            <p className="text-muted-foreground">No color = no outage</p>
            <Separator />
            <p>Solid = Whole area</p>
            <p>Striped = Partial area</p>
          </CardContent>
        </Card>
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

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent side="right" className="w-80 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {selectionLabels?.primary ?? selected?.pcode ?? ""}
            </SheetTitle>
            <SheetDescription>
              {[selectionLabels?.secondary, selectionLabels?.tertiary].join(
                selectionLabels?.secondary ? ", " : "",
              )}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}
