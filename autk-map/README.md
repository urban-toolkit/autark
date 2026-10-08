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

### Generic layer defaults and polygon borders

Built-in presets give `points`, `polylines` and `polygons` muted colors coordinated with the base map; surface, parks, water, roads and buildings keep their existing palettes. Point sprites default to a **radius of 64 local planar units**. Generic polylines default to a **full width of 12 local planar units**, while roads retain their highway-specific widths unless explicitly overridden. These values are centralized in `src/types-layers.ts` and exported as `DEFAULT_POINT_SIZE` and `DEFAULT_LINE_WIDTH`; explicit layer values take precedence.

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
* `updateThematic(id, params)`: Updates layer values from a GeoJSON property path.
* `updateRaster(id, params)`: Updates raster values and optional opacity transfer functions.
* `updateColorMap(id, params)`: Patches the layer colormap configuration.
* `updateRenderInfo(id, params)`: Updates render state such as point radius, polyline width, visibility, opacity, picking, and colormap activation.
* `removeLayer(id)`: Removes a layer from the map.
* `setHighlightedIds(id, selection)`, `clearHighlightedIds(id)`: Controls highlighted vector components.
* `setSkippedIds(id, selection)`, `clearSkippedIds(id)`: Hides or restores selected vector components.
* `draw(fps?)`: Starts a continuous render loop.
* `destroy()`: Releases event handlers and GPU resources.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
