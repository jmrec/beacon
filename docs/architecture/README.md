# Beacon architecture

LikeC4 model of the system **as it exists today**. It documents the current
BENECO-only pipeline: public advisories → LLM area resolution → durable cache →
map overlay and outage list.

The model is intentionally current-state. The proposed BENECO geometry path is
described in [design-notes.md](./design-notes.md), and `benecoGisApi` appears in
the context view as a dashed, not-yet-integrated candidate.

## Run

```bash
pnpm c4:dev       # preview at http://localhost:5173
pnpm c4:build     # static build
pnpm c4:validate  # syntax + semantic check
```

`--no-use-dot` is set in the scripts so the model uses LikeC4's WASM layouter
(the devcontainer does not install Graphviz). Remove the flag if you have
Graphviz and prefer its layout.

## Views

| View | What it shows |
| --- | --- |
| `index` | System context: user, Beacon, and external dependencies |
| `containers` | Web app, server, Neon data store, and external systems |
| `components` | Client components, server services, and data stores |
| `resolver` | The LLM resolution path, its tools, and the durable cache |
| `map-data` | The cache-hit path that feeds the map and area sheet |
| `resolve-flow` | Sequence: cold-cache resolution from feed to rendered map |
| `browse-area` | Sequence: client-side area drill-down |
| `deployment-production` | Current Docker/Compose deployment, managed Neon, and external APIs |

## Current flow

1. **Collect** — `getOutages` / `getResolvedOutageAreas` fetch
   `wballoutages.php` and `wbscheduledoutages.php` for the selected period.
2. **Normalize** — the BENECO adapter strips HTML, collapses whitespace, and
   maps status/schedule fields into `OutageFeed`.
3. **Resolve** — for each outage missing from the store, or whose area text
   fingerprint changed, the LLM resolver maps the free-text area into
   municipalities, barangays, and sub-areas. It may call
   `list_municipalities` and `list_barangays_in_municipality`, which read the
   `beneco` reference schema.
4. **Store** — resolutions are upserted into `resolved_outages` with a
   fingerprint and `resolved_at`.
5. **Display** — the map aggregates pcodes into barangay/city/province fills;
   the area sheet and the AG Grid list read the same feed.

## External dependencies

| System | Role | Notes |
| --- | --- | --- |
| BENECO public outage API | Advisory text and status | Empty days return `{"error": "No results available"}` instead of `[]` |
| BENECO GIS / ADMS API | Exact outage geometry, lines, substations | Not integrated yet; see the design notes |
| LLM provider | Area resolution | Gemini / DeepSeek / Together / OpenRouter |
| Neon Postgres | Reference areas + resolution cache | `beneco.*` and `resolved_outages` |
| Boundary tile server | Admin boundaries by pcode | Currently down during the K3s migration |
| OpenFreeMap | Basemap style and labels | Positron / Dark |

## Model conventions

- `#overview` tags the system/container-level summary edges. Detailed views
  exclude them so the component diagrams only show the real data path.
- `#planned` marks the dashed ADMS candidate edge; it is not part of the
  running system.
- The `beneco` adapter is the provider seam; other cooperatives can add an
  adapter without changing the map or list.
