<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk-db</h1>

  <br>
  <p><strong>In-browser spatial database for urban datasets.</strong></p>

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

## @urban-toolkit/autk-db

`@urban-toolkit/autk-db` provides an in-browser spatial database built on DuckDB-Wasm and its spatial extension. It helps applications load urban datasets, organize them into workspaces, run spatial joins and custom SQL queries, and export layers as GeoJSON for use with `autk-map`, `autk-plot`, or other tools.

### Basic usage

```ts
import { AutkDb } from '@urban-toolkit/autk-db';

const db = new AutkDb();
await db.init();

await db.loadCustomLayer({
  outputTableName: 'buildings',
  geojsonObject: buildingsGeojson,
  layerType: 'buildings',
});

const buildings = await db.getLayer('buildings');
console.log(db.tables, buildings);
```

### API summary

* `new AutkDb()`: Creates an isolated database controller.
* `init()`: Initializes DuckDB-Wasm and loads the spatial extension.
* `tables`: Lists tables registered in the current workspace.
* `setWorkspace(name)`, `getWorkspaces()`, `getCurrentWorkspace()`: Manage isolated database schemas.
* `loadOsm(params)`: Loads OpenStreetMap data from Overpass API or PBF-backed workflows.
* `loadCsv(params)`, `loadJson(params)`: Imports tabular or JSON data.
* `loadLayer(params)`: Extracts standard urban layers from loaded OSM data.
* `loadCustomLayer(params)`, `loadGridLayer(params)`: Imports custom GeoJSON and generated grid layers.
* `loadGeoTiff(params)`, `getGeoTiffLayer(tableName)`: Imports and exports GeoTIFF-derived raster layers.
* `getLayer(layerTableName)`: Exports a layer table as a GeoJSON `FeatureCollection`.
* `getBoundingBoxFromLayer(layerName)`: Computes a layer bounding box.
* `getTableData(params)`: Reads table data for inspection or UI display.
* `updateTable(params)`: Updates a table using the supported update strategies.
* `spatialQuery(params)`: Runs spatial joins and aggregations between layers.
* `rawQuery(params)`: Executes custom SQL against the current workspace.
* `buildHeatmap(params)`: Builds aggregated heatmap/grid outputs.
* `removeLayer(tableName)`: Drops a table from the current workspace.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
