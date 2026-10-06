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

await db.loadGeojson({
  outputTableName: 'buildings',
  geojsonObject: buildingsGeojson,
  layerType: 'buildings',
});

const buildings = await db.getLayer('buildings');
console.log(db.tables, buildings);
```

### OpenStreetMap areas, bounding boxes and surface

Both Overpass and local `.osm.pbf` loading accept named administrative areas or a WGS84 bounding box:

```ts
await db.loadOsm({
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] }, // west, south, east, north
  // pbfFileUrl: '/data/lower_mnt.osm.pbf', // optional: read a local extract instead of Overpass
  autoLoadLayers: { layers: ['buildings', 'roads', 'water'] },
});
```

Named queries use `queryArea: { geocodeArea: 'Illinois', areas: ['Golf'] }`. Both sources match exact named OSM boundaries (including `boundary=administrative` and `boundary=place`) with at least one member node inside the named region, not just its rectangular extent. Overpass derives each thematic area from the same scoped boundary relation via `map_to_area`. PBF reconstructs the region's polygons, including holes and disconnected components, before selecting the requested boundaries. If the PBF lacks usable region geometry (missing, incomplete or invalid), loading continues with a clear warning and matches only the exact boundary names in `areas`. This fallback may include homonymous areas elsewhere in the extract; use a complete extract or `queryArea.bbox` when that ambiguity matters. Missing requested area names still cause an error. The small gallery `lower_mnt.osm.pbf` uses this warned fallback because its New York boundary is incomplete.

Boxes require four finite WGS84 coordinates within geographic limits, with west < east and south < north; antimeridian crossings are unsupported. Overpass spatial selectors acquire candidates, not an exhaustive geometric intersection query. PBF cannot recover relation members absent from the extract.

**Surface is always constructed**, whether requested or not. Its base geometry is the named administrative region or the bbox rectangle. Coastlines (`natural=coastline`, land on the left) define a terrestrial mask intersected with that base. Lakes/rivers remain inside surface and can be represented by `water`. Missing, incomplete, ambiguous or invalid coastlines produce a clear `console.warn` and retain the full base area, potentially including sea. This also happens for an entirely maritime bbox without coastlines. Coastline mask coordinates are quantized to 1e-10 degrees for endpoint matching; thematic/building coordinates are not changed by that operation.

All imports now clip roads/parks/water and filter complete buildings by this surface, even if `surface` is omitted from `layers`. This changes the previous optional-surface behavior and can reduce results. An omitted surface is retained internally for subsequent workspace constraints but excluded from `getLayersMetadata()` and per-layer load timings; it remains inspectable through `getTablesMetadata()`/`getLayer()`. Include `surface` to expose it normally. Named Overpass queries use cache version `v4` to reject old incorrectly scoped entries (including full-data supersets); unchanged bbox queries retain `v3`.

BBox gallery examples: [`osm-layers-api-bbox`](../gallery/src/autk-map/osm-layers-api-bbox.ts) and [`osm-layers-pbf-bbox`](../gallery/src/autk-map/osm-layers-pbf-bbox.ts).

### Building features and spatial joins

With `layerType: 'buildings'`, each feature is stored/exported as one GeometryCollection of original parts. Use `properties.parts[].geometryIndex` for per-part attributes. Distinct GeoJSON features remain distinct even when they overlap. OSM `type=building` relations associate original member ways without generating a duplicate geometry, including disconnected/untagged members. Orphan ways tagged `building:part` (except `no`) are associated with a relation only when their whole geometry is covered by an original outline of exactly one usable surface relation. Outline roles are authoritative; empty/outer-role members qualify only when tagged as whole buildings, not parts. Holes are respected, explicit ownership is never overridden, and inferred parts do not become outlines. Ambiguous containment warns and leaves the part unassociated; partial overlap and independent buildings do not qualify. Remaining unassociated ways retain intersection-based clustering. General relation attributes are inherited by parts, whose own tags take precedence. `properties.osmRelation` retains the relation ID (string), way membership/roles and original tags; optional `osmRelation.inferredParts` records inferred IDs and `method: 'outline-containment'` separately from original members. Feature.id remains the minimum source part ID; unusable/missing member geometry or shared ownership causes a console warning and omission of the whole affected relation, avoiding partial buildings. Unsupported member types/roles (including `roof`), conflicting roles and relations with no way members also warn and skip the affected relation plus all its direct way members; unrelated buildings continue loading. Invalid membership is not converted into a partial building or standalone member features. Explicit `location=underground` parts and relations are excluded from this surface building layer with a console warning, before spatial clustering; above-ground parts of mixed buildings remain. Height zero, negative `layer` and basement-level tags alone do not trigger exclusion. There is no union, convex hull or persistent `agg_geometry`. Both PBF and Overpass collect `type=building` relations and their way members; Overpass uses versioned cache keys so older responses lacking these relations are not reused. Source parity requires the same OSM snapshot and complete relation geometry: a local extract cannot reconstruct coordinates for members absent from the PBF.

Public GeoJSON IDs are separate from internal numeric row IDs:

```ts
await db.updateTable({
  tableName: 'buildings', strategy: 'update',
  idColumn: 'geojson_id', data: updatedBuildings,
});
```

Keep each input Feature.id for this update; missing IDs are rejected. `idColumn: 'id'` deliberately addresses an internal row key instead.

Spatial joins count matched features once, not individual parts. Aggregate paths remain `properties.sjoin.count.points` and similar. A join without aggregation now keeps one root feature with `properties.sjoin.matches: [{ id?, properties }]`; no matches gives an empty array. Nonaggregated named fields become arrays. NEAR still defaults to centroid distance; `near.useCentroid: false` uses minimum component distance.

GeoJSON building import/update rejects invalid geometry without repair. OSM buildings instead log invalid/missing/empty/non-polygonal geometry with `console.warn` and skip the affected feature, continuing the import without repair. Database/transaction errors are not swallowed. Explicit bbox import filters whole buildings instead of cutting parts; existing workspace polygon crop behavior remains. Old per-part OSM tables, custom SQL, flattened join consumers and stored window IDs need migration/reload.

Tests from the repository root: `npm test -- autk-db/test` (real DuckDB-WASM in Node; spatial extension access required, no Playwright).

### JSON geometry loading

`loadJson` can import plain JSON records or materialize geometry during load using the same geometry options supported by `loadCsv`:

- `geometryColumns: true` → reads default `Latitude` / `Longitude` fields as points
- `{ latColumnName, longColumnName, coordinateFormat? }` → reads explicit coordinate fields as points
- `{ wktColumnName, coordinateFormat? }` → parses WKT geometry and infers the returned layer family

```ts
const parcels = await db.loadJson({
  outputTableName: 'parcels',
  jsonObject: [
    { id: 1, wkt: 'POLYGON((-43.3 -22.9, -43.2 -22.9, -43.2 -22.8, -43.3 -22.8, -43.3 -22.9))' },
  ],
  geometryColumns: { wktColumnName: 'wkt' },
});

console.log(parcels.type); // 'polygons'
```

### API summary

* `new AutkDb()`: Creates an isolated database controller.
* `init()`: Initializes DuckDB-Wasm and loads the spatial extension.
* `tables`: Lists tables registered in the current workspace.
* `setWorkspace(name)`, `getWorkspaces()`, `getCurrentWorkspace()`: Manage isolated database schemas.
* `loadOsm(params)`: Loads OpenStreetMap data from Overpass API or PBF-backed workflows.
* `loadCsv(params)`, `loadJson(params)`: Imports tabular or JSON data.
* `loadGeojson(params)`: Imports custom GeoJSON layers.
* `loadGeoTiff(params)`, `getGeoTiffLayer(tableName)`: Imports and exports GeoTIFF-derived raster layers.
* `getLayer(layerTableName)`: Exports a layer table as a GeoJSON `FeatureCollection`.
* `getBoundingBoxFromLayer(layerName)`: Computes a layer bounding box.
* `getTableData(params)`: Reads table data for inspection or UI display.
* `updateTable(params)`: Updates a table using the supported update strategies.
* `spatialQuery(params)`: Runs spatial joins and aggregations between layers.
* `rawQuery(params)`: Executes custom SQL against the current workspace.
* `buildHeatmap(params)`: Creates a grid internally and builds aggregated heatmap outputs.
* `removeLayer(tableName)`: Drops a table from the current workspace.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
