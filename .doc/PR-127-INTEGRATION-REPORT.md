# PR #127 branch adaptation report

The working branch is `feat/terrain-tiles`, based on PR head `5d18ba6`. Current main `c036017` has been brought into the working tree without a commit. Main is unchanged. No changes have been pushed, and PR #127 has not been merged or closed.

## Compatibility and fixes

- Resolved all seven merge conflicts while preserving main's configurable near/far planes, corrected camera rays, drawing-order rendering, RGB raster behavior, source presets, geographic tile views, shared credits, and gallery design.
- Retained physical building and terrain depth. No artificial layer heights, rendering z-index uniforms, or per-layer depth offsets were restored.
- Exported shared numerical helpers from `autk-core`, moved their tests there, and removed map-local math imports.
- Made tile selection use an explicitly supplied offscreen viewport for terrain while keeping the renderer backing store and DPR for flat maps.
- Validated terrain options before requests, including finite cache limits and a bound of 4096 wanted tiles. Source construction failure cancels requests.
- Separated idle network/composition state from complete height coverage. Permanent failures and no-data coverage settle visibly instead of reporting loading indefinitely.
- Tracked terrain GPU allocations so partial construction and repeated destruction release resources safely. Camera fitting occurs only after terrain resources are built. Failed replacement retains the previous terrain and view, including when the shared overlay was resized.
- Preserved fixed-GeoTIFF terrain and the earlier fixed-heightfield building API. Fixed heightfields use their own grid origin for seam stitching; streamed roots remain anchored in world space, including one-level sources.
- Added a configurable streamed-terrain overlay edge (64–4096, default 2048), reducing the default overlay estimate from approximately 740 MB to 185 MB at 4× MSAA. Existing GeoTIFF terrain retains its previous default.
- Destroying a map clears the streamed-source reference and terrain credits.

## Rio examples

`terrain-tiles.html` is an extension of `tiles-basemap`: Rio only, geographic center/zoom, the same imagery choices, Overview/Tilt, visibility, opacity, loading header, instructions, and a statistics side panel. No outline layer or place selector is required.

`terrain-categorical.html` extends `tiles-categorical`: bundled Rio roads loaded through the real database, category order 3/1/2, terrain, provider switching, and no statistics panel or imagery-opacity control. Source road tags are preserved; the Rio classification groups major roads, secondary roads, and remaining classes. The dataset has 681 features and records its source and OpenStreetMap attribution; no Overpass query is required to open the example.

Both examples reuse the original basemap controller and road-color helper. Existing flat examples retain their behavior. Gallery startup now preloads DuckDB to avoid first-navigation dependency re-optimization replacing the page during DOM inspection.

## Unified terrain API

`loadTerrain({ source })` now handles both elevation tile presets and normalized raster sources (`{ collection, property }`). Existing vector maps supply the origin, CRS, and camera automatically. Empty streamed-terrain maps accept center/zoom, and empty raster maps can initialize from raster bounds. Imagery is independently optional and can be loaded before or after terrain. `removeTerrain()` preserves imagery, data, and view. Previous methods remain compatibility wrappers.

The map owns one workspace CRS (the shared AutkDb default unless declared in the constructor or on the first successful geographic load). Both imagery and terrain inherit it and reject subsequent conflicting settings. The existing first-load `crs` option remains supported for custom vector workspaces. Custom normalized database data requires declaring its CRS on the map because GeoJSON collections do not convey reliable workspace metadata. Terrain setup preserves existing views and the active source when replacement fails. Terrain-only rendering now uses an opaque shaded surface beneath optional overlays. Gallery terrain examples use the unified loader.

## Vector-first PBF examples

Three gallery pages extend the original `osm-layers-pbf` workflow and share its database/PBF loader and building-opacity control:

- `osm-layers-pbf-imagery.html`: load all five vector layers, then imagery.
- `osm-layers-pbf-terrain.html`: load vectors, then elevation without imagery.
- `osm-layers-pbf-imagery-terrain.html`: load vectors, then imagery and elevation.

Each frames the vector extent before adding geographic sources. Neither terrain nor imagery receives a center or zoom; both inherit the normalized workspace CRS, origin, and camera. Imagery variants keep the opaque surface loaded but hide it initially so it does not cover imagery; all other vector layers remain visible. Map bars and live loading states follow the gallery design. The gallery index lists all three variants.

Validation of all three PBF variants uses real parsing of the bundled 6 MB extract and the real database. External raster responses are deterministic fixtures. Checks cover vector-first loading, inherited coordinates/camera, independent imagery/terrain presence, surface visibility, attribution, building opacity, tilt, and native GPU validation. All six populated desktop/mobile cases (1440 and 390 pixels) fit their bars and map stages with no overflow or gaps.

## Performance follow-up

Long animation callbacks were traced primarily to elevation sampling during partial tile coverage. Composition now yields between four-row batches, freezes tile references for each job, publishes only complete grids, and cancels obsolete camera plans. A completion recheck prevents missing arrivals during a pending job. Terrain subdivision/seam selection runs once per frame. Panel status is computed once and unchanged DOM values are preserved; percentile summaries reuse unchanged samples. Memory diagnostics include scratch grids and retained snapshots.

A controlled native Chrome 157 profile of the default Rio example at 1440×1100, DPR 1, measured maximum animation callbacks of 49.1 ms before and 7.8 ms after the change. Panning and provider switching peaked at 6.8 ms per animation callback. No animation or interval callback exceeded 50 ms in these controlled runs. Live providers and other hardware still require validation.

## General elevation validation

A shared `autk-core` quality stage now assesses isolated raster deviations using physical sample spacing, median/MAD neighborhood statistics, opposing-neighbor feature support, and coarser references. The tile adapter validates before bilinear interpolation, crosses tile boundaries using a protected halo, validates coarser references recursively, and composes filtered heights through the existing row budget. The normalized raster adapter uses the same spatial rules without changing database inputs. Negative elevations are never clipped to sea level.

Validation is enabled by default, configurable through `loadTerrain({ validation })`, and disabled with `validation: false` for exact source behavior. Shared diagnostics report checked, rejected, corrected, and unresolved decisions. Ambiguous numeric features remain unchanged; temporary unavailable-neighbor cases use the existing missing-data fallback. Extremely strong spatial support permits local median repair without a coarse reference. Parent requests also support one-level terrain. Live quality buffers are included in memory diagnostics.

Seven small real-data fixtures cover Rio, Alps, Grand Canyon, Netherlands, Dead Sea, North Pacific, and Sahara. Each records raw PNG provenance, pixel bounds, and SHA-256. Controlled tests cover both error signs, small clusters, tile edges/corners, missing neighbors, corrupted coarse references, cliffs/ridges/valleys, negative terrain, configuration, and raw-data preservation. A native GPU test reproduces the actual Rio pit through production terrain vertex functions and verifies the repaired geometry. See [ELEVATION-VALIDATION.md](ELEVATION-VALIDATION.md).

## Validation

- Combined CPU coverage: 1122 passed, three optional Dawn tests skipped, across 82 files. Browser GPU regressions below cover the shader path without installing Dawn.
- Workspace builds and type checks, repository lint, strict browser-test type checks, and gallery build pass.
- Package artifact validation and packing all six packages pass. Isolated consumer installation, strict types, Node imports, and browser bundling pass with TLS verification enabled and the OS CA bundle supplied for that command.
- Native terrain browser regression: DEM decode, real CPU-to-GPU updates, production height lookup, terrain-only shaded surface pixels, independent imagery loading/hiding without camera changes, terrain-aware buildings and picking, failure recovery, replacement, disable, and existing GeoTIFF rendering at DPR 1 and 2.
- Native shader parity: 40 height/normal probes and 68 seam probes across 1/2/3/6-level gaps.
- Existing main render-order, flat-tile, RGB raster, RGB gallery, flat categorical gallery, and tile-basemap browser regressions pass.
- Both Rio gallery regressions pass with deterministic imagery and real database loading. They exercise providers, view controls, visibility, credits, category order, and standalone opacity. A separate permanent-DEM-failure test verifies a settled error state.
- The original 62 gallery pages pass layout checks at 1440, 390, and 320 pixels: 186 cases. The three new PBF variants pass nine additional layout checks at the same widths, plus six populated desktop/mobile checks.

Browser rendering tests use synthetic imagery for deterministic checks; these results do not guarantee availability of live tile providers.

## User validation

Run `make dev APP=gallery OPEN=/src/autk-map/terrain-tiles.html`.

1. Compare `tiles-basemap` with `terrain-tiles`. Select each imagery option, try Overview/Tilt, visibility, opacity, and resize. Rio should remain selected and terrain should persist across provider changes.
2. Compare `tiles-categorical` with `terrain-categorical`. Check the Rio sample's three category colors, order 3/1/2, imagery alignment on tilted terrain, and separation of legend and credits. No panel or opacity slider should appear in either combined example.
3. Check `terrain-layers-niteroi.html?offline` for the existing GeoTIFF source through the unified terrain path, then test normal loading if Overpass is available.
4. Run building-picking/hiding, raster-rgb, and a scalar GeoTIFF example to check previous selection, visibility, and palette behavior.
5. In either Rio terrain example, hide imagery. The shaded terrain must remain visible, and re-enabling imagery must preserve the camera and data.
6. Test a high-DPI display and a narrow viewport. Map content should fill the stage, bar text should fit, and credits should remain readable.

## Limits retained

Composition remains on the main thread but yields between four-row batches; one batch and other frame work can still exceed the requested budget. Overlay resolution trades memory for detail. Other hardware/browser performance still needs measurement before promising a frame rate. EPSG:3395/3857 terrain, finite origin-relative precision, provider coverage, and unreconciled vertical datums retain their documented limits. No globe, vector tiles, offline prefetching, or npm release is added.
