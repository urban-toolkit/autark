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
canvas includes a faint “made with autark” watermark at the bottom right, even with
`showUi: false`. It follows canvas resizing and is removed by `destroy()`. It has no logo
or year and does not intercept pointer events. The poster PNG includes the same watermark.
The poster omits the OpenStreetMap credit text; published uses still require
appropriate OpenStreetMap attribution. Data loading requires network access to Overpass;
larger crops may take longer.

### Tile basemaps

`loadTiles` draws web map tiles (satellite imagery or a street map) below the other layers, fetching them as the camera moves:

```ts
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

map.loadCollection('neighborhoods', { collection, type: 'polygons' });
map.loadTiles('imagery', { source: TILE_SOURCES.esriWorldImagery });
map.updateRenderInfo('neighborhoods', { opacity: 0.4 });   // let the imagery show through
```

* **Sources.** Presets are `esriWorldImagery`, `openStreetMap` and `cartoLight`. Anything else works through a URL template with `{z}`, `{x}`, `{y}`, optional `{s}` (with `subdomains`) and `{reverseY}` for TMS-style servers. `attribution` is required and is shown at the bottom right of the map. It is a string, a `{ text, url }` entry that links to the provider's page, or a list of either; links must be `http(s)` URLs. The OpenStreetMap-based presets link to `openstreetmap.org/copyright`.
* **Provider terms.** Presets are conveniences, not licences. OpenStreetMap's public servers forbid heavy use and bulk downloading; use your own server or a commercial provider in production. Esri imagery needs its attribution to stay visible.
* **Coordinate system.** `crs` is the system of your data: `'EPSG:3395'` (the default, as in `AutkDb` workspaces), `'EPSG:3857'` or `'EPSG:4326'`. Tiles are Web Mercator and are reprojected on the CPU, so there is no extra GPU cost.
* **Order and origin.** Tile layers sit under every other layer, so a `surface` layer would cover them. The map origin comes from the first data layer; until one is loaded the tiles are not drawn.
* **Loading.** At most 8 requests run at once; tiles that leave the view are cancelled, 256 tiles are kept in memory (`maxCachedTiles`), and the browser HTTP cache applies as usual. While a tile loads, the nearest loaded ancestor is drawn in its place. Tiles that fail for a transient reason are retried by the layer itself after a delay that doubles with each failure, up to a minute, for as long as they are in view; a definitive error such as 404 is not retried.
* **Sharpness.** The zoom is chosen so a tile pixel is about one screen pixel, counted in device pixels. `zoomBias: 1` gives sharper tiles with roughly four times the requests; `maxTiles` (64) caps what is requested and drawn at once: the zoom drops to fit, and if the source's lowest zoom still needs more, only the tiles nearest the view centre are used.
* **Hiding.** Hiding a tile layer (`updateRenderInfo(id, { isSkip: true })`) cancels its queued, in-flight and retrying requests and keeps the textures already loaded, so showing it again draws at once and loads only what is missing.
* **Statistics.** `map.getTileStats(id)` returns a read-only snapshot: the zoom (and the zoom the view wanted, when the tile cap lowered it), how many selected tiles are drawn with their own image, with an ancestor's or not at all, the request queue, cached textures with an estimated size in bytes, and cumulative counts of requests (retries included, not network transfers), cache reuses and pressure evictions. `map.renderStats` gives the number of frames rendered, the CPU time of the last frame and the average, and the frame rate while rendering. Time is CPU time around preparing and submitting a frame, not GPU time, and the rate is 0 while the map is idle. Reading either does not trigger rendering, so a page can poll them on a timer; a frame count that stops increasing means the map is idle.
* **Limits.** The camera's far plane (500 km) limits how far you can zoom out before the map is clipped, so continent- and planet-scale views are not supported yet. Terrain draping is also not supported yet. Tiles beyond 20 camera heights from the ground point under the camera are not requested, so a nearly level camera shows imagery only up to that distance.

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
* `updateRaster(id, params)`: Updates raster values and optional opacity transfer functions.
* `updateColorMap(id, params)`: Patches the layer colormap configuration.
* `updateRenderInfo(id, params)`: Updates render state such as point radius, polyline width, visibility, opacity, picking, and colormap activation.
* `removeLayer(id)`: Removes a layer from the map.
* `setHighlightedIds(id, selection)`, `clearHighlightedIds(id)`: Controls highlighted vector components.
* `setSkippedIds(id, selection)`, `clearSkippedIds(id)`: Hides or restores selected vector components.
* `draw(options?)`: Starts on-demand rendering by default; a numeric FPS or `{ onDemand: false }` starts a continuous loop.
* `requestRender()`: Requests one on-demand frame after an unobserved change; does not mark CPU buffers or cached uniforms dirty.
* `destroy()`: Releases event handlers and GPU resources.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
