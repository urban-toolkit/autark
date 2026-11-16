# Gallery Overhaul: Final Inventory

## Decision and scope

The gallery will move from 66 module-grouped examples to **37 task-guided examples in seven sections**. There will be **no Export section or export example**. The map poster/export page is retired from the public gallery; this does not remove library capabilities or the poster style preset.

This document finalizes the content inventory. It does not implement the redesign or authorize deleting shared datasets, library code, or regression coverage.

| Section | Examples |
|---|---:|
| Data loading | 7 |
| Interaction | 3 |
| Styling and data-driven colors | 4 |
| Imagery | 3 |
| Terrain | 4 |
| Plots | 8 |
| Analytics | 8 |
| **Total** | **37** |

The 37 examples consist of **36 existing canonical pages and one new map-style page**. Canonical paths below are relative to `gallery/`; preserve these URLs while changing titles and content. Task-based browsing does not require renaming all source folders.

## Catalog and filtering rules

- A card has exactly one primary task section and one primary module.
- Module filters are `All`, `autk-map`, `autk-db`, `autk-compute`, and `autk-plot`.
- The module list in the catalog is ordered: primary module first, then supporting modules. A filter matches any listed module. Counts therefore overlap across modules.
- List directly used toolkit modules, including the modules used to prepare the example's data. Do not list transitive dependencies or add `autk-core` to every card.
- Reuse the website palette: map `#0ea5e9`, database `#f59e0b`, compute `#10b981`, plot `#8b5cf6`. Every color dot has a visible module label.
- Filtering and search operate on cards, not their parent section. Hide empty sections and update counts.
- Each task has one canonical card. Variants stay inside that page and have explicit controls and corresponding code, not additional gallery cards.
- Shared page chrome must not hide the public API calls that teach the task.
- Diagnostics, intentionally invalid inputs, synthetic failure cases, and performance dashboards are not public learning examples.
- The gallery contains no automated tests or test fixtures. Module packages own behavioral tests and regression fixtures; gallery layout and navigation receive manual review.
- All examples that load OSM vector data use bundled local PBF files. D05 is the only Overpass-access example and the only exception. No other example may silently fall back to Overpass or live geocoding.

## Final public catalog

Module abbreviations in these tables: **Map** = `autk-map`, **DB** = `autk-db`, **Compute** = `autk-compute`, **Plot** = `autk-plot`.

### Data loading

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| D01 | Render GeoJSON directly | Map | `src/autk-map/standalone-geojson-vis.html` | Points, lines, and polygons as explicit dataset variants; no database required. |
| D02 | Convert between coordinate systems | Map | `src/autk-map/standalone-geographic-geojson-vis.html` | Geographic to projected, projected to geographic, and projected to projected; custom definitions and workspace selection. |
| D03 | Import GeoJSON into a workspace | DB, Map | `src/autk-map/geojson-vis.html` | Database import, workspace normalization, and rendering; show file URL and in-memory collection inputs. |
| D04 | Import CSV and JSON tables | DB, Map | `src/autk-map/csv-wkt-vis.html` | Explicit CSV/JSON and coordinate-column/WKT variants; show the appropriate loading call for each. |
| D05 | Access OpenStreetMap through Overpass | DB, Map | `src/autk-map/osm-layers-api.html` | The dedicated live-API example: place and bounding-box queries, tag filters, and base-layer selection. Explicitly label Overpass and any geocoding dependency. |
| D06 | Load a local OSM extract | DB, Map | `src/autk-map/osm-layers-pbf.html` | Bundled PBF import with an optional bounding-box filter. This is the flat vector-city baseline. |
| D07 | Organize data in workspaces | DB, Map | `src/autk-map/osm-layers-api-workspaces.html` | Switch between isolated workspaces in one database using local PBF inputs and explicit bounds; make differences in the displayed data explicit. |

### Interaction

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| I01 | Select and inspect features | Map, DB | `src/autk-map/building-picking.html` | Feature selection, highlighting, and a useful properties panel. Explain that selection is not limited to buildings. |
| I02 | Hide and restore selected features | Map, DB | `src/autk-map/building-hiding.html` | Select, hide, restore, and clear; maintain selection/visibility feedback. |
| I03 | Navigate and animate the camera | Map | `src/autk-map/camera-animation-vis.html` | One focused scene with `setView`, data-driven framing, and camera animation. Remove unrelated analysis scenes from this page. |

### Styling and data-driven colors

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| S01 | Color features by category | Map, DB | `src/autk-map/colormap-categorical.html` | String and numeric categories, explicit category ordering, and a matching legend. |
| S02 | Color features by numeric values | Map, DB | `src/autk-map/colormap-diverging.html` | Sequential and diverging scales with clearly explained domains. |
| S03 | Apply and customize map styles | Map | `src/autk-map/map-styles.html` **(new)** | Built-in presets and a small custom-palette example using existing local GeoJSON. No poster or export workflow. |
| S04 | Control opacity and polygon outlines | Map, DB | `src/autk-map/layer-opacity.html` | Opacity and `showBorders` controls on a small multilayer scene. |

### Imagery

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| B01 | Create an imagery basemap | Map | `src/autk-map/tiles-basemap.html` | Provider selection, view, and visibility. Remove default cache/request/memory dashboards and the synthetic provider from the public controls. |
| B02 | Combine imagery and vector layers | Map, DB | `src/autk-map/osm-layers-pbf-imagery.html` | One city with the imagery beneath its vectors; explicitly handle opaque surface visibility. |
| B03 | Display RGB and scalar rasters | DB, Map | `src/autk-map/geotiff-vis.html` | Meaningful geographic raster data, RGB versus scalar mode, range, no-data, opacity, and an optional vector reference overlay. No intentionally invalid actions. |

### Terrain

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| T01 | Add elevation to vector layers | Map, DB | `src/autk-map/osm-layers-pbf-terrain.html` | A vector city with streamed elevation and no imagery. |
| T02 | Drape imagery over terrain | Map | `src/autk-map/terrain-tiles.html` | Imagery plus streamed elevation, without vector-data prerequisites or a statistics sidebar. |
| T03 | Combine terrain, imagery, and vectors | Map, DB | `src/autk-map/osm-layers-pbf-imagery-terrain.html` | The combined city scene. Explain only the additions beyond B02 and T01. |
| T04 | Load terrain from a local GeoTIFF | Map, DB | `src/autk-map/terrain-layers-niteroi.html` | Local elevation rather than streaming; communicate its finite coverage. |

Use Niteroi for D06, B01's initial view, B02, and T01-T04, reusing the existing PBF and elevation assets. Preserve the existing dataset's documented spelling in UI copy. Match the initial center, zoom, styles, and vector source across the six city configurations:

| Ground | Vectors | Imagery | Vectors + imagery |
|---|---|---|---|
| Flat | D06 | B01 | B02 |
| Terrain | T01 | T02 | T03 |

### Plots

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| P01 | Compare categories with a bar chart | Plot, Map | `src/autk-plot/barchart-click.html` | Category comparison and coordinated selection. |
| P02 | Explore relationships with a scatterplot | Plot, Map | `src/autk-plot/scatterplot-brush.html` | Selection and brushing in one scatterplot example. |
| P03 | Explore distributions with a histogram | Plot, Map | `src/autk-plot/histogram-brush.html` | Brushing, a land-use dataset variant, and a deliberate user-triggered data update. No timed regression trigger. |
| P04 | Compare two dimensions with a heat matrix | Plot, Map | `src/autk-plot/heatmatrix-click.html` | Matrix selection coordinated with the map. |
| P05 | Inspect records in a linked table | Plot, Map | `src/autk-plot/table-click.html` | Record-level selection and its map counterpart. |
| P06 | Explore multiple attributes with parallel coordinates | Plot, Map | `src/autk-plot/parallel-coordinates.html` | Multidimensional exploration and linked selection. |
| P07 | Select events on a timeline | Plot, Map, DB | `src/autk-plot/temporal-events-click.html` | Discrete temporal events and their spatial context. |
| P08 | Explore a time series | Plot, Map | `src/autk-plot/timeseries-click.html` | Continuous temporal values and coordinated selection. |

Keep timelines and time series separate: they teach different data models. Keep tables and heat matrices separate for the same reason. All linked examples must explain both directions of selection and offer a clear reset action.

### Analytics

| ID | Final title | Modules | Canonical path | Required scope |
|---|---|---|---|---|
| A01 | Join points to areas | DB, Map | `src/autk-map/spatial-join.html` | Containment-based aggregation and a visible result. |
| A02 | Chain spatial joins | DB, Map | `src/autk-map/spatial-join-multi.html` | Multiple join results, with each stage and resulting property explained. |
| A03 | Find nearby features | DB, Map | `src/autk-map/spatial-join-near.html` | Distance-based aggregation; road/building targets as variants. |
| A04 | Build a density heatmap | DB, Map | `src/autk-map/heatmap-vis.html` | Spatial aggregation, grid resolution, and an optional polygon reference overlay. |
| A05 | Calculate feature attributes on the GPU | Compute, DB, Map | `src/autk-map/compute-function.html` | Polygon compactness and road lane calculations as explicit function/input variants; OSM roads come from a local PBF. |
| A06 | Measure sky exposure | Compute, DB, Map | `src/autk-map/compute-render-osm-sky-exposure.html` | Define the measured quantity and visualize the result using a local PBF city scene. |
| A07 | Calculate a view score | Compute, DB, Map | `src/autk-map/compute-render-osm-view-score.html` | Define the scoring rule and visualize the result using a local PBF city scene. |
| A08 | Analyze visibility | Compute, DB, Map | `src/autk-map/compute-render-osm-visibility.html` | Define observer/target selection and visualize visibility using a local PBF city scene. |

## Complete disposition of the 66 current examples

All paths in the following table are relative to `gallery/src/`.

Actions:

- **Retain:** canonical foundation for the destination task; rewrite its title, chrome, controls, and source as required above.
- **Merge:** transfer the distinct teaching content to the destination and retire the separate public card/page after migration.
- **Fixture:** preserve diagnostic or regression behavior in the responsible module's tests and fixtures, never under `gallery/`. The destination ID identifies where useful public teaching content goes, not a requirement to keep the diagnostic UI there.
- **Retire:** no separate replacement example is needed. An ID indicates the relevant surviving task for old links.

| # | Current page | Action | Destination | Decision |
|---|---|---|---|---|
| 01 | `autk-map/standalone-geojson-vis.html` | Retain | D01 | Direct map loading without a database. |
| 02 | `autk-map/standalone-geographic-geojson-vis.html` | Retain | D02 | Expand from geographic input to all three conversion directions. |
| 03 | `autk-map/standalone-points-geojson-vis.html` | Merge | D01 | A geometry variant, not a separate loading workflow. |
| 04 | `autk-map/geojson-vis.html` | Retain | D03 | Canonical database GeoJSON import. |
| 05 | `autk-map/geojson-lines-vis.html` | Merge | D03 | Preserve line import as a geometry variant. |
| 06 | `autk-map/geojson-boundaries-vis.html` | Merge | D03 | Its current code demonstrates in-memory database import; preserve that input variant rather than a misleading boundary-only card. |
| 07 | `autk-map/colormap-categorical.html` | Retain | S01 | Canonical categorical styling. |
| 08 | `autk-map/colormap-categorical-numeric.html` | Merge | S01 | Preserve numeric labels and explicit order. |
| 09 | `autk-map/colormap-diverging.html` | Retain | S02 | Add the sequential-scale comparison. |
| 10 | `autk-map/heatmap-vis.html` | Retain | A04 | Heatmap creation is analytics, not just styling. |
| 11 | `autk-map/heatmap-vis-geojson.html` | Merge | A04 | Polygon reference overlay is an option within the heatmap task. |
| 12 | `autk-map/layer-opacity.html` | Retain | S04 | Simplify the scene and add polygon-outline control. |
| 13 | `autk-map/tiles-basemap.html` | Retain | B01 | Keep basemap controls; move diagnostics out of the learning UI. |
| 14 | `autk-map/raster-rgb.html` | Fixture | B03 | Keep invalid dimensions/ranges, masked outliers, and synthetic RGB cases as regression fixtures. Transfer normal RGB/scalar behavior to B03. |
| 15 | `autk-map/geotiff-vis.html` | Retain | B03 | Canonical geographic-raster example. |
| 16 | `autk-map/geotiff-vis-geojson.html` | Merge | B03 | Vector context becomes an optional overlay. |
| 17 | `autk-map/tiles-categorical.html` | Merge | B02 | Keep a styled-vector option, not another imagery-combination card. |
| 18 | `autk-map/osm-layers-pbf-imagery.html` | Retain | B02 | Canonical vector-city plus imagery workflow. |
| 19 | `autk-map/terrain-tiles.html` | Retain | T02 | Canonical imagery-only terrain workflow. |
| 20 | `autk-map/terrain-categorical.html` | Merge | T03 | Styled roads are one vector-overlay option in the combined scene. |
| 21 | `autk-map/terrain-layers-niteroi.html` | Retain | T04 | Local GeoTIFF elevation is a distinct loading workflow. |
| 22 | `autk-map/terrain-layers-niteroi-streamed.html` | Merge | T01 | Consolidate streamed vector terrain around one city baseline. |
| 23 | `autk-map/osm-layers-pbf-terrain.html` | Retain | T01 | Canonical vector-only terrain workflow. |
| 24 | `autk-map/osm-layers-pbf-imagery-terrain.html` | Retain | T03 | Canonical combined terrain workflow. |
| 25 | `autk-map/building-picking.html` | Retain | I01 | Reframe as general feature selection and inspection. |
| 26 | `autk-map/building-hiding.html` | Retain | I02 | Visibility changes are distinct from inspecting a selection. |
| 27 | `autk-map/camera-animation-vis.html` | Retain | I03 | Reduce the current collection of scenes to one camera-focused example. |
| 28 | `autk-map/map-poster.html` | Retire | - | Remove the public export example and its card. S03 teaches style presets independently; do not preserve export controls there. |
| 29 | `autk-map/csv-wkt-vis.html` | Retain | D04 | Canonical table-import page. |
| 30 | `autk-map/json-wkt-vis.html` | Merge | D04 | Preserve JSON as an explicit format variant. |
| 31 | `autk-map/osm-layers-api.html` | Retain | D05 | Canonical remote OSM query. |
| 32 | `autk-map/osm-layers-api-bbox.html` | Merge | D05 | Bounding-box queries remain a visible, documented variant. |
| 33 | `autk-map/osm-tag-sets.html` | Merge | D05 | Preserve custom tag filters and typed results. |
| 34 | `autk-map/osm-layers-api-multi.html` | Fixture | D07 | Current code creates two databases/maps, not one multi-area query. Preserve instance-isolation coverage; D07 remains the public workspace task. |
| 35 | `autk-map/osm-layers-api-chicago.html` | Retire | D06 | City-only duplication. Preserve any missing-height edge cases in tests before deletion. |
| 36 | `autk-map/osm-layers-api-niteroi.html` | Retire | D06 | City-only duplication; local city examples use D06's shared Niteroi extract. |
| 37 | `autk-map/osm-layers-api-paris.html` | Retire | D06 | City-only duplication. |
| 38 | `autk-map/osm-layers-api-manhattan-surface.html` | Retire | D06 | Surface selection is a base-layer option. |
| 39 | `autk-map/osm-layers-api-manhattan-water.html` | Retire | D06 | Water selection is a base-layer option. |
| 40 | `autk-map/osm-layers-api-manhattan-parks.html` | Retire | D06 | Park selection is a base-layer option. |
| 41 | `autk-map/osm-layers-api-manhattan-s+p.html` | Retire | D06 | A base-layer combination, not another task. |
| 42 | `autk-map/osm-layers-api-manhattan-s+w.html` | Retire | D06 | A base-layer combination, not another task. |
| 43 | `autk-map/osm-layers-api-manhattan-w+p.html` | Retire | D06 | A base-layer combination, not another task. |
| 44 | `autk-map/osm-layers-pbf.html` | Retain | D06 | Canonical local PBF import and flat vector city. |
| 45 | `autk-map/osm-layers-pbf-bbox.html` | Merge | D06 | Preserve spatial filtering without a duplicate page. |
| 46 | `autk-map/osm-layers-api-workspaces.html` | Retain | D07 | Canonical workspace switching. |
| 47 | `autk-map/spatial-join.html` | Retain | A01 | Containment-based aggregation. |
| 48 | `autk-map/spatial-join-buildings.html` | Merge | A03 | The code uses `near`, so preserve building proximity as a distance-join variant, not a containment join. |
| 49 | `autk-map/spatial-join-multi.html` | Retain | A02 | Chaining joins is a distinct task. |
| 50 | `autk-map/spatial-join-near.html` | Retain | A03 | Canonical proximity analysis. |
| 51 | `autk-map/compute-function.html` | Retain | A05 | Canonical custom GPU calculation. |
| 52 | `autk-map/compute-osm-function.html` | Merge | A05 | Preserve the road-input/function variant. |
| 53 | `autk-map/compute-render-osm-sky-exposure.html` | Retain | A06 | A distinct measured quantity. |
| 54 | `autk-map/compute-render-osm-view-score.html` | Retain | A07 | A distinct scoring rule. |
| 55 | `autk-map/compute-render-osm-visibility.html` | Retain | A08 | A distinct observer/target analysis. |
| 56 | `autk-plot/barchart-click.html` | Retain | P01 | Categorical comparison. |
| 57 | `autk-plot/heatmatrix-click.html` | Retain | P04 | Two-dimensional matrix exploration. |
| 58 | `autk-plot/scatterplot-click.html` | Merge | P02 | Selection and brushing belong in the same scatterplot example. |
| 59 | `autk-plot/table-click.html` | Retain | P05 | Record-level linked inspection. |
| 60 | `autk-plot/histogram-brush.html` | Retain | P03 | Canonical distribution example. |
| 61 | `autk-plot/histogram-brush-landuse.html` | Merge | P03 | Preserve the land-use dataset variant. |
| 62 | `autk-plot/histogram-rebuild.html` | Fixture | P03 | Preserve the timed rebuild regression in tests; show data updates through an explicit user action in P03. |
| 63 | `autk-plot/scatterplot-brush.html` | Retain | P02 | Canonical scatterplot, including both selection modes. |
| 64 | `autk-plot/parallel-coordinates.html` | Retain | P06 | Multidimensional exploration. |
| 65 | `autk-plot/temporal-events-click.html` | Retain | P07 | Discrete temporal events. |
| 66 | `autk-plot/timeseries-click.html` | Retain | P08 | Continuous temporal values. |

## Asset and behavior decisions

1. Reuse existing non-OSM neighborhood, point, and tabular datasets for standalone GeoJSON, styling, chart, and join tasks where appropriate, verifying provenance. Standalone map-only tasks must use non-OSM inputs. Do not use OSM-derived road/building GeoJSON as a shortcut around the local-PBF rule; load those features from a local PBF instead.
2. Reuse the existing Niteroi PBF and elevation assets for the six city configurations and local terrain example. Use explicit local bounds rather than requiring a live geocoding request for the local PBF path.
3. D05 is the only example that calls Overpass (and, for its place-name variant, a geocoder). Loading, rate-limit, unavailable-service, and empty-result states must be clear. Overpass loader behavior is tested in `autk-db`, using module-owned deterministic fixtures, not by testing the gallery page.
4. B03 needs a small, attribution-reviewed RGB geographic raster asset. The current repository has scalar elevation rasters and a synthetic test PNG, not a suitable real RGB GeoTIFF. Adding that asset is a concrete implementation task; do not relabel the synthetic PNG as satellite imagery. Keep the scalar path runnable with the existing DEM.
5. The public variant controls must update the displayed code or link to the exact variant source. Avoid a generic configuration playground or hidden timed mode changes.
6. Do not add a separate public card for every city, projection, geometry, plot event, or layer combination.
7. Audit every retained OSM-dependent loading, interaction, color, imagery, terrain, plot, and analytics scene. Outside D05, pass a local `pbfFileUrl` and use explicit bounds when filtering. Do not retain place-name lookups or remote-only helper defaults from the old pages. Preserve API-specific custom-tag demonstrations in D05 rather than disguising a live request as a local PBF example.
8. Use `lower_mnt.osm.pbf` for Manhattan workflows and `niteroi.osm.pbf` for the shared Niteroi city workflows where their coverage fits the task. Reuse other available local extracts if needed; any new extract must have a documented extent, provenance, and attribution.
9. Provider imagery requests are separate from OSM vector ingestion. Imagery examples may request their selected provider's tiles, but must not invoke Overpass to obtain vector context.

## Retirement and test-preservation rules

- First preserve useful behavior in module-level tests; then remove superseded public pages and their gallery-specific tests.
- Existing public URLs for merged examples should lead to the canonical destination. Retired city/layer variants lead to the local PBF example D06, not the live API example D05. Retired export has no task-equivalent replacement: return users to the gallery, not to an unrelated style example.
- The final gallery has no `gallery/test/`, `gallery/tests/`, or test fixtures. Do not merely relocate gallery-page tests into module folders: rewrite them to exercise module APIs and module-owned fixtures, without importing gallery source, fetching gallery pages, or depending on gallery DOM IDs.
- Preserve RGB validation, tile/terrain loading and failure behavior, picking, cancellation, high-DPI rendering, and camera/rendering regressions in `autk-map/test/` and its fixtures.
- Preserve histogram rebuild and plot selection/interaction regressions in `autk-plot/test/` and its fixtures.
- Preserve database-instance/workspace isolation, local PBF imports, and mocked Overpass failure cases in `autk-db/test/` and its fixtures. Computation-specific cases belong to `autk-compute/test/`.
- Cross-module contract checks may live in the responsible module and use the other modules through their public APIs. They must not depend on runnable gallery examples.
- Move synthetic imagery/provider controls and performance instrumentation needed by module tests into module-owned fixtures. Do not leave a hidden developer gallery in the public navigation.
- Do not remove the poster style preset or general library functionality when retiring the export page.
- Delete shared assets or helpers only after checking references across `gallery`, `tutorial`, `usecases`, and package tests.

## Implementation order and acceptance

1. **Catalog and navigation:** represent these 37 tasks in one catalog; implement section grouping, per-card module filtering, search, accessible color labels, and URL state. Verify that every canonical card appears once and that cross-module filters retain the correct cards.
2. **Page template:** convert D01 and P02 first. Verify usable desktop/mobile layouts, consistent loading/error/empty states, readable source, and bidirectional linked selection where applicable.
3. **Loading, styling/data-driven colors, and interaction:** migrate D01-D07, I01-I03, and S01-S04. Verify variant-specific loading calls, projection examples, workspace isolation, selection, and camera stability. Confirm local PBF loading for every OSM-dependent scene except D05.
4. **Imagery and terrain:** migrate B01-B03 and T01-T04 around the shared city baseline. Verify all six map configurations, finite raster coverage, attribution, visibility, and both local and streamed elevation.
5. **Plots and analytics:** migrate P01-P08 and A01-A08. Verify unique learning goals, coordinated selections, explicit resets/data updates, and deterministic analytical results.
6. **Retirement:** transfer regression coverage to module-owned tests/fixtures, remove gallery-specific tests and fixtures, update old links, remove obsolete public pages including export, and audit shared assets. The final public gallery has exactly seven sections and 37 examples, with no diagnostic or export cards and no gallery test suite.

Verification during implementation: `make typecheck`, `make lint`, `npm test` for module tests, and relevant module-owned browser cases such as `node autk-compute/test/run-webgpu.mjs /autk-map/test/terrain-tiles.webgpu.ts`. Verify the gallery's browsing, controls, source snippets, and desktop/mobile layouts manually; do not introduce automated gallery tests. During manual review, check network requests to confirm that only D05 accesses Overpass/geocoding and other OSM vector examples read local PBF files. Preserve and report unrelated environment failures rather than deleting data to make checks pass.
