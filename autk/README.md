<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk</h1>

  <br>
  <p><strong>Complete package that re-exports the Autark toolkit modules.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as a complete package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## Complete package

`@urban-toolkit/autk` re-exports the Autark modules from a single package. Use it when you want the full toolkit available through one dependency while still keeping module boundaries clear through namespace and subpath imports.

### Installation

```bash
npm install @urban-toolkit/autk
```

### Basic usage

Use namespace imports when you want access to the full package surface:

```ts
import { db, map, compute, plot } from '@urban-toolkit/autk';

const spatialDb = new db.AutkDb();
await spatialDb.init();

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const autkMap = new map.AutkMap(canvas);
await autkMap.init();

const engine = new compute.AutkComputeEngine();

const container = document.querySelector<HTMLElement>('#plot')!;
const scatterplot = new plot.AutkPlot(container, {
  type: 'scatterplot',
  collection: pointsGeojson,
  attributes: { axis: ['x', 'y'] },
});
```

You can also import a specific module through a subpath:

```ts
import { AutkDb } from '@urban-toolkit/autk/db';
import { AutkMap } from '@urban-toolkit/autk/map';
import { AutkComputeEngine } from '@urban-toolkit/autk/compute';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk/plot';
```

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
