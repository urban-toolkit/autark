# Deprecated API cleanup report

**Baseline:** local `main`, `c404fede`, after merging `integrate/pr-119`. This is an inventory and removal plan, not a patch. It covers public APIs, internal runtime compatibility branches, persisted data, generated code, docs, examples, and tests. It does not measure downstream npm usage. The plot migration draft in the local stash is not part of this baseline.

## Implementation status

The cleanup removes all entries in the public API table below, the internal terrain compatibility paths, the CRS forwarding module, and positional building-part inference. Gallery and use-case clients, tests, and generated plot templates use the replacements. No tracked GeoJSON contained positional `parts`; the in-repo positional fixtures were migrated. When upgrading saved GeoJSON, assign each positional part its original zero-based `geometryIndex` before loading it.

`getRaster()`, the two distinct polyline builders, and the gallery URL redirect remain supported for the reasons below. The built-in fixed-raster terrain path remains supported through `StaticHeightSource`.

Verification: `make verify` (1,444 tests passed, 3 skipped), 614 plot browser tests, 35 map WebGPU checks, and packed-package consumer checks passed.

## Deprecated or superseded public APIs at the baseline

| Package | Maintained API | Replacement and in-repo dependencies |
| --- | --- | --- |
| Map | [`new AutkMap(canvas, showUi, options?)`](../autk-map/src/map.ts#L204) | `new AutkMap(canvas, { ...options, showUi })`. The boolean overload still runs a separate constructor path. Migrate [the render-sizing WebGPU fixture](../autk-map/test/render-sizing.webgpu.html). |
| Map | [`enableTerrainMode(collection, property)`](../autk-map/src/map.ts#L1287) | `loadTerrain({ source: { collection, property } })`. Live calls remain in the on-demand rendering tests and the terrain WebGPU fixture. |
| Map | [`enableTerrainTiles(params)`](../autk-map/src/map.ts#L1333) and exported [`EnableTerrainTilesParams`](../autk-map/src/api.ts#L288) | `loadTerrain(params)` and `LoadTerrainParams`. Migrate on-demand rendering tests. Move the shared option fields to the current type before dropping the old export; `LoadTerrainParams` currently derives from it. |
| Map | [`disableTerrainMode()`](../autk-map/src/map.ts#L1300) | `removeTerrain()`. Live calls remain in the on-demand rendering tests. |
| Map | [`LoadTilesParams.center` / `.zoom`](../autk-map/src/api.ts#L251) and [`LoadTerrainParams.center` / `.zoom`](../autk-map/src/api.ts#L65) | Use `map.setView({ center, zoom })` before loading imagery or streamed terrain on an empty map. Keep `loadTiles()` and `loadTerrain()` themselves. Migrate README examples, on-demand rendering tests, and the terrain WebGPU fixture. Establish a custom workspace CRS before `setView()` when needed, since setting the view establishes the workspace. |
| Plot | [`PlotConfig.tickFormats`](../autk-plot/src/api.ts#L93) | `ticks.x.format` / `ticks.y.format` for Cartesian axes. The array also serves table columns and parallel coordinates, so preserve field-specific formats before removing it (the draft uses `style.columnFormats` and `ticks.dimensions`). Migrate the gallery table, Niterói plots, browser tests, and registered-plot documentation. |
| Plot | [`PlotConfig.colorMapInterpolator`, `.categoricalColorMapInterpolator`, `.domainSpec`](../autk-plot/src/api.ts#L103) | `style.colorMap: { interpolator, domainSpec }` or a typed custom palette. These old fields still act as runtime fallbacks. Preserve the default sequential and categorical schemes and the calendar/hexbin-specific numeric defaults. Migrate those built-in defaults, tests, and docs. If a downstream config intentionally set different numeric and categorical schemes on the same plot, the single explicit scale is not a mechanical replacement; choose the scale when changing the color field. |
| Database | [`LoadGeoTiffParams.maxPixels`](../autk-db/src/use-cases/load-geotiff/interfaces.ts#L30) | `maxRasterCells`. The implementation still reads the old alias when the new option is absent. No in-repo call supplies `maxPixels`. |

## Internal code and data cleanup

- **Core building data:** [`normalizeBuildingFeature`](../autk-core/src/building-feature.ts) still guesses the part index from its array position when `geometryIndex` is missing. Remove that inference and reject positional metadata after migrating GeoJSON inputs. The core triangulator tests explicitly guarantee the old format, and `usecases/test/logic.test.ts` supplies positional parts. Convert those fixtures and add a rejection test. Preserve support for features with no `parts` metadata at all. Check external stored GeoJSON before release; existing file consumers can break even if TypeScript still builds.
- **Map renderer internals:** [`Triangles3DLayer.setTerrainHeightSource`](../autk-map/src/layer-triangles3D.ts#L204) still implements the old `Heightfield` plus 2D texture route, including a private texture, cache key, upload, and disposal branches. The production [`TerrainMapRenderPath`](../autk-map/src/map-terrain.ts#L93) already supplies a `HeightSource` and array view to the layer. Normalize fixed rasters to `StaticHeightSource` once, at the `loadTerrain()` boundary, then require `HeightSource` in both the render path and [`TerrainRenderer`](../autk-map/src/renderer-terrain.ts#L231). Delete the old layer upload and its cleanup, the renderer constructor's duplicate conversion, and the unused [`heightfield` getter](../autk-map/src/renderer-terrain.ts#L585). Migrate `render-order.webgpu.ts` to use the array texture path and `terrain-resources.test.ts` to pass a `StaticHeightSource`. Retain fixed GeoTIFF support and verify both raster and streaming terrain, GPU resource rollback, picking, and selection rendering.
- **Map CRS adapter:** [`tile-projection.ts`](../autk-map/src/tile-projection.ts) forwards shared core CRS functions and constants, including `isSupportedCrs` under the old name `isTileCrs`. Migrate map internals and projection tests to import core functions directly. `TileCrs` is a public name with no constraints beyond `string`; if the goal is to eliminate the adapter entirely, make its removal an explicit breaking change and use `string` for the CRS fields rather than adding an alias.
- **Database raster access:** [`getRaster()`](../autk-db/src/db.ts#L695) is not marked deprecated; it still validates and exports both compact GeoTIFF and heatmap tables. `getLayer()` delegates to it for geometry-less raster tables. If choosing a single entry point, keep the raster export implementation internal, expose it through `getLayer()`, and migrate the gallery, tutorial, Niterói use case, and raster tests. Preserve the raster's own extent, band arrays, and nullable geometry types. Do not simply delete `getRaster()` and its implementation.
- **Core polyline builders:** `TriangulatorPolylines` is not a dead alias for `PolylineBuilder`. Compute rendering still uses the triangulator's mesh, while map rendering consumes the builder's centerline topology.
- **Gallery URL:** [`timeseries-click.html`](../gallery/src/autk-plot/timeseries-click.html) redirects to the consolidated neighborhood timeline. This preserves an old URL, not a library API. Decide separately whether to remove it.

## Already removed or never retained

`ColorMapPatch` is gone with no export alias; use `ColorMapOptions`. `MapEvent.PICKING` is gone; use `MapEvent.CLICK`. The legacy coordinate-matrix geometry input is rejected by compute instead of accepted alongside the current geometry binding. The superseded PR proposals `tickCounts`, `markRadius`, and top-level `categoryColors` are not public members of this baseline. No additional explicitly deprecated public members were found in core, compute, or the umbrella package.

## Suggested cleanup order

1. Remove the database alias. Verify the GeoTIFF resampling tests and that `maxRasterCells` still limits raster cells.
2. Migrate the plot options and callers, regenerate the provenance templates, and run the plot Chrome suite. Keep the plot removal separate from map work.
3. Remove the map overload and terrain wrappers. Migrate tests and docs, including tile-only and terrain-only initialization, failed GPU allocation, and camera preservation. Exercise the WebGPU fixtures as well as unit tests.
4. Remove the internal terrain compatibility paths and CRS forwarding adapter in separate changes. Their callers and regression tests differ from the public method changes.
5. Migrate stored-format fixtures and producers before rejecting positional building parts. Decide separately whether to consolidate database raster access and remove the obsolete gallery URL. Regenerate derived templates and update runnable source snippets after their source code changes.

Treat public removals as breaking changes and document the replacements. Run `make verify`, the relevant browser and WebGPU tests, `npm run pack:packages`, and `npm run test:packages` on the resulting release candidate.
