<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk-map</h1>

  <br>
  <p><strong>WebGPU-based 2D/3D vector map visualization library.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## @urban-toolkit/autk-map

`@urban-toolkit/autk-map` is a WebGPU-based vector map visualization library for rendering urban layers. It can display GeoJSON-derived points, polylines, polygons, buildings, parks, water, roads, and GeoTIFF-derived raster data, with support for thematic color mapping, picking, highlighting, layer visibility, and map UI controls.

### Basic usage

```ts
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const map = new AutkMap(canvas);

await map.init();

map.loadCollection('buildings', {
  collection: buildingsGeojson,
  type: 'buildings',
  loadConfig: { buildingsZeroHeight: true },
  property: 'properties.height',
});

map.updateRenderInfo('buildings', {
  renderInfo: { isColorMap: true, isPick: true },
});

map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
  console.log(layerId, selection);
});

map.draw();
```

### On-demand rendering

`map.draw()` now renders once and then only when something changes. Camera navigation and
`CameraMotion` animations, resize, layer loads/updates/removals, style setters, highlighting,
picking and terrain updates request frames automatically. Changes made before the next frame
are grouped into one redraw. GPU readbacks can request a follow-up frame, for example to show
a picking highlight or updated terrain bounds. An idle map does not keep scheduling frames.

```ts
map.draw();                         // on demand (default)
map.draw({ onDemand: true });       // explicit on demand
map.draw(30);                       // continuous, 30 fps (existing behavior)
map.draw({ fps: 30 });              // continuous, 30 fps
map.draw({ onDemand: false });      // continuous, 60 fps
```

Calling `draw()` again switches modes. `requestRender()` schedules one on-demand frame and
coalesces repeated requests; it has no effect before rendering starts, in continuous mode,
or after `destroy()`.

Existing subsystem getters remain available; inputs are not defensively copied. Direct
writes to objects or buffers are **not observed**. If you write GPU resources yourself,
call `map.requestRender()` afterward. Direct edits to cached render state or CPU geometry
also require `layer.makeLayerRenderInfoDirty()` or `layer.makeLayerDataDirty()` respectively;
these dirty marks already request a frame for attached layers. `requestRender()` alone does
not upload CPU buffers or refresh cached uniforms. Prefer the update APIs, which handle both
resource updates and redraws.

**Migration:** `draw()` no longer runs continuously. Applications doing unobserved updates
every frame should request rendering explicitly or use `draw({ onDemand: false })`.
Numeric `draw(fps)` calls retain their continuous behavior. No encapsulation migration is
required for existing camera and style methods.

### Generic layer defaults and polygon borders

General-purpose presets use `surface` as the base for muted generic colors: `polygons` are approximately 10% darker, `polylines` 20% darker, and `points` 30% darker; surface, parks, water, roads and buildings keep their existing palettes. Point sprites default to a **radius of 64 local planar units**. Generic polylines default to a **full width of 12 local planar units**, while roads retain their highway-specific widths unless explicitly overridden. These values are centralized in `src/types-layers.ts` and exported as `DEFAULT_POINT_SIZE` and `DEFAULT_LINE_WIDTH`; explicit layer values take precedence.

Sizes belong to each layer's render state, not its geometry. Set or update them after loading:

```ts
map.loadCollection('points', { collection: pointsGeojson, type: 'points' });
map.updateRenderInfo('points', {
  renderInfo: { pointSize: 120 },
});

map.loadCollection('lines', { collection: linesGeojson, type: 'polylines' });
map.updateRenderInfo('lines', {
  renderInfo: { polylinesWidth: 12 },
});
```

Point and line sizes are coordinate-space values, **not screen pixels**. Only camera transforms determine their apparent size; points no longer receive an additional zoom multiplier. Values must be finite positive float32 numbers. Invalid values log a warning and preserve the previous setting; other valid fields in the same patch are still applied.

Polyline/road layers loaded from collections use width-independent centerlines expanded by the vertex shader, with butt caps and miter joins limited to four half-widths (bevel fallback at acute turns). Updating width does not buffer polygons, retriangulate, or reupload geometry. Visual and picking passes share the same expansion. Theme values, feature IDs, highlight and skip state are preserved. Terrain mode uses the same layers in its overlay pass. Prebuilt triangle meshes loaded via `loadMesh()` retain their geometry and cannot be resized by `polylinesWidth`.

**Migration from 4.0.0:** replace `loadConfig.polylinesWidth` with `updateRenderInfo(id, { renderInfo: { polylinesWidth } })`. The global `TriangulatorPoints.setPointSize()` / `getPointSize()` APIs and `LayerData.pointSize` have been removed; use `LayerRenderInfo.pointSize`. The extra point zoom multiplier has also been removed, so point appearance changes at some zoom levels. These are breaking API/rendering changes.

Generic polygon outlines are visible by default. Toggle their separate border pass at runtime without reloading the layer or hiding its fill:

```ts
map.updateRenderInfo('table_osm_playgrounds_polygons', { showBorders: false });
// Later, show the same borders again:
map.updateRenderInfo('table_osm_playgrounds_polygons', { showBorders: true });
```

The nested form `{ renderInfo: { showBorders: false } }` also works. Border geometry remains synchronized while hidden; the setting does not generate borders for layers that have none. The gallery's typed OSM tag-set polygons start with `showBorders: false`.

### Minimalist map posters

The `poster` preset uses white land, graphite roads and pale-blue water/background:

```ts
map.style.setPredefinedStyle('poster');
```

Gallery example: `gallery/src/autk-map/map-poster.html`. It automatically loads a WGS84
crop covering Rio de Janeiro, Guanabara Bay and Niterói. The crop remains editable, with
title/subtitle controls, road widths, interactive framing and a 2400-pixel-wide PNG export.
The exporter temporarily redraws the WebGPU map at export resolution rather than scaling the
on-screen canvas. Every `autk-map`
canvas includes a bottom-left credit strip, even with `showUi: false`. The “Made with Autark”
link opens `https://www.autarkjs.org` alongside credits for visible tile imagery. All credit
links share the same typography and styling, and wrap on narrow maps. Legends stay at the
bottom right, moving above the credits when needed to avoid overlap. The strip follows
canvas resizing and is removed by `destroy()`; only the strip intercepts pointer events.
The poster PNG retains its separately drawn watermark.
The poster omits the OpenStreetMap credit text; published uses still require
appropriate OpenStreetMap attribution. Data loading requires network access to Overpass;
larger crops may take longer.

### Tile basemaps

`loadTiles` draws web map tiles (satellite imagery or a street map) below the other layers, fetching them as the camera moves:

```ts
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

map.loadTiles('imagery', {
    source: TILE_SOURCES.esriWorldImagery,
    center: { latitude: 40.7831, longitude: -73.9712 },
    zoom: 12,
});
```

* **Sources.** Presets are `esriWorldImagery`, `openStreetMap`, `osmLight`, and `osmDark`. The OSM themes use the standard OSM raster endpoint and apply muted colors on the client. `osmLight` has a pale background and `osmDark` reverses luminance onto a dark background. Roads and labels baked into the images remain; this does not add vector tile styling. Custom raster sources can also set `theme: 'light' | 'dark' | 'original'`. Colors are processed once when a tile is loaded and cached with the texture; overlays and other render pipelines are unchanged. Anything else works through a URL template with `{z}`, `{x}`, `{y}`, optional `{s}` (with `subdomains`) and `{reverseY}` for TMS-style servers. `attribution` is required and is shown beside the Autark link at the bottom left of the map. It is a string, a `{ text, url }` entry that links to the provider's page, or a list of either; links must be `http(s)` URLs. The OpenStreetMap-based presets link to `openstreetmap.org/copyright`.
* **Provider terms.** Presets are conveniences, not licences. OpenStreetMap's public servers forbid heavy use and bulk downloading; use your own server or a commercial provider in production. Esri imagery needs its attribution to stay visible.
* **Coordinate system.** `crs` is the system of your data: `'EPSG:3395'` (the default, as in `AutkDb` workspaces), `'EPSG:3857'` or `'EPSG:4326'`. Tiles are Web Mercator and are reprojected on the CPU; unsupported CRS values are rejected before creating a layer.
* **Order and origin.** Tile layers sit under every other layer, so a `surface` layer would cover them. An explicit geographic `center` initializes tile-only maps; otherwise the first data layer establishes the origin. `zoom` requires a center and defaults to 12. Centers are WGS84 coordinates regardless of the output CRS.
* **Loading.** At most 8 requests run at once; tiles that leave the view are cancelled, the soft cache limit is 256 tiles (`maxCachedTiles`), and the browser HTTP cache applies as usual. While a tile loads, the nearest loaded ancestor is drawn in its place. Tiles that fail for a transient reason are retried by the layer itself after a delay that doubles with each failure, up to a minute, for as long as they are in view; a definitive error such as 404 is not retried.
* **Sharpness.** The zoom is chosen so a tile pixel is about one screen pixel, counted in device pixels. `zoomBias: 1` gives sharper tiles with roughly four times the requests; `maxTiles` (64) caps selected tiles; ancestor preloads add requests: the zoom drops to fit, and if the source's lowest zoom still needs more, only the tiles nearest the view centre are used.
* **Hiding.** Hiding a tile layer (`updateRenderInfo(id, { isSkip: true })`) cancels its queued, in-flight and retrying requests and keeps the textures already loaded, so showing it again draws at once and loads only what is missing.
* **Statistics.** `map.getTileStats(id)` returns a read-only snapshot: the zoom (and the zoom the view wanted, when the tile cap lowered it), how many selected tiles are drawn with their own image, with an ancestor's or not at all, the request queue, cached textures with an estimated size in bytes, and cumulative counts of requests (retries included, not network transfers), cache reuses and pressure evictions. `map.renderStats` gives the number of frames rendered, the CPU time of the last frame and the average, and the frame rate while rendering. Time is CPU time around preparing and submitting a frame, not GPU time, and the rate is 0 while the map is idle. Reading either does not trigger rendering, so a page can poll them on a timer; a frame count that stops increasing means the map is idle.
* **Limits.** Camera fitting retains automatic far-plane expansion; planet-scale views remain outside the tile feature's scope. Terrain draping is also not supported yet. Tiles beyond 20 camera heights from the ground point under the camera are not requested, so a nearly level camera shows imagery only up to that distance.

### Render sizing verification

- Interactive example: `gallery/src/autk-map/render-sizing.html` (point/line sliders and picking).
- CPU and GPU-boundary mocks: `npm test -- autk-core/test/polyline-builder.test.ts autk-map/test/render-sizing.test.ts autk-map/test/polyline-pipeline.test.ts`.
- Real WebGPU regression: run `make build`, serve the repository root with `python3 -m http.server 8000 --bind 127.0.0.1`, and open `http://127.0.0.1:8000/autk-map/test/render-sizing.webgpu.html` in a WebGPU-enabled browser. The page verifies dynamic sizes, picking, road defaults and numerical join expansion against the built packages.

The new line path removes CPU polygon buffering/triangulation, but carries additional adjacency/topology data for GPU expansion. Lower CPU preparation time does not imply lower buffer memory or faster rendering for every dataset.

### API summary

* `new AutkMap(canvas)`: Creates a map controller bound to an HTML canvas.
* `init()`: Initializes WebGPU resources, event handlers, the camera, and UI controls.
* `camera`, `renderer`, `layerManager`, `canvas`, `ui`: Expose core map subsystems.
* `events`: Typed event bus for interactions such as picking.
* `activePickingLayer`: Returns the layer currently configured for picking.
* `loadCollection(id, params)`: Loads a GeoJSON or raster-derived collection as a map layer.
* `loadMesh(id, params)`: Loads prebuilt mesh geometry directly.
* `loadTiles(id, params)`: Loads a tile basemap from a URL template or a preset (`TILE_SOURCES`).
* `getTileStats(id)`, `renderStats`: Read-only statistics of a tile layer and of rendered frames; neither triggers rendering.
* `updateThematic(id, params)`: Updates layer values from a GeoJSON property path.
* `updateRaster(id, params)`: Updates raster values and optional opacity transfer functions, or the three bands of an RGB image.
* `updateColorMap(id, params)`: Patches the layer colormap configuration.
* `updateRenderInfo(id, params)`: Updates render state such as point radius, polyline width, visibility, opacity, picking, and colormap activation.
* `removeLayer(id)`: Removes a layer from the map.
* `setHighlightedIds(id, selection)`, `clearHighlightedIds(id)`: Controls highlighted vector components.
* `setSkippedIds(id, selection)`, `clearSkippedIds(id)`: Hides or restores selected vector components.
* `draw(options?)`: Starts on-demand rendering by default; a numeric FPS or `{ onDemand: false }` starts a continuous loop.
* `fitBounds(bounds?)`: Moves the camera, looking straight down, so a rectangle (by default the first loaded collection) fits the viewport. A flat map otherwise starts at a fixed height over the middle of the first layer. Opt-in: loading layers does not call it.
* `requestRender()`: Requests one on-demand frame after an unobserved change; does not mark CPU buffers or cached uniforms dirty.
* `destroy()`: Releases event handlers and GPU resources.

## Layer order and elevation

`LayerInfo.zIndex` controls CPU layer ordering only. Polygons, borders, rasters,
points, and polylines use a common ground plane and blend in layer order; each
polygon fill is followed by its border before the next layer is drawn. Adding
or reordering layers does not raise geometry or change its apparent size.

Buildings retain their actual geometry heights and depth testing, and their
shared SSAO result is composited over the 2D map. In terrain mode, ordered 2D
layers are draped through the terrain overlay, and buildings retain terrain
occlusion. Picking uses the same positions as visible geometry and continues
to target the active pick-enabled layer.

Run the rendering regression in a WebGPU-enabled Chrome installation:

```sh
node autk-compute/test/run-webgpu.mjs /autk-map/test/render-order.webgpu.ts
```

## Raster layers

A raster layer draws one band of a GeoTIFF-derived collection through the layer color map. The collection comes from `AutkDb.getLayer()` (or `getRaster()`) after `loadGeoTiff()`.

```ts
map.loadCollection('elevation', { collection, type: 'raster', property: 'band_1' });
```

A raster alone is enough to start a map: its declared `bbox` establishes the map origin. Call `map.fitBounds()` after loading to frame it; loading does not move the camera automatically. No vector layer has to be loaded first.

Satellite and aerial imagery has red, green and blue bands that should be shown as they are. Pass the three band paths to draw a true-color image; the color map and transfer function do not apply.

```ts
map.loadCollection('imagery', {
    collection,
    type: 'raster',
    property: ['band_1', 'band_2', 'band_3'],
    // Optional: band values mapped to 0 and 255.
    loadConfig: { rgbRange: [0, 3000] },
});

// Later, with different bands or range:
map.updateRaster('imagery', { collection, property: ['band_4', 'band_3', 'band_2'], rgbRange: [0, 3000] });
```

Values in 0 to 255 are shown unchanged. Other data, such as reflectance up to 10000, is stretched using the smallest and largest channel values of complete, finite RGB pixels unless `rgbRange` is given. A pixel with a nonfinite value in any band stays transparent and does not affect that range. Normalized floating-point imagery in 0 to 1 needs `rgbRange: [0, 1]`; it cannot be distinguished reliably from dark byte imagery. Explicit ranges must have two finite endpoints with min <= max and a finite span.

Each band must contain exactly `rasterResX * rasterResY` samples for the existing layer. Missing bands, mismatched dimensions, and invalid ranges log a warning and leave the image and display mode unchanged. Updates keep the existing grid and geometry; remove and reload a layer to change its dimensions or extent.

Switching to RGB suppresses the scalar domain, legend, and palette control. Colormap updates and transfer functions do not apply to RGB pixels. Switching back to one band restores the previous scalar legend preference, recomputes its domain, and uses the stored scalar colormap and transfer function. Layer opacity works in both modes.

`loadGeoTiff()` limits a raster to one million cells by default and logs a warning when it resamples a larger image; raise `maxRasterCells` to keep more detail.

See the [gallery validation checklist](../.doc/PR-125-GALLERY-VALIDATION.md) for the raster example and all existing gallery regression checks.
After building, run the RGB browser regression with `node autk-compute/test/run-webgpu.mjs /autk-map/test/raster-rgb.webgpu.ts`
and the gallery-control smoke test with `node autk-compute/test/run-webgpu.mjs /gallery/test/raster-rgb.webgpu.ts` from the repository root.

## Terrain and optional imagery

```ts
import { TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';

// Existing vector layers already define the origin and view.
map.loadTerrain({
    source: TERRAIN_TILE_SOURCES.awsTerrarium,
    // CRS and camera are inherited from the map.
    levels: 6,
    windowSize: 512,
    composeBudgetMs: 4,
    overlaySize: 2048,
});
map.getTerrainTileStats();
map.resetTerrainTileTiming();
map.removeTerrain();
```

An existing map needs no center or zoom. For a standalone terrain map, supply the initial view:

```ts
map.loadTerrain({
    source: TERRAIN_TILE_SOURCES.awsTerrarium,
    center: { latitude: -22.96, longitude: -43.2075 },
    zoom: 14,
});
// Optional: add imagery without changing terrain or the camera.
map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
```

Terrain without imagery uses the shaded map surface color. Imagery can be hidden or removed independently; `removeTerrain()` preserves imagery, data, and the camera. Calling `loadTerrain()` again replaces elevation after successful setup.

Normalized raster elevation uses the same API:

```ts
map.loadTerrain({ source: { collection: elevation, property: 'band_1' } });
```

The raster is already in the workspace CRS and can initialize an empty map from its bounds. Tile source descriptors need no additional `type` argument. `enableTerrainMode()`, `enableTerrainTiles()`, and `disableTerrainMode()` remain compatibility wrappers.

The shared workspace CRS defaults to the same EPSG:3395 constant as AutkDb. For normalized data from a custom workspace, construct the map with `new AutkMap(canvas, true, { crs: 'EPSG:3857' })`. The existing `crs` parameter on the first imagery or terrain load can also declare a custom workspace CRS when the constructor did not specify one. Imagery and elevation then inherit this CRS and the same origin; subsequent conflicting settings are rejected. GeoJSON does not reliably carry workspace CRS metadata, so a custom database CRS must be declared on the map. Explicit center/zoom repositions the camera without changing an existing origin. Terrain zoom uses a 256-pixel Web Mercator reference independent of DEM tile resolution.

Elevation supports Terrarium and Mapbox terrain-RGB encodings in EPSG:3395 or EPSG:3857 workspaces. Imagery and ordered 2D layers render into the terrain overlay; buildings and picking sample the same height source. Flat maps retain their existing high-DPI tile selection, while terrain selection uses the actual overlay viewport.

Elevation validation is enabled by default for every region, independently of imagery. It uses physical sample spacing, robust local variation, coherent-feature checks, and validated coarser references before replacing isolated spikes or pits. Negative elevations are retained. Unconfirmed features are not automatically flattened. Tile boundaries share neighboring samples; raster terrain uses the same spatial rules with conservative local repair.

```ts
map.loadTerrain({
    source: TERRAIN_TILE_SOURCES.awsTerrarium,
    validation: { minDeviation: 100, maxSlope: 8, madMultiplier: 8 },
});
map.getTerrainValidationStats(); // checked, rejected, corrected, unresolved
// Use validation: false to preserve raw source heights.
```

Validation requests parent references even when only one terrain level is rendered. It uses the existing composition row budget and records its live typed-array storage as `memory.validationScratch`. Diagnostics are per published window and can count overlapping source samples. Broad errors shared across scales cannot reliably be detected without an independent source. See [elevation validation](../.doc/ELEVATION-VALIDATION.md) for sensitivity, uncertainty, and coverage.

`overlaySize` accepts integer edges from 64 to 4096 and defaults to 2048 for streamed terrain. Existing GeoTIFF terrain retains its previous 4096 target and device-limit clamping. At 4× MSAA the streamed default overlay is approximately 185 MB, compared with approximately 740 MB at 4096. This excludes height data, canvas, building, and depth resources.

Terrain options are validated before starting requests. The requested windows may need at most 4096 tiles. `idle` means no requests, retries, or composition remain; `complete` separately indicates height coverage, and `failedTiles` reports current request failures. A scene can be idle with partial coverage instead of loading forever. Missing elevation uses coarser data where available and zero otherwise.

`composeBudgetMs` is checked between four-row batches, including initial sampling. Published windows remain intact until a replacement finishes; camera movement cancels obsolete scratch grids. A batch, GPU submission, or other frame work can still exceed the requested time, so this is not a frame-time guarantee. Diagnostics include scratch-window memory and retained tile snapshots. Provider terms, data resolution, vertical datums, and available GPU memory still apply. See [the terrain design and limits](../.doc/TILE-TERRAIN.md) and [the terrain gallery](../gallery/src/autk-map/terrain-tiles.html).

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)

The [tile basemap gallery example](../gallery/src/autk-map/tiles-basemap.html) loads tiles only, with Esri, OSM, and local source choices. The separate [numeric-category overlay example](../gallery/src/autk-map/tiles-categorical.html) adds database-projected roads and a categorical legend. See [.doc/TILE-BASEMAP.md](../.doc/TILE-BASEMAP.md) for lifecycle, validation, tests, and remaining limits.
