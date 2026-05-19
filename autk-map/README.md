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
* `updateRenderInfo(id, params)`: Updates render state such as visibility, opacity, picking, and colormap activation.
* `removeLayer(id)`: Removes a layer from the map.
* `setHighlightedIds(id, selection)`, `clearHighlightedIds(id)`: Controls highlighted vector components.
* `setSkippedIds(id, selection)`, `clearSkippedIds(id)`: Hides or restores selected vector components.
* `draw(fps?)`: Starts a continuous render loop.
* `destroy()`: Releases event handlers and GPU resources.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
