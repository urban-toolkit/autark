# Tile basemaps for `autk-map`

Branch `feat/tile-basemap`, uncommitted. This document describes what exists and what is left. It is kept current: if code and this file disagree, fix the file.

## Status

| Area | State |
|---|---|
| Flat map: `loadTiles`, selection, loading, cache, fallback, drawing, attribution | Implemented and tested without a GPU |
| Hiding a layer stops its work | Implemented and tested |
| Statistics API and the gallery explorer (`tiles-basemap`) | Implemented and run in a browser |
| Browser acceptance of the flat map | Done by the user on 2026-11-07, who reported that it worked fine. No details were recorded, so the softness, tile-cap and idle-frame checks in B were not individually confirmed |
| Terrain draping | **Not implemented.** In terrain mode a tile layer draws nothing (see Known behaviour). Plan in Remaining work, A |
| Texture-upload budget | Deferred until measured |
| Planet-scale views | Out of scope for now (camera far plane is 500 km) |
| Sharing pipeline setup with the raster pipeline | Deferred |
| Automated WebGPU test harness | Not written |

## Goal and scope

Draw web map tiles (satellite imagery, street maps) behind or among Autark layers, fetched on demand as the camera moves. Flat map first, terrain draping second.

Out of scope: vector tiles, WMS/WMTS capability parsing, offline prefetching, non-Mercator tile grids, reprojecting tiles into CRSs other than EPSG:3395, EPSG:3857 and EPSG:4326, and a globe.

## Using it

```ts
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

map.loadCollection('neighborhoods', { collection, type: 'polylines' }); // any data layer sets the map origin
map.loadTiles('imagery', {
    source: TILE_SOURCES.esriWorldImagery,   // a preset, or your own source (below)
    crs: 'EPSG:3395',                        // the CRS of your data; default 'EPSG:3395' (AutkDb's default)
    opacity: 1,                              // optional
    maxCachedTiles: 256,                     // optional
    zoomBias: 0,                             // optional: + sharper, - fewer tiles
    maxTiles: 64,                            // optional: cap on tiles requested and drawn at once
});

map.loadTiles('streets', {
    source: {
        urlTemplate: 'https://{s}.tile.example.org/{z}/{x}/{y}.png',
        attribution: { text: '© Example contributors', url: 'https://example.org/copyright' },
        minZoom: 0, maxZoom: 19, tileSize: 256, subdomains: 'abc',
    },
});

map.updateRenderInfo('imagery', { opacity: 0.6 });   // also { isSkip: true } to hide
map.getTileStats('imagery');                         // read-only statistics
map.renderStats;                                     // CPU time and rate of rendered frames
map.removeLayer('imagery');
```

- **Sources.** A URL template with `{z}`, `{x}`, `{y}` (or `{reverseY}` for TMS-style servers) and optionally `{s}` with `subdomains`. Unknown placeholders and invalid zoom limits, tile sizes or links are errors at load time. A tile always uses the same subdomain, so the browser HTTP cache keeps working. Presets: `esriWorldImagery`, `openStreetMap`, `cartoLight`; anything else, including dated Esri Wayback releases, works through `urlTemplate`.
- **Attribution** is required: a string, a `{ text, url }` entry, or a list of either. It is shown at the bottom right, with a link where a `url` is given. Links must be `http(s)` and are built as DOM text and anchors, never markup. The OpenStreetMap-based presets link to `openstreetmap.org/copyright`. Credits of visible tile layers are shown once each; a hidden or removed layer is no longer credited. Following the provider's terms is the caller's job: OSM's public servers forbid heavy use and bulk download, and Esri imagery needs its attribution to stay visible.
- **Order.** Tile layers sit under every other layer (z-index −1, in load order), so a `surface` layer would cover them. The map origin comes from the first data layer, so tiles are not drawn until one is loaded; loading tiles first is fine.
- **Not exposed through `loadTiles`:** request concurrency (8), ancestor preloading (1 level), retry timing and the footprint reach. They are internal defaults (see Defaults).

## How it works

Each frame the map calls `prepareRender(camera)` and then `renderPass(camera, pass)` on every visible layer. For a `TileLayer`:

1. **`prepareRender`.** Select the tiles the camera sees, tell the store which tiles are wanted, collect for each selected tile its own texture or the nearest loaded ancestor's, and pack them into one set of vertex and index arrays.
2. **`renderPass`.** Upload the packed arrays and draw each tile with its own bind group, using the raster shaders (premultiplied alpha, no depth write).
3. **Arrival.** When a tile loads, the layer asks the map for a frame, so on-demand rendering draws it.

| File (`autk-map/src`) | Role | GPU |
|---|---|---|
| `tile-index.ts` | `TileIndex`, keys, parent and ancestor, bounds, tile ranges (`tileRangeInBounds`, `tileRangeCount`, `tilesInRange`), UV of a tile inside an ancestor | no |
| `tile-source.ts` | source type, validation, URL expansion, `TILE_SOURCES` | no |
| `tile-projection.ts` | lon/lat to EPSG:3395, 3857 and 4326 and back | no |
| `tile-geometry.ts` | vertices, texture coordinates and indices of one tile, with the row table | no |
| `tile-selection.ts` | camera → footprint → zoom → tile list, bounded by a tile cap | no |
| `tile-frame.ts` | packs the visible tiles (ancestor stand-ins with their UV rectangles) into arrays | no |
| `tile-cache.ts` | LRU of tile entries (`loading`, `ready`, `missing`) with eviction reasons | no |
| `tile-loader.ts` | request queue: concurrency, priority, dedupe, abort, timeout, retries | no |
| `tile-store.ts` | cache + loader + policy: parents first, protect-then-admit, queue reordering, retry timers, fallback lookup, counters | no |
| `attribution.ts` | credit forms, validation, merging, and the DOM element that shows them | no |
| `frame-stats.ts` | CPU time and rate of rendered frames | no |
| `utils-math.ts` | `nextPowerOfTwo`, shared with the terrain renderer | no |
| `layer-tiles.ts` | `TileLayer`: ties the pieces to the camera and the GPU; owns statistics | yes |
| `pipeline-tiles.ts` | pipeline: one growing vertex/index buffer rewritten per frame, one bind group per tile texture | yes |

## Behaviour

### Geometry

The map's plane is the workspace CRS minus the shared origin. Tiles are EPSG:3857. The x axis agrees between 3857 and 3395; only y differs, because 3395 uses the WGS84 ellipsoid (4.8 km at 6.5° N, 27 km at 40° N), far more than a pixel, so a tile cannot be drawn at its 3857 position. Each tile is a quad whose corners are projected into the map CRS; the texture is sampled linearly in the tile's own 3857 space, and only the small departure of the true map y from linear between corners remains. A tile has `R` rows (two vertices each), with Mercator y linear in the row so texture V is linear:

| CRS | rows by zoom |
|---|---|
| EPSG:3857 | 1 at every zoom |
| EPSG:3395 | 4, 4, 2, 2, 2 for zoom 0 to 4; 1 from zoom 5 |
| EPSG:4326 | 64, 64, 64, 32, 16, 16, 8, 8, 4, 4, 2, 2 for zoom 0 to 11; 1 from zoom 12 |

The bound is 1/8 pixel of a 512-pixel tile (a 256-pixel tile on a high-density screen). Neighbouring tiles share edge vertices exactly. Vertices are float32 relative to the origin, bounded at 1/32 pixel for origins up to about 100 km away.

### Selection

1. **Footprint.** `Camera.getGroundFootprint(reach)` (in `autk-core`, read through the `GroundCamera` interface) returns the ground the camera can see within `reach` as a convex polygon: the square of half-side `reach` around the point below the eye, cut by the four side planes of the view pyramid. This also covers what the interior of the screen sees near the horizon, where a corner ray points above the ground. Reach is 20 camera heights, at least 1000 map units.
2. The polygon's vertices become a lon/lat box (the box of the vertices is the box of the region in the supported CRSs).
3. **Zoom.** `z = clamp(round(log2(metresAtZoom0 / metresPerScreenPixel)) + zoomBias, minZoom, maxZoom)`, with the screen pixel measured at the view centre. The viewport is in device pixels, so high-density screens are already counted, and `tileSize` of the source is used, so 512-pixel sources pick a lower zoom for the same view.
4. **Bounded count.** Tiles are counted as a rectangle without listing them. While the count exceeds `maxTiles` and `z > minZoom`, lower `z` (`wantedZoom` keeps the zoom before this). If the source's lowest zoom still needs more, keep a window of at most `maxTiles` tiles around the view centre and flag the result `truncated`. Cost does not depend on the footprint size.
5. Options that are not finite numbers (or, for the reach, not positive) fall back to defaults; `zoomBias` is limited to ±30.
6. Tiles come back nearest the view centre first, which is also the request priority.

### Loading and cache

- **Frame protocol.** `beginFrame()` only advances the frame counter. `update(tiles)` first marks what the frame uses (wanted tiles, preloaded ancestors, and the loaded ancestors standing in for tiles still loading) and only then admits new requests, so admitting a tile cannot evict one the frame is about to draw. `endFrame()` trims the cache to its limit, skipping tiles used this frame. If the visible set is larger than the cache, the cache exceeds its limit instead of disposing and reloading visible textures every frame.
- **Priority.** `update` sends the current order for every wanted tile that is not ready, including those already queued, so a tile that became more important moves ahead. Ancestors go first, coarse to fine; the parent of a tile loads before it because one coarse tile covers four finer ones. In-flight requests are never duplicated.
- **Cancellation.** A tile no longer wanted is aborted if not finished. A download that finishes after being cancelled costs no texture (the load checks its abort signal before creating one).
- **Failures.** A permanent failure (4xx other than 408 and 429) is not requested again until the layer is reloaded. A transient one is retried by the loader (2 retries, 500 ms doubling), then by the store itself with no camera interaction: after a cooldown of 5 s, doubling per consecutive failure up to 60 s, if the view still wants the tile. The timer is cancelled when the tile leaves the view, when `update` restarts it, and on destroy.
- **Hiding.** The render loop skips hidden layers, so `TileLayer` reacts to `isSkip` itself: hiding cancels queued, in-flight and waiting requests and the retry timers and keeps ready textures. Showing it requests a frame and `prepareRender` resumes with only what is missing.
- The browser HTTP cache is used as is (`fetch` with default caching). Evicting a ready entry calls `texture.destroy()`. Textures upload as each image arrives, with no per-frame budget.

### Drawing

1. For each selected tile use its texture if ready; otherwise walk up to the nearest ready ancestor and draw the tile's area with the ancestor's texture, using a UV offset and scale.
2. All vertices go into one buffer per frame; each tile is a separate draw with its own bind group.
3. Sampler: linear, clamp-to-edge. No mipmaps: zoom rounding keeps texel size within about 0.7 to 1.4 screen pixels, which can look soft or shimmer while moving. This has not been judged on screen.

### Statistics

Read-only, never trigger rendering, safe to poll on a timer.

- `map.getTileStats(id)` returns `TileLayerStats`, or `null` for an unknown id: `visible`, `zoom`, `wantedZoom` (larger than `zoom` when the tile cap made tiles coarser), `selectedTiles`, `truncated`, `readyTiles` / `fallbackTiles` / `missingTiles` (own image, ancestor image, nothing; they sum to `selectedTiles`), `activeRequests` / `queuedRequests` / `waitingRetries`, `cachedTextures` / `cacheLimit`, `textureBytes`, cumulative `requests` / `cacheReuses` / `evictions`, and `idle`.
- `map.renderStats` returns `frameCount`, `lastFrameCpuMs`, `averageFrameCpuMs` and `framesPerSecond`.
- `requests` counts load attempts when they start, retries included; an answer from the browser cache still counts, so it is not a count of network transfers. `cacheReuses` counts a tile that becomes wanted again while its texture is held (after the view moved away and back, or after hide and show), once per return, never per frame. `evictions` counts textures destroyed because the cache needed room, not teardown. `textureBytes` is width × height × 4 of the held tiles; it excludes driver overhead and every other resource.
- CPU time is measured around preparing and submitting a frame, not the GPU. `framesPerSecond` uses the frames of the last second and is 0 when fewer than two arrived, so it never goes stale; `frameCount` stops increasing when the map is idle.
- After a layer is destroyed its statistics are zero, and `getTileStats` returns `null` once it is removed.

## Defaults

| Setting | Value | Where |
|---|---|---|
| Concurrent requests | 8 | loader |
| Loader retries | 2, delay 500 ms doubling | loader |
| Request timeout | 15 s | loader |
| Store retry cooldown | 5 s doubling to 60 s | store |
| Cached tiles | 256 (about 64 MB at 256×256 RGBA) | `maxCachedTiles` |
| Tiles per selection | 64 | `maxTiles` |
| Ancestors preloaded | 1 level | store |
| Footprint reach | 20 camera heights, at least 1000 map units | selection |
| Texture format | `rgba8unorm` | pipeline |

## Changes to existing code

| File | Change |
|---|---|
| `autk-core/src/types-layer.ts`, `utils-layer.ts` | `'tiles'` in `LayerType`, `LAYER_TYPE_VALUES`, `isLayerType` |
| `autk-core/src/camera.ts` | new `getGroundPoint` and `getGroundFootprint`; **changed:** `screenCoordToWorldDir` now uses the same orthonormal basis as `mat4.lookAt`, so picking and zoom-to-cursor match what is rendered when the up vector is not perpendicular to the view (identical for ordinary cameras) |
| `autk-db/src/use-cases/load-osm-layer/osm-processing-config.ts` | `'tiles'` excluded from `OsmLayerType` and `getOsmProcessingConfig` |
| `autk-map/src/map-style.ts` | `'tiles'` excluded (like `'raster'`) when deriving style keys, so existing custom styles still validate |
| `autk-map/src/layer-manager.ts` | `addTileLayer` (a separate method, not a factory branch), slot −1, `visibleAttribution()`, one helper for the duplicate-id check |
| `autk-map/src/map.ts` | `loadTiles`, `getTileStats`, `renderStats`, frame timing around each rendered frame, guards for `'tiles'` in thematic, colormap and `loadCollection` calls, attribution refresh on load, remove and `isSkip` |
| `autk-map/src/map-ui.ts` | `setAttribution`, no palette or pick buttons for tile rows, one `makeButtonSpacer` shared with raster rows |
| `autk-map/src/map-terrain.ts` | visible-bounds estimate now calls `Camera.getGroundPoint` (same behaviour) |
| `autk-map/src/renderer-terrain.ts` | `nextPowerOfTwo` imported from `utils-math.ts` (same behaviour) |
| `autk-map/src/api.ts`, `index.ts` | `LoadTilesParams`, exports (`TILE_SOURCES`, tile and statistics types) |
| `gallery/` | `tiles-basemap` example and index entry |
| `autk-map/README.md` | tile section and API summary |

Not touched: `autk-plot`, `autk-compute`, existing shaders and pipelines, `OSM_BASE_LAYER_ORDER`.

## Tests

All run without a GPU; the device is a recording fake.

- `tile-index`, `tile-projection`, `tile-source`: grid math, round trips, validation, URL building, preset validity and links.
- `tile-geometry`: PROJ ground truth for corners, shared edges, row-table error bound with interior sampling, float32 placement.
- `tile-selection`: zoom from the screen pixel, tile cap (including at the minimum zoom and for huge footprints), truncation, option validation, and coverage of every visible ground point within reach near the horizon at three yaws.
- `tile-frame`, `tile-cache`, `tile-loader`, `tile-store`: fallback UVs, eviction and protection in the layer's exact call order, priority and reordering, retries with fake timers, cancellation, counters.
- `tile-layer`: the layer against the fake device (requests, fallback, stats, hide/show lifecycle with loader backoff and store cooldown, cache trimming), `LayerManager` slot and attribution, and the behaviour in terrain mode.
- `attribution`, `frame-stats`, and `render statistics` in `on-demand-rendering`.
- `autk-core/test/camera-ground-point`: rays checked against rays unprojected from the inverse rendering matrix for several cameras, ground points, and the footprint.

Not covered: anything on a real GPU (`pipeline-tiles.ts` only runs against the fake device), real network behaviour, the visual result, the gallery example, and the thin `getTileStats` wrapper in `map.ts`.

## Known behaviour

- **Terrain mode.** A tile layer draws nothing and requests nothing: the terrain path's overlay camera is `new Camera()` plus `setOrthographicBounds` and is never resized, so its viewport is 0 and selection returns nothing (pinned by a test). Even with a viewport, the overlay's depth range would clip the layer (see Remaining work, A).
- **Far plane.** The camera's far plane is 500 km, so zooming out past about that height clips the map. Likely the blank map seen when zooming far out.
- **Tile cap on 2× screens.** A 2× screen asks for one zoom more, which can exceed the default cap of 64 tiles; the cap then lowers the zoom and tiles look softer. The statistics show `wantedZoom` above `zoom` when this happens.
- **Reach.** A nearly level camera gets imagery only out to 20 camera heights.

## Remaining work

### A. Terrain draping

Goal: the same layer, drawn onto terrain. The terrain path already draws every non-3D layer into an offscreen overlay texture with an orthographic camera and drapes that texture over the mesh, so tile drawing itself should work; what is missing is the camera, the depth range and tests.

1. **Orthographic support in `Camera`.** `setOrthographicBounds` should record that the camera is orthographic and its bounds. Then `resize()` and `update()` must not rebuild perspective matrices (today `resize()` calls `update()`, which would overwrite the orthographic projection), and `getGroundFootprint`, `getGroundPoint` and `getWorldRayDirection` must follow the bounds: the footprint is the bounds rectangle, ground points interpolate linearly across it, rays are parallel. This also corrects the ray helpers for any orthographic caller.
2. **Viewport.** `map-terrain.ts` resizes the overlay camera to the overlay pixel rectangle (at most 4096 px) before `prepareRender`, so selection sees pixels per world unit. This replaces the earlier idea of a `viewport` argument on `Layer.prepareRender`, which would touch every layer.
3. **Depth.** Orthographic depth is `0.01 · z` (`orthoZO(…, 0, -100)`), so the layer's slot `z = -1` maps to −0.01 and is clipped. Move the near plane so negative slots are inside the range (for example `near = 10`, which keeps relative order and keeps 100 world units), and check the terrain path and the raster layers still draw as before.
4. **Selection bounds.** The overlay bounds are the visible terrain bounds, so reach does not apply; make sure the ortho footprint ignores it.
5. **Tests.** Camera orthographic tests against rays unprojected from the inverse matrix (as for the perspective camera); `TileLayer` with the real overlay camera setup; the terrain path with a tile layer using the existing terrain mocks in `on-demand-rendering.test.ts`; update the terrain-mode test above to the new behaviour.
6. **Example.** Draw Niterói imagery in `terrain-layers-niteroi`. That example loads OSM `surface`, which is drawn above the tiles in the overlay and would hide them, so the surface layer has to go or be made translucent.
7. **Measure.** Overlay sharpness near the camera when the terrain is large (the zoom is chosen for at most 4096 px); consider a finer rectangle near the camera only if it looks soft.

### B. Browser acceptance (done once)

The user ran this on 2026-11-07 and reported that it worked fine, without details. Repeat it after any change to selection, loading or drawing. Open the gallery's `tiles-basemap` and follow Neighborhood → Overview → Neighborhood → Tilted → hide/show tiles. Check: progressive loading with ancestor fallback; the reuse counter rising on the way back; alignment and coverage when tilted; the request counter stopping while hidden; opacity; attribution links; and the frame count stopping when the map is idle. Judge the softness noted under Drawing. Report what looks wrong.

### C. Decisions waiting for real use

- Whether the default `maxTiles` (64) should rise for 2× screens.
- Whether to add mipmaps or round the zoom up, if tiles look soft.
- Where the tile `crs` should come from: an `autk-db` helper could supply it, but the map works without one.
- Whether presets belong in `autk-map` or a separate module.

### D. Later, when needed

- **Upload budget.** Only if measurements show frame hitches while many tiles arrive: a bounded queue of decoded images drained per frame by count or bytes, extra on-demand frames while it is non-empty, and clear ownership so each image is closed and each texture destroyed exactly once when requests are cancelled, layers removed or queued results made obsolete.
- **Planet-scale views.** Scale the far plane with altitude (reversed-Z keeps precision) and avoid float32 error far from the origin, by re-centring the origin near the camera or building tile positions camera-relative in float64 (tile vertices are built on the CPU each frame). Still a flat Web Mercator map limited to ±85.05° latitude.
- **Pipeline setup sharing.** `pipeline-tiles.ts` repeats about 50 lines of sampler, bind-group layout and render-state setup from `PipelineTriangleRaster`. Share it once the raster path has a GPU test.
- **WebGPU test harness**, like `render-sizing.webgpu.html`, for the tile pipeline.
- **Layer adjustments** (brightness, contrast, and so on) and a per-host request limit.

## Decisions made

- Sources are a URL template plus presets; tiles are cached in memory (LRU) and by the browser HTTP cache.
- No texture pool: use `createTexture` and `destroy`, and measure before adding one.
- Device pixels set the zoom, with `zoomBias` to trade sharpness for tile count.
- A tile cap bounds both memory and requests; it never silently exceeds its budget.
- Reprojection is on the CPU: one quad per tile with projected corners, extra rows only where the table says.

## Prior art

CesiumJS (`UrlTemplateImageryProvider`, per-layer imagery cache, request scheduler, parent imagery, GPU Web Mercator reprojection) and OpenSpace globebrowsing (LRU tile cache over a GPU texture pool, last-requested-first queue, ancestor fallback with a UV transform). Ideas only; no code is taken from either.
