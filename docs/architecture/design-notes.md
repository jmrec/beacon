# Design notes: moving BENECO off the resolver

Status: proposal, not implemented. The LikeC4 model in this directory documents
the current system; this file records the direction we discussed.

## Decision

- **BENECO** should use the GIS/ADMS geometry as its area source. No LLM
  resolution for BENECO.
- **Other electric cooperatives** keep the resolver. It is a reusable
  capability, not BENECO-specific logic.
- The resolver stays in the codebase, but BENECO stops calling it.

## Why the merged polygon works for red and green

The `/adms/outages` response gives one merged `MultiPolygon` for the currently
affected area, plus a `barangays` FeatureCollection with `municipality`,
`barangay`, `affected_consumers`, and `overlap_area_m2`.

If we persist that footprint while it is open, the same geometry can drive both
states:

- **Red** — the footprint is still present in `/adms/outages`.
- **Green** — the footprint is no longer present, but it was seen recently and
  is still inside the selected period.

That gives the map an exact, stored history instead of a re-derived barangay
approximation. The key is to store the footprint **before** it disappears.

## Open design questions

### 1. How do we identify a footprint?

`/adms/outages` returns synthetic ids such as `ADMS_OUTAGE_1` and
`ADMS_OUTAGE_DEVICE_feeder_protection_1`, not public advisory ids. There is no
start/end time in the payload, only `outage_details[].updated_at`.

Options:

- **Snapshot identity** — hash the merged geometry (or the feeder set +
  topology) and treat each distinct footprint as an event. Track `first_seen`
  and `last_seen`. This needs no public advisory join.
- **Advisory join** — match on feeder + time window + area text. Feeder labels
  differ (`FEEDER_14` vs "Feeder 14"), and one advisory can cover several
  feeders, so this is fuzzy.
- **Keep them independent** — the map shows grid footprints; the list shows
  public advisories. The area sheet can show both without a hard foreign key.

Snapshot identity is the simplest and matches the red/green requirement. The
public advisory link can be added later as an optional association.

### 2. Where do we store it?

A dedicated table is cleaner than overloading `resolved_outages`:

```text
outage_footprints
  company_id      text
  footprint_id    text          -- stable hash or generated id
  geometry        jsonb         -- GeoJSON MultiPolygon
  barangays       jsonb         -- ADMS barangay intersections
  consumers       integer
  first_seen_at   timestamptz
  last_seen_at    timestamptz
  restored_at     timestamptz   -- null while open
  source          text          -- 'adms' | 'resolver'
```

If PostGIS is available, use `geometry(MultiPolygon, 4326)` instead of
`jsonb`. `resolved_outages` can stay for the resolver path and other
cooperatives.

### 3. Who captures the footprint?

If the map only fetches on user request, an outage that opens and closes between
visits is never stored. A server-side poller (cron / scheduled job) should:

1. fetch `/adms/outages?mergePolygons=1&includeBarangays=1` every N minutes;
2. upsert each footprint and bump `last_seen_at`;
3. mark footprints missing from the response as restored;
4. prune restored footprints after the retention window (e.g. the same
   `today` / `this_week` / `last_week` periods).

This also gives the app a health signal when the ADMS endpoint goes stale.

### 4. What about the resolver for other cooperatives?

Keep the current provider seam and add a capability split:

```text
OutageProvider        -> fetch/parse/normalize advisory text
AreaResolver          -> text -> municipalities/barangays (LLM)
GeometrySource        -> ADMS/GIS -> exact footprint (BENECO)
```

The map overlay should accept either an area resolution or a stored geometry:

```ts
type OverlayArea =
  | { kind: "geometry"; geometry: MultiPolygon; barangays: AdmsBarangay[] }
  | { kind: "resolution"; resolution: AreaResolution };
```

BENECO uses `geometry`; other co-ops use `resolution`. The UI can keep the
pcode shading for the resolution path and use the raw polygons for the geometry
path.

## Operational concerns

- **Freshness.** The payload I pulled had `updated_at = 2026-09-02`, while the
  public feed was current to 2026-11-17. Do not treat ADMS as live without a
  freshness check.
- **CORS.** The GIS API did not return `Access-Control-Allow-Origin` for an
  `Origin` request. Proxy it through a server function.
- **Line layer size.** Province-wide primary lines were ~36 MB uncompressed
  (3.5 MB brotli, 32k features). Lazy-load or simplify; do not put it in the
  initial payload.
- **Tile server.** The pcode overlay depends on the boundary tile server, which
  is currently down during the K3s migration. Geometry footprints can render
  without it; keep the tile dependency separate from the outage data.
- **Empty feed shape.** `wballoutages.php` returns an error object on empty
  days, while `fetchFeed` expects an array. Normalize that before it reaches the
  list.

## Suggested migration order

1. Add an ADMS server function/proxy and a typed response parser.
2. Add `outage_footprints` + the poller; verify red/green against the public
   feed for a few days.
3. Render geometry footprints on the map; keep the pcode overlay as a fallback
   for the resolver path.
4. Switch BENECO's map data path to footprints; stop resolving BENECO outages.
5. Keep and generalize the resolver for other cooperatives.
6. Update the area sheet and list so they can show a footprint without a
   resolved-area join.
