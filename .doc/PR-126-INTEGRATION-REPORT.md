# PR #126 integration report

Date: November 12, 2026. Local branch: `fix/pr-126-integration`.

This integration preserves the original PR head `dd03de9` and combines it with main `588a2fe`, including the compatibility fixes and gallery changes described below.

## Final behavior

Tile basemaps are rendered directly by `autk-map`. They are not imported into `autk-db`. XYZ image addresses use the Web Mercator grid; the tile mesh is reprojected into the coordinate system selected by `loadTiles({ crs })`.

Omitting `crs` uses the shared `DEFAULT_WORKSPACE_COORDINATE_FORMAT` from `autk-core`, also re-exported and used by `autk-db`: EPSG:3395. For a custom workspace, pass its output CRS explicitly. This parameter describes the workspace's coordinates, not the original CRS of a file before database reprojection. There is no new dependency from the map package to the database package.

Standalone creation now accepts a WGS84 `center: { latitude, longitude }` and an initial `zoom`. The center is projected into the output CRS without creating another layer. Zoom uses source tile size and CSS pixels; DPR independently controls requested imagery resolution. Existing scene origins remain unchanged. Zoom defaults to 12 when a center is supplied.

## Changes from the reviewed PR

- Resolved conflicts in the map API, layer menu, and gallery index while preserving main's RGB guards and shared gallery layout.
- Removed the tile layer's call to the deleted `Pipeline.updateZIndex` method. Existing raster shaders and the base pipeline remain unchanged from main. Tile geometry uses physical ground height zero, CPU drawing order, and main's 2D blending/depth convention. No artificial height or depth bias was introduced.
- Kept main's physical building/terrain depth, picking and compositing paths, opt-in camera fitting, standalone raster bounds, and automatic far-plane expansion.
- Retained the PR's ground-camera helpers and verified ray-basis correction against the rendering matrix and existing camera/picking regressions.
- Made tile resolution use actual renderer backing-store dimensions without changing camera or pointer coordinates. Added DPR and independent tile-cap regressions.
- Rejected unsupported CRS values, invalid cache/tile limits, nonfinite zoom bias, invalid reach, and invalid initial opacity before allocating GPU resources.
- Made tile initialization transactional: failed setup destroys partial resources and removes the new registration, permitting a retry with the same ID. Failed texture upload also releases its texture.
- Preserved RGB/scalar palette, legend, range-validation, and no-data behavior. Tile imagery has no scalar palette or picking control.
- Updated `tiles-basemap` to use the shared gallery shell, module/category text, actual loading status, 56 px bars, statistics side panel, and map-overlay opacity control.
- Added a standalone tile-only example with geographic center/zoom, Esri/OSM/local sources (local last), and only Overview/Tilt buttons. A separate combined example loads numeric-category roads through `autk-db` and shares the original category helper. Its statistics and imagery-opacity controls are removed.
- Updated the design reference and API documentation to describe the integrated renderer and current camera behavior.

## Validation evidence

The final complete unit suite passed all 930 tests across 70 files, including the existing main and PR suites and the added integration regressions. The run used a writable temporary npm cache. Focused DPR, validation, rollback, allocation, and renderer tests also passed.

Real WebGPU tests use native image decode/upload, production pipelines, synthetic local data, and pixel readback. The tile test covers all three supported CRSs, omitted-CRS default behavior, orientation/colors, parent UV cropping, transparent pixels, opacity, adjacent edge coverage through a zoom change, vector drawing order, physical building composition, metadata changes without geometry displacement, hide/show reuse, idle frames, and layer removal.

The existing render-order regression passed its camera, picking, building, terrain, and far-plane checks. Existing RGB raster pixels, scalar/RGB transitions, legends, no-data, rejection handling, gallery controls, and loading-status regressions passed. The new tile gallery smoke test passed initialization, standalone loading without GeoJSON, the source list, including both OpenStreetMap themes and local tiles last, Overview/Tilt, visibility, statistics and opacity. A separate real database-backed browser test verifies the combined road layer and numeric legend order 3, 1, 2, without statistics or imagery-opacity controls.

All 60 gallery pages passed layout and bar-text checks at 1440, 390, and 320 px widths: 180 layout cases. The populated tile gallery was also checked at those widths, with no horizontal overflow, no map-stage gaps, and fitting header/footer text.

Repository lint, strict checks for the new browser tests, workspace builds/type checks, package artifact validation, and packing all six packages passed. An initial database build encountered a transient output-directory cleanup race; the complete retry passed without source/configuration changes.

Isolated package-consumer installation, strict consumer type checking, Node imports, and browser bundling all passed. An initial registry certificate-trust failure was resolved by supplying the operating system's CA bundle through `NODE_EXTRA_CA_CERTS` for that command. TLS verification remained enabled; no project registry or certificate configuration was changed.

## Suggested user validation

Start with:

```sh
make dev APP=gallery OPEN=/src/autk-map/tiles-basemap.html
```

1. Local test tiles: cycle Overview → Tilt. Check progressive replacement, cache reuse, visibility, opacity, resize, credits, and an idle frame count.
2. Select Esri World Imagery or another live provider. In `tiles-categorical`, road colors should align with the imagery; a provider/network failure should not be confused with a local pipeline failure.
3. Check a 2x display or device emulation: imagery resolution should increase when the tile cap allows it.
4. Run `building-picking` and `building-hiding` for selection, highlighting, hide/reveal, and restore.
5. Run `raster-rgb`, `geotiff-vis`, `geotiff-vis-geojson`, `heatmap-vis`, and `heatmap-vis-geojson` for origin/extent, scalar/RGB state, and alpha behavior.
6. Run `camera-animation-vis`, `terrain-layers-niteroi`, `layer-opacity`, both multi-map/workspace examples, and `render-sizing` for existing camera, terrain, visibility, viewport, and picking behavior.
7. Run a click chart and a brush chart for shared layout and linked selection.

These are recommended human checks, not a claim that every live-service gallery example was manually validated during this integration.

## Remaining scope

Terrain draping, arbitrary map CRSs beyond the three supported values, vector tiles, offline prefetching, and globe rendering remain unsupported. Explicit center/zoom supports tile-only scenes. The cache is soft and estimated texture memory excludes driver overhead. Geometry/upload performance under sustained navigation remains a profiling target. No speculative global scheduler or terrain feature was added.

## Reproduce checks

```sh
npm_config_cache=/private/tmp/autark-pr126-npm-cache npm test -- --maxWorkers=2 --testTimeout=60000
npm run lint
make typecheck
npm run validate:packages
npm run pack:packages
npm run test:packages
node autk-compute/test/run-webgpu.mjs /autk-map/test/tiles.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/tiles-basemap.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/tiles-categorical.webgpu.ts
node autk-compute/test/run-webgpu.mjs /autk-map/test/render-order.webgpu.ts
node autk-compute/test/run-webgpu.mjs /autk-map/test/raster-rgb.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/raster-rgb.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/example-status.webgpu.ts
```

## OSM imagery themes

Both tile examples now offer OpenStreetMap (Light), the initial selection, and OpenStreetMap (Dark) alongside Esri imagery, standard OSM, and local test tiles. The OSM options use the standard OSM raster endpoint with client-side color treatments; labels and roads remain baked into the images. Theme processing happens once before texture upload and preserves pixel alpha. Texture cache identities include the theme. CARTO was removed from the library presets and documentation. No Esri gray canvas service or external style service is used.

Theme validation passed: 125 focused unit tests; map and gallery builds; lint; real-browser bitmap conversion cases; and both gallery browser regressions covering OSM theme switching, attribution, visibility, and preservation of the categorical overlay and legend. Browser gallery tests substitute deterministic image fixtures for remote OSM requests.

## Credit layout and shared utilities

Autark and visible imagery providers share a styled bottom-left credit strip. The Autark credit links to https://www.autarkjs.org. Desktop and mobile browser checks verify wrapping, safe links, matching link styles, removal of hidden-layer credits, and separation from the thematic legend. `nextPowerOfTwo` is exported by `autk-core`; map callers use the package export, and no map-local math utility module remains. The standalone tile canvas fills its shared panel row without a bottom gap.
