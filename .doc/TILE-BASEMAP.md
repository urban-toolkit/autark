# Tile basemaps for `autk-map`

Draw web map tiles (satellite imagery, street maps) behind Autark layers, fetched on demand as the camera moves, on a flat map or draped over terrain. Terrain from tiles builds on this: [TILE-TERRAIN.md](TILE-TERRAIN.md).

Out of scope: vector tiles, WMS/WMTS parsing, offline prefetching, non-Mercator grids, CRSs other than EPSG:3395, 3857 and 4326, and a globe.

## Using it

```ts
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

map.loadCollection('neighborhoods', { collection, type: 'polylines' }); // any data layer sets the map origin
map.loadTiles('imagery', {
    source: TILE_SOURCES.esriWorldImagery,   // a preset, or your own source (below)
    crs: 'EPSG:3395',                        // the CRS of your data; default 'EPSG:3395'
    opacity: 1,                              // optional
    maxCachedTiles: 256,                     // optional
    zoomBias: 0,                             // optional: + sharper, - fewer tiles
    maxTiles: 64,                            // optional: cap on tiles requested and drawn at once
});
map.loadTiles('streets', { source: {
    urlTemplate: 'https://{s}.tile.example.org/{z}/{x}/{y}.png',
    attribution: { text: '© Example contributors', url: 'https://example.org/copyright' },
    minZoom: 0, maxZoom: 19, tileSize: 256, subdomains: 'abc',
} });
map.updateRenderInfo('imagery', { opacity: 0.6 });   // also { isSkip: true } to hide
map.getTileStats('imagery');                         // read-only statistics
map.renderStats;                                     // CPU time and rate of rendered frames
map.removeLayer('imagery');
```

- **Sources.** A URL template with `{z}`, `{x}`, `{y}` (or `{reverseY}` for TMS) and optionally `{s}` with `subdomains`; invalid templates, zoom limits, tile sizes or links are errors at load time. Presets: `esriWorldImagery`, `openStreetMap`, `cartoLight`.
- **Attribution** is required: a string, a `{ text, url }` entry, or a list. It shows at the bottom right as DOM text and anchors (`http(s)` links only), once per visible layer. Following provider terms is the caller's job: OSM's public servers forbid heavy use, and Esri needs its credit visible.
- **Order.** Tile layers sit under every other layer (z-index −1), so a `surface` layer would cover them. Tiles are not drawn until a data layer sets the origin.
- Request concurrency (8), ancestor preloading (1 level), retry timing and the footprint reach are internal defaults.

## How it works

Each frame the map calls `prepareRender(camera)` and `renderPass(camera, pass)` on every visible layer. A `TileLayer` selects the tiles the camera sees, tells the store which are wanted, takes each tile's own texture or its nearest loaded ancestor's, packs them into one vertex and index set, and draws each tile with its own bind group (premultiplied alpha, no depth write). A tile arrival asks for a frame, so on-demand rendering draws it.

All files are in `autk-map/src`; only the last row uses the GPU:

| File | Role |
|---|---|
| `tile-index`, `tile-source`, `tile-projection` | tile addressing and ranges, sources and URLs, lon/lat to EPSG:3395, 3857, 4326 |
| `tile-geometry`, `tile-selection`, `tile-frame` | one tile's vertices, camera → footprint → zoom → tile list, packing with ancestor stand-ins |
| `tile-cache`, `tile-loader`, `tile-store` | LRU cache, request queue (concurrency, priority, dedupe, abort, retries), policy and counters |
| `attribution`, `frame-stats`, `utils-math` | credits and their DOM element, frame timing, shared helpers |
| `layer-tiles`, `pipeline-tiles` | the layer and its pipeline |

## Behaviour

### Geometry

Tiles are EPSG:3857; the map plane is the workspace CRS minus the shared origin. The x axis agrees between 3857 and 3395, but y differs (up to 27 km at 40° N), so each tile is a quad with corners projected into the map CRS and `R` rows so the texture stays linear in Mercator y:

| CRS | rows by zoom |
|---|---|
| EPSG:3857 | 1 at every zoom |
| EPSG:3395 | 4, 4, 2, 2, 2 for zoom 0 to 4; 1 from zoom 5 |
| EPSG:4326 | 64, 64, 64, 32, 16, 16, 8, 8, 4, 4, 2, 2 for zoom 0 to 11; 1 from zoom 12 |

The error bound is 1/8 pixel of a 512-pixel tile. Neighbouring tiles share edge vertices exactly. Float32 vertices relative to the origin stay within 1/32 pixel up to about 100 km from it.

### Selection

1. **Footprint.** `Camera.getGroundFootprint(reach)` returns the visible ground within `reach` (20 camera heights, at least 1000 map units) as a convex polygon, including the interior near the horizon. Its vertices give a lon/lat box.
2. **Zoom.** `z = clamp(round(log2(metresAtZoom0 / metresPerScreenPixel)) + zoomBias, minZoom, maxZoom)`, measured at the view centre in device pixels and using the source's `tileSize`.
3. **Cap.** Tiles are counted as a rectangle. While the count exceeds `maxTiles`, `z` is lowered (`wantedZoom` keeps the zoom before this); if the lowest zoom still needs more, a window of `maxTiles` around the view centre is kept and the result is `truncated`.
4. Tiles come back nearest the view centre first, which is also the request priority.

### Loading and cache

- **Frame protocol.** `update(tiles)` marks what the frame uses (wanted tiles, preloaded ancestors, stand-in ancestors) before admitting new requests, and `endFrame()` trims the cache skipping tiles in use, so a visible tile is never evicted and reloaded.
- **Priority.** Ancestors load first, coarse to fine; a tile that becomes more important moves ahead; in-flight requests are never duplicated. A tile no longer wanted is aborted.
- **Failures.** A permanent failure (4xx other than 408 and 429) is not retried until reload. A transient one is retried twice by the loader (500 ms, doubling), then by the store after 5 s doubling to 60 s while the view still wants the tile.
- **Hiding** a layer cancels its requests and keeps ready textures; showing it resumes with only what is missing.
- The browser HTTP cache is used as is. Textures upload as images arrive, with no per-frame budget.

### Drawing

A tile uses its texture if ready, else the nearest ready ancestor's with a UV offset and scale. The sampler is linear, clamp-to-edge, with no mipmaps: zoom rounding keeps texels within about 0.7 to 1.4 screen pixels, which can look soft or shimmer while moving.

### Statistics

Read-only, safe to poll. `getTileStats(id)` returns `visible`, `zoom`, `wantedZoom`, `selectedTiles`, `truncated`, `readyTiles` / `fallbackTiles` / `missingTiles`, request counts, cache counts and bytes, cumulative `requests` / `cacheReuses` / `evictions`, and `idle` (`null` for an unknown id). `renderStats` returns `frameCount`, `lastFrameCpuMs`, `averageFrameCpuMs` and `framesPerSecond`. `requests` counts load attempts, retries included, so it is not a count of network transfers. Frame time is CPU time around preparing and submitting a frame, not GPU time.

## Terrain mode

Tile layers draw into the terrain overlay like every other non-3D layer, through an orthographic camera over the visible terrain bounds (`Camera.setOrthographicBounds`; the ground and ray helpers follow the bounds, so reach does not apply). The overlay is at most 4096 px, so imagery can look slightly soft near the camera over a large terrain: at worst an overlay texel covers about 1.8 screen pixels at the bottom of a steeply tilted view. Draping is checked in a browser on GeoTIFF terrain and on streamed terrain.

## Defaults

| Setting | Value |
|---|---|
| Concurrent requests / timeout | 8 / 15 s |
| Loader retries | 2, 500 ms doubling |
| Store retry cooldown | 5 s doubling to 60 s |
| Cached tiles | 256 (about 64 MB at 256×256 RGBA) |
| Tiles per selection | 64 |
| Ancestors preloaded | 1 level |
| Footprint reach | 20 camera heights, at least 1000 map units |
| Texture format | `rgba8unorm` |

## Known behaviour

- **Far plane.** The camera's far plane is 500 km, so zooming out past about that height clips the map.
- **Tile cap on 2× screens.** A 2× screen asks for one zoom more, which can exceed the cap of 64 tiles; the cap then lowers the zoom and tiles look softer (`wantedZoom` above `zoom`).
- **Reach.** A nearly level camera gets imagery only out to 20 camera heights.

## Tests

All without a GPU, against a recording fake device: grid math, projection and geometry (against PROJ ground truth), selection and the tile cap, packing, cache, loader and store (priority, retries with fake timers, cancellation), the layer (requests, fallback, statistics, hide and show, terrain mode), attribution and frame statistics, and `autk-core`'s ground-point and footprint helpers. Not covered: a real GPU, real network behaviour, the visual result. Browser acceptance (flat map and terrain) was done by hand on 2026-11-07, without recorded details. Repeat it after changes to selection, loading or drawing with the gallery's `tiles-basemap`: Neighborhood → Overview → Neighborhood → Tilted → hide and show.

## Open

- Whether the default `maxTiles` should rise for 2× screens, and whether to add mipmaps or round the zoom up if tiles look soft.
- Where the tile `crs` should come from (an `autk-db` helper could supply it), and whether presets belong in a separate module.
- **Upload budget**, only if measurements show hitches while many tiles arrive: a bounded queue of decoded images drained per frame.
- **Planet-scale views:** scale the far plane with altitude and avoid float32 error far from the origin.
- Sharing pipeline setup with `PipelineTriangleRaster`, and a `*.webgpu.html` test for the tile pipeline.

## Decisions made

URL-template sources plus presets; an in-memory LRU plus the browser HTTP cache; no texture pool (measure first); device pixels set the zoom, with `zoomBias`; a tile cap bounds memory and requests and is never exceeded silently; reprojection on the CPU with extra rows only where the table says.

## Prior art

CesiumJS (imagery providers, per-layer cache, request scheduler, parent imagery) and OpenSpace globebrowsing (LRU tile cache over a texture pool, ancestor fallback with a UV transform). Ideas only; no code is taken.
