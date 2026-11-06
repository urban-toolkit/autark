# Tile basemaps for `autk-map`

Status: design, not implemented. Branch `feat/tile-basemap`.

## Goal

Draw web map tiles (satellite imagery, street maps) behind or among Autark layers, fetched on demand as the camera moves.

1. **Flat map first.** A tile layer in the normal render path.
2. **Terrain draping second.** The same layer, drawn on terrain.

Out of scope: vector tiles, WMS/WMTS capability parsing, tile prefetching for offline use, non-Mercator tile grids, and reprojecting tiles into CRSs other than the three listed below.

## Decisions

- Sources are a URL template plus a few presets.
- Tiles are cached in memory (LRU) and by the browser HTTP cache.
- The flat map ships before terrain draping.

## Prior art

| | CesiumJS | OpenSpace (globebrowsing) | Used here |
|---|---|---|---|
| Source | `UrlTemplateImageryProvider` with `{z}{x}{y}{s}`, level limits, rectangle, credit | GDAL WMS/TMS XML | URL template and presets |
| Cache | per-layer `Imagery` objects by `[x,y,level]` | LRU by `(provider,level,x,y)` over a fixed GPU texture pool | LRU by `(source,z,x,y)`; `texture.destroy()` on eviction |
| Requests | scheduler: 50 total, 18 per server, retry when a request returns nothing | async jobs; re-requesting a queued tile moves it to the front | concurrency limit, last-requested first, abort tiles that left the view |
| Missing tile | parent imagery | nearest loaded ancestor with a UV offset and scale | same |
| Mercator on a lat/lon grid | GPU reprojection onto a 2×64 grid | not needed (geodetic chunks) | a quad per tile with corners projected into the map CRS; extra rows only for EPSG:4326 at low zoom |
| Layer options | alpha, brightness, contrast, hue, gamma, `colorToAlpha`, `rectangle` | enabled, ZIndex, blend, adjustments | `opacity`, `isSkip` now; adjustments later |

Sources: CesiumJS reference for `ImageryLayer`, `UrlTemplateImageryProvider`, `Globe`, `RequestScheduler`; OpenSpace `modules/globebrowsing/src` (`tileprovider/`, `memoryawaretilecache`, `asynctiledataprovider`, `renderableglobe`). Ideas only; no code is taken from either.

## What the current code gives us

Checked against `main` at `974397f`.

- **Per-frame hooks.** Each frame, every layer gets `prepareRender(camera)` and then `renderPass(camera, passEncoder)` (`map-flat.ts`). Selecting tiles in the first and drawing in the second fits.
- **The raster shader is reusable.** `raster.vert.wgsl`/`raster.frag.wgsl` draw a textured quad with an opacity. The raster pipeline uses premultiplied alpha, depth compare `greater-equal` and no depth write, so a tile layer needs a new vertex layout and bind-group handling, not new shaders.
- **Any camera works for selection.** The main camera is perspective (eye above the map, optionally tilted). `Camera` already exposes `getEye()`, `getViewProjectionMatrix()` and `getWorldRayDirection()`. Unprojecting the four screen corners onto the ground plane gives the visible footprint for both perspective and orthographic cameras.
- **Terrain mode already drapes layers.** `map-terrain.ts` renders every non-3D layer into an offscreen overlay texture using an orthographic `terrainOverlayCamera`, calling `layer.prepareRender(overlayCamera)` and `layer.renderPass(overlayCamera, overlayPass)`. A tile layer that selects from whatever camera it is given needs no terrain-specific code, apart from the viewport size (see Terrain).
- **Layer order.** Layers are sorted by `zIndex`. OSM base types take fixed slots, other layers follow in load order. A basemap must come before `surface`.
- **The map does not know its CRS.** `AutkDb` workspaces default to EPSG:3395 (metres). The map only sees coordinates relative to an origin. The tile layer therefore takes the CRS as an option.
- **On-demand rendering.** Frames are drawn only when something asks. Tile arrival has to call the layer change listener (`requestRender`).
- **An attribution slot exists.** `map-ui.ts` already draws a small "made with autark" credit.

## Impact on existing code

The feature is almost entirely new files. These are the existing places it touches:

| Where | Change | Risk |
|---|---|---|
| `autk-core/src/types-layer.ts`, `utils-layer.ts` | add `'tiles'` to `LayerType`, `LAYER_TYPE_VALUES`, `isLayerType` | additive |
| `autk-map/src/map-style.ts` | exclude `'tiles'` (as `'raster'`) when deriving `MAP_STYLE_KEYS` | **required**: `MapStyleShape` needs every key, so without this every existing custom style would fail validation |
| `autk-map/src/layer-manager.ts` | factory branch for `'tiles'`; fixed slot below `surface` (`zIndex` −1, in load order) | `OSM_BASE_LAYER_ORDER` is public and stays unchanged |
| `autk-map/src/map.ts`, `map-ui.ts` | `loadTiles`; early returns for color-map and thematic calls and the legend, like the existing `'raster'` guards | small |
| `autk-map/src/layer.ts`, `map-terrain.ts` | optional `viewport` argument to `prepareRender` (terrain stage only) | optional parameter |

Not touched: `autk-db`, `autk-plot`, `autk-compute`, existing shaders and pipelines, and `OSM_BASE_LAYER_ORDER`.

## Public API

```ts
// A preset or a custom source.
map.loadTiles('imagery', {
    source: TILE_SOURCES.esriWorldImagery,
    crs: 'EPSG:3395',          // map coordinate system; default 'EPSG:3395'
    opacity: 1,                // optional
    maxCachedTiles: 256,       // optional
});

map.loadTiles('streets', {
    source: {
        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        minZoom: 0,            // default 0
        maxZoom: 19,           // default 19
        tileSize: 256,         // default 256
        subdomains: 'abc',     // for {s}
    },
});

map.updateRenderInfo('imagery', { opacity: 0.6 });
map.removeLayer('imagery');
```

- `crs` is one of `'EPSG:3395' | 'EPSG:3857' | 'EPSG:4326'`.
- Template placeholders: `{z}`, `{x}`, `{y}`, `{s}`, and `{reverseY}` for TMS-style sources. Unknown placeholders are an error at load time.
- `attribution` is required. It is shown on the map, and it is the caller's responsibility to follow the provider's terms.
- Presets (`TILE_SOURCES`): `esriWorldImagery`, `openStreetMap`, `cartoLight`. Anything else, including dated Esri Wayback releases, works through `urlTemplate`.
- The layer type is a new `'tiles'`, placed before `surface` in `zIndex`.

Provider terms matter. OSM's public tile servers prohibit heavy use and bulk download, and Esri imagery requires attribution. Presets will carry a short note, and the docs will say which are meant for development and which for production.

## Geometry

The map's local plane is the workspace CRS minus the shared origin. Tiles are EPSG:3857 (spherical Mercator). The x axis agrees between 3857 and 3395; only y differs, because 3395 uses the WGS84 ellipsoid:

| lat | 3857 y | 3395 y | difference |
|---|---|---|---|
| 6.5° | 725,134 m | 720,300 m | 4,834 m |
| 23° | 2,632,019 m | 2,615,330 m | 16,689 m |
| 40° | 4,865,942 m | 4,838,471 m | 27,471 m |
| 60° | 8,399,738 m | 8,362,699 m | 37,039 m |

The offset is far more than a pixel at any useful zoom, so a tile cannot simply be drawn at its 3857 position. But the offset is carried by the corners: each corner is projected into the map CRS, and the texture is sampled linearly in the tile's own 3857 space. What remains is how far the true map y departs from linear between the corners, and that is small.

Each tile is a quad with `R` rows (each row two vertices):
1. Row `i` has Mercator-3857 y linear in `i` (so texture V is linear in `i`).
2. Its latitude comes from the closed-form inverse of the spherical formula.
3. The vertex position uses the forward formula for the target CRS (3395 ellipsoidal, 3857 identity, 4326 degrees), minus the origin.

Only forward formulas are needed for drawing. An inverse (map coordinates to lon/lat) is needed only for the four footprint corners, where a few fixed-point iterations on 3395 are enough.

**Rows needed.** Measured as the largest gap between the true map y and linear interpolation between row vertices, in pixels of a 512-pixel tile, with a bound of 1/8 pixel (a 256-pixel tile on a high-density screen is a 512-pixel tile on screen):

| CRS | rows by zoom |
|---|---|
| EPSG:3857 | 1 at every zoom |
| EPSG:3395 | 4, 4, 2, 2, 2 for zoom 0 to 4; 1 from zoom 5 |
| EPSG:4326 | 64, 64, 64, 32, 16, 16, 8, 8, 4, 4, 2, 2 for zoom 0 to 11; 1 from zoom 12 |

So for the default CRS the cost of the warp is essentially nothing: one quad per tile, with four rows only at the few lowest zooms. EPSG:4326 needs the rows because latitude in degrees is far from linear in Mercator y at low zoom. A test recomputes this error for every CRS and zoom and fails if the table lets it reach 1/8 pixel, and checks that neighbouring tiles share edge vertices exactly.

## Components

All in `autk-map/src` unless noted. Pure modules come first so they can be tested without WebGPU.

| File | Role | WebGPU |
|---|---|---|
| `tile-index.ts` | `TileIndex {z,x,y}`, `key()`, `parent()`, `ancestor(k)`, lon/lat bounds, 3857 helpers | no |
| `tile-source.ts` | `TileSource` type, template expansion, validation, `TILE_SOURCES` | no |
| `tile-projection.ts` | lon/lat to 3395/3857/4326 forward, inverse for corners | no |
| `tile-geometry.ts` | vertices, texture coordinates and indices of one tile, with the row table above | no |
| `tile-selection.ts` | camera → ground footprint → zoom → tile list, with a tile-count cap | no |
| `tile-cache.ts` | LRU keyed by `(source,z,x,y)`; entry state `loading | ready | missing`; eviction hook | no |
| `tile-loader.ts` | queue with concurrency limit, last-requested-first, dedupe, `AbortController`, `createImageBitmap`, backoff for failed tiles | no |
| `layer-tiles.ts` | `TileLayer extends Layer`: selection and requests in `prepareRender`, draw in `renderPass`, texture upload and eviction | yes |
| `pipeline-tiles.ts` | pipeline with the raster shaders, one vertex buffer rebuilt per frame, one bind group per tile | yes |

Core changes: `'tiles'` in `LayerType` (`autk-core/src/types-layer.ts`), `LAYER_TYPE_VALUES`, `isLayerType`.
Map changes: `loadTiles` in `map.ts`, `LayerManager` slot and factory, `map-ui` entry (no legend; attribution), exports and docs.

### Selection

1. Unproject the four screen corners onto the ground plane with the inverse view-projection matrix. A corner whose ray misses the plane (a tilted camera near the horizon) is clamped to a maximum ground distance.
2. Convert the corners to lon/lat, take the bounding box.
3. Pick the zoom whose tile pixel is close to one screen pixel at the view center: `z = clamp(round(log2(circumference·cos(lat) / (tileSize · metresPerPixel))), minZoom, maxZoom)`, with a `zoomBias` option and `devicePixelRatio` taken into account.
4. List the tiles overlapping the box. If there are more than a cap (default 64), lower `z` until under it.

### Loading and cache

- On a cache miss in `prepareRender`, request the tile. A request for a tile already queued moves it to the front. A tile that is no longer visible is aborted if it has not started.
- Defaults: 8 concurrent requests, 256 cached tiles (about 64 MB at 256×256 RGBA). Both are options.
- Decoded tiles upload to a `rgba8unorm` texture, at most a few per frame to avoid hitches. Evicting an entry calls `texture.destroy()`. Tiles used in the current frame are never evicted.
- A failed tile is marked `missing` and not retried until the source is reloaded, except for network errors, which back off.
- On arrival, the layer notifies its change listener so on-demand rendering draws a frame.
- The browser HTTP cache is used as is: the loader uses `fetch` with default caching, so provider `Cache-Control` headers apply.

### Drawing

1. For each visible tile, use its texture if ready. Otherwise walk up to the nearest ready ancestor and draw the child's area using the ancestor with a UV offset and scale.
2. Write all vertices into one buffer per frame (about 64 tiles × `2(R+1)` vertices), and draw per tile with its own bind group.
3. Sampler: linear, clamp-to-edge. Mipmaps are skipped because the zoom choice keeps texels near pixel size.

## Scale and limits

The first version supports exploration from street level up to a region: the current camera sets its far plane to 500 km (`Camera.resetCamera`), so zooming out past roughly that altitude clips the map. Incremental loading itself has no such limit.

Planet-level rendering (continents or the whole Earth) needs a camera update. It is not a minor change, but it is limited in scope and can be done later without redesigning the tile layer:

- Scale the far plane with altitude. Depth is reversed-Z, so a large far plane should not hurt precision, and existing scenes should be unaffected.
- Avoid float32 error far from the shared origin, either by re-centring the origin near the camera or by computing tile positions camera-relative in float64 on the CPU (tile vertices are built on the CPU each frame).

This is still a flat Web Mercator map: latitudes are limited to ±85.05° and shapes stretch toward the poles. A globe is out of scope.

## Terrain draping (second stage)

- The tile layer is already called with the overlay camera. What is missing is the viewport size: selection needs pixels per world unit, and in the overlay pass that comes from the overlay pixel rectangle, not from the camera's own viewport.
- Proposed change: `Layer.prepareRender(camera, viewport?: { width: number; height: number })`, with `map-terrain.ts` passing the overlay pixel rectangle. Other layers ignore it.
- The overlay texture is at most 4096 px. Where terrain bounds are large, the zoom picked for 4096 px is lower than the zoom a viewer would want up close. Whether to render the overlay at a finer rectangle near the camera is something to measure on real scenes.

## Testing

- **Pure modules**, with Vitest: template expansion and validation; tile index math (parent, ancestor, bounds); projection round trips and the table above; selection with a fake camera, including tilted cases and the tile cap; LRU eviction order and in-use protection; loader priority, dedupe and abort, with a fake `fetch`.
- **Geometry**: a test that bounds the error of the row subdivision at 0.25 pixel per `(CRS, zoom, latitude)`.
- **Layer logic without a GPU**, following `building-layer.test.ts` and `raster-layer-colors.test.ts`: a `TileLayer` with mocked device calls.
- **Visual check** in a browser harness like `render-sizing.webgpu.html`, and a gallery example.

## Delivery

1. Tile math, sources and projection (pure, tested).
2. Loader and cache (pure, tested).
3. `TileLayer`, pipeline, API, UI and attribution (flat map), with a gallery example and README.
4. Terrain draping, as a separate PR.

## Decisions on earlier open questions

- **Texture pool:** none to start. Use `createTexture`/`destroy` and measure before adding one.
- **`devicePixelRatio`:** counted when picking the zoom, so tiles stay crisp on high-density screens. A `zoomBias` option lets an application trade crispness for tile count. Reevaluate with real scenes.

## Open questions

- Where the tile `crs` should eventually come from. A workspace-aware helper in `autk-db` could supply it, but the map should work without one.
- Whether the 4096-px terrain overlay is sharp enough close to the camera. Needs real scenes.
- Whether 512 px tiles from a source should count as one zoom level higher.
- Whether presets belong in `autk-map` or in a separate module that applications import.
