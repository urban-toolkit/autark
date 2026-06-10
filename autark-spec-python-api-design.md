# AutarkSpec and Python API Design

Date: 2026-06-07

This document proposes a declarative Autark specification and a thin Python API, following the same broad model as Altair and Vega-Lite:

- Python authors a structured specification.
- The specification is serialized as JSON.
- The existing TypeScript Autark runtime executes the specification.
- Autark's database, map, plot, and compute implementations remain in TypeScript/WebGPU/DuckDB-WASM.

The goal is to expose Autark to notebook and Python users without reimplementing Autark in Python.

## Design Principle

The central constraint is:

> Python should author Autark specifications; TypeScript Autark should execute them.

Python should not reimplement:

- WebGPU rendering;
- DuckDB-WASM spatial workflows;
- OSM loading;
- map layer rendering;
- plot rendering;
- GPU compute;
- linked interaction logic.

Instead, Python should provide:

- ergonomic object builders;
- validation;
- pandas/GeoPandas serialization helpers;
- Jupyter display integration;
- JSON export/import;
- a stable bridge to the browser-side Autark runtime.

## Proposed Architecture

```text
Python API
  ak.View(), ak.Layer(), ak.Data(), ak.SpatialJoin(), ak.Histogram(), ...
  |
  | builds
  v
AutarkSpec JSON
  versioned declarative grammar
  |
  | consumed by
  v
TypeScript Runtime
  AutarkRuntime.fromSpec(spec, target)
  |
  | uses existing packages
  v
autk-db / autk-map / autk-plot / autk-compute
```

## Package Shape

### TypeScript

Possible package:

```text
@urban-toolkit/autk-runtime
```

Responsibilities:

- define `AutarkSpec` TypeScript types;
- validate specs at runtime;
- execute specs using existing Autark packages;
- manage map/plot layout targets;
- connect selections and linked views;
- expose `AutarkRuntime.fromSpec(spec, options)`.

Possible entry point:

```ts
import { AutarkRuntime } from '@urban-toolkit/autk-runtime';

await AutarkRuntime.fromSpec(spec, {
  container: document.getElementById('app'),
});
```

### Python

Possible package:

```text
autark
```

Responsibilities:

- provide Python builders for `AutarkSpec`;
- serialize pandas/GeoPandas data when needed;
- display specs in Jupyter;
- export specs to JSON;
- optionally save self-contained HTML.

Example:

```python
import autark as ak

view = (
    ak.View()
    .data(ak.OSM("osm", area="Manhattan, New York", layers=["buildings", "roads", "parks"]))
    .map(ak.Layer("buildings").encode(color="height").style(opacity=0.9))
    .plot(ak.Histogram("buildings", x="height").select("height_brush"))
    .link("height_brush", target="buildings")
)

view.show()
```

## AutarkSpec v0.1

The first version should be deliberately small. It should cover enough of Autark to demonstrate the concept without trying to expose every internal option.

### Top-Level Shape

```ts
interface AutarkSpec {
  schema: 'https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json';
  version: '0.1';
  metadata?: SpecMetadata;
  workspace?: WorkspaceSpec;
  data?: DataSourceSpec[];
  transforms?: TransformSpec[];
  views?: ViewSpec[];
  links?: LinkSpec[];
  layout?: LayoutSpec;
}
```

Example:

```json
{
  "schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
  "version": "0.1",
  "workspace": {
    "name": "autk",
    "coordinateFormat": "EPSG:4326"
  },
  "data": [],
  "transforms": [],
  "views": [],
  "links": []
}
```

### Metadata

```ts
interface SpecMetadata {
  title?: string;
  description?: string;
  authors?: string[];
  created?: string;
}
```

### Workspace

```ts
interface WorkspaceSpec {
  name?: string;
  coordinateFormat?: string;
}
```

The workspace maps naturally onto `AutkDb.setWorkspace()` and coordinate-format configuration.

## Data Sources

Data sources describe how data enters Autark. They do not necessarily contain the data inline.

```ts
type DataSourceSpec =
  | OsmDataSpec
  | GeoJsonDataSpec
  | CsvDataSpec
  | JsonDataSpec
  | GeoTiffDataSpec
  | InlineDataSpec
  | TableRefSpec;
```

### OSM

```ts
interface OsmDataSpec {
  type: 'osm';
  name: string;
  area: string | BoundingBoxSpec;
  layers: Array<'buildings' | 'roads' | 'parks' | 'water' | 'surface'>;
  source?: 'overpass' | 'pbf';
  pbfFileUrl?: string;
  coordinateFormat?: string;
}
```

Example:

```json
{
  "type": "osm",
  "name": "manhattan",
  "area": "Manhattan, New York",
  "layers": ["buildings", "roads", "parks", "water"]
}
```

Execution:

- TypeScript runtime calls `AutkDb.loadOsm(...)`.
- Loaded OSM layers become named tables/layers available to map and plot views.

### GeoJSON

```ts
interface GeoJsonDataSpec {
  type: 'geojson';
  name: string;
  url?: string;
  values?: GeoJSON.FeatureCollection;
  layerType?: LayerType;
}
```

Python mappings:

- `ak.GeoJSON("parcels", url="parcels.geojson")`
- `ak.GeoJSON("parcels", gdf)` where GeoPandas is serialized to GeoJSON

### CSV

```ts
interface CsvDataSpec {
  type: 'csv';
  name: string;
  url?: string;
  values?: unknown[][];
  delimiter?: string;
  geometry?: CsvGeometrySpec;
}

type CsvGeometrySpec =
  | { type: 'latlng'; latitude: string; longitude: string; coordinateFormat?: string }
  | { type: 'wkt'; column: string; coordinateFormat?: string };
```

### JSON

```ts
interface JsonDataSpec {
  type: 'json';
  name: string;
  url?: string;
  values?: unknown[];
  geometry?: JsonGeometrySpec;
}

type JsonGeometrySpec =
  | { type: 'latlng'; latitude: string; longitude: string; coordinateFormat?: string }
  | { type: 'wkt'; column: string; coordinateFormat?: string };
```

### GeoTIFF

```ts
interface GeoTiffDataSpec {
  type: 'geotiff';
  name: string;
  url: string;
  bands?: number[];
}
```

### Existing Table Reference

```ts
interface TableRefSpec {
  type: 'table';
  name: string;
  table: string;
}
```

This lets a spec refer to a table already created in the active Autark workspace.

## Transforms

Transforms describe operations that produce or mutate tables before views are rendered.

```ts
type TransformSpec =
  | SpatialJoinSpec
  | HeatmapSpec
  | ComputeSpec
  | RawQuerySpec;
```

### Spatial Join

```ts
interface SpatialJoinSpec {
  type: 'spatialJoin';
  root: string;
  join: string;
  near?: {
    distance: number;
    useCentroid?: boolean;
  };
  groupBy?: AggregateSpec[];
}

interface AggregateSpec {
  column: string;
  op?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'weighted' | 'collect';
  normalize?: boolean;
  as?: string;
}
```

Example:

```json
{
  "type": "spatialJoin",
  "root": "neighborhoods",
  "join": "trees",
  "groupBy": [
    { "column": "*", "op": "count", "as": "tree_count" }
  ]
}
```

Execution:

- TypeScript runtime maps this to `AutkDb.spatialQuery(...)`.

### Heatmap

```ts
interface HeatmapSpec {
  type: 'heatmap';
  source: string;
  name: string;
  value?: string;
  aggregation?: 'count' | 'sum' | 'avg';
  cellSize?: number;
}
```

### Compute

```ts
type ComputeSpec = GpgpuComputeSpec | RenderComputeSpec;
```

#### GPGPU Compute

```ts
interface GpgpuComputeSpec {
  type: 'compute';
  mode: 'gpgpu';
  source: string;
  inputs: Record<string, string>;
  body: string;
  as: string | string[];
}
```

Example:

```json
{
  "type": "compute",
  "mode": "gpgpu",
  "source": "buildings",
  "inputs": {
    "height": "properties.height",
    "area": "properties.area"
  },
  "body": "return height * area;",
  "as": "volume_proxy"
}
```

#### Render Compute

```ts
interface RenderComputeSpec {
  type: 'compute';
  mode: 'render';
  source: string;
  layers: RenderLayerSpec[];
  viewpoints: ViewpointSpec;
  aggregation: RenderAggregationSpec;
  as?: string;
}
```

This should be part of v0.1 only if the implementation team wants to expose the more advanced compute model early. Otherwise it can be deferred to v0.2.

### Raw Query

```ts
interface RawQuerySpec {
  type: 'rawQuery';
  query: string;
  output?: {
    type: 'returnObject' | 'createTable';
    name?: string;
    source?: string;
    tableType?: LayerType;
  };
}
```

This is powerful but should be optional in the first Python API because it weakens the declarative abstraction.

## Views

Views describe rendered outputs.

```ts
type ViewSpec =
  | MapViewSpec
  | PlotViewSpec
  | TableViewSpec;
```

### Map View

```ts
interface MapViewSpec {
  type: 'map';
  name?: string;
  target?: string;
  camera?: CameraSpec;
  style?: MapStyleSpec;
  layers: MapLayerSpec[];
}
```

Example:

```json
{
  "type": "map",
  "name": "main_map",
  "camera": {
    "pitch": 55,
    "bearing": 20,
    "zoom": 13
  },
  "layers": [
    {
      "source": "buildings",
      "type": "buildings",
      "encoding": {
        "color": { "field": "height" }
      },
      "style": {
        "opacity": 0.9
      }
    }
  ]
}
```

### Map Layer

```ts
interface MapLayerSpec {
  source: string;
  id?: string;
  type?: LayerType;
  encoding?: EncodingSpec;
  style?: LayerStyleSpec;
  interaction?: LayerInteractionSpec;
}
```

### Encodings

```ts
interface EncodingSpec {
  color?: FieldEncoding | ValueEncoding;
  opacity?: FieldEncoding | ValueEncoding;
  size?: FieldEncoding | ValueEncoding;
  height?: FieldEncoding | ValueEncoding;
}

interface FieldEncoding {
  field: string;
  scale?: ScaleSpec;
  legend?: LegendSpec;
}

interface ValueEncoding {
  value: string | number | boolean;
}
```

### Color Scale

This should map to existing Autark color-map types.

```ts
interface ScaleSpec {
  type?: 'linear' | 'quantile' | 'categorical';
  scheme?: string;
  domain?: unknown[];
  domainStrategy?: 'minMax' | 'percentile' | 'user';
}
```

## Plot Views

```ts
type PlotViewSpec =
  | HistogramSpec
  | ScatterplotSpec
  | BarChartSpec
  | ParallelCoordinatesSpec
  | TimeSeriesSpec
  | HeatMatrixSpec;
```

### Histogram

```ts
interface HistogramSpec {
  type: 'histogram';
  name?: string;
  source: string;
  x: FieldEncoding;
  y?: FieldEncoding;
  bins?: number;
  selection?: SelectionSpec;
}
```

Example:

```json
{
  "type": "histogram",
  "name": "height_histogram",
  "source": "buildings",
  "x": { "field": "height" },
  "bins": 30,
  "selection": {
    "name": "height_brush",
    "type": "interval"
  }
}
```

### Scatterplot

```ts
interface ScatterplotSpec {
  type: 'scatterplot';
  name?: string;
  source: string;
  x: FieldEncoding;
  y: FieldEncoding;
  color?: FieldEncoding | ValueEncoding;
  selection?: SelectionSpec;
}
```

### Table

```ts
interface TableViewSpec {
  type: 'table';
  name?: string;
  source: string;
  columns?: string[];
  selection?: SelectionSpec;
}
```

## Selections and Links

Selections and links are central to Autark's visual analytics story.

```ts
interface SelectionSpec {
  name: string;
  type: 'point' | 'interval' | 'multi';
  fields?: string[];
}
```

```ts
interface LinkSpec {
  selection: string;
  target: string | string[];
  action?: 'filter' | 'highlight' | 'skip' | 'color';
}
```

Example:

```json
{
  "selection": "height_brush",
  "target": "buildings",
  "action": "highlight"
}
```

The TypeScript runtime should translate this into existing plot event handlers and map layer update/highlight APIs.

## Layout

Layout can be minimal in v0.1.

```ts
interface LayoutSpec {
  type?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  gap?: number;
}
```

The runtime can start with a simple generated DOM layout, then later support named targets for application integration.

## Python API Sketch

The Python API should mirror the spec without exposing too much internal complexity.

### Basic OSM Map

```python
import autark as ak

view = (
    ak.View(title="Manhattan buildings")
    .data(
        ak.OSM(
            "manhattan",
            area="Manhattan, New York",
            layers=["buildings", "roads", "parks", "water"],
        )
    )
    .map(
        ak.Map()
        .layer(
            ak.Layer("buildings")
            .encode(color="height")
            .style(opacity=0.9)
        )
        .layer(
            ak.Layer("roads")
            .style(color="#444444", width=1.5)
        )
    )
)

view.show()
```

### Linked Map and Histogram

```python
view = (
    ak.View()
    .data(ak.OSM("osm", area="Chicago, Illinois", layers=["buildings", "roads"]))
    .map(
        ak.Map()
        .layer(
            ak.Layer("buildings")
            .encode(color=ak.Color("height", scheme="viridis"))
        )
    )
    .plot(
        ak.Histogram("buildings", x="height", bins=30)
        .select("height_brush")
    )
    .link("height_brush", target="buildings", action="highlight")
)
```

### GeoPandas Input

```python
import geopandas as gpd
import autark as ak

tracts = gpd.read_file("tracts.geojson")

view = (
    ak.View()
    .data(ak.GeoJSON("tracts", tracts))
    .map(
        ak.Map()
        .layer(ak.Layer("tracts").encode(color="population"))
    )
)
```

### Spatial Join

```python
view = (
    ak.View()
    .data(ak.GeoJSON("neighborhoods", neighborhoods_gdf))
    .data(ak.CSV("trees", trees_df, geometry=ak.LatLng("lat", "lon")))
    .transform(
        ak.SpatialJoin(
            root="neighborhoods",
            join="trees",
            groupby=[ak.count("*", as_="tree_count")]
        )
    )
    .map(
        ak.Map()
        .layer(
            ak.Layer("neighborhoods")
            .encode(color="properties.sjoin.count.tree_count")
        )
    )
)
```

### GPGPU Compute

```python
view = (
    ak.View()
    .data(ak.GeoJSON("buildings", buildings_gdf))
    .transform(
        ak.Compute.gpgpu(
            source="buildings",
            inputs={
                "height": "height",
                "area": "area",
            },
            body="return height * area;",
            as_="volume_proxy",
        )
    )
    .map(
        ak.Map()
        .layer(ak.Layer("buildings").encode(color="compute.volume_proxy"))
    )
)
```

## Python Object Model

The Python classes should be lightweight immutable or mostly immutable builders.

Suggested classes:

- `View`
- `Map`
- `Layer`
- `Histogram`
- `Scatterplot`
- `BarChart`
- `Table`
- `OSM`
- `GeoJSON`
- `CSV`
- `JSON`
- `GeoTIFF`
- `SpatialJoin`
- `Heatmap`
- `Compute`
- `Color`
- `Scale`
- `Selection`

Important methods:

```python
view.to_dict()
view.to_json()
view.save_json(path)
view.show()
view.save_html(path)
```

The Python package should avoid hidden execution where possible. Building the spec should be deterministic and inspectable.

## Jupyter Display Model

`view.show()` should display an HTML/JavaScript bundle that:

1. embeds or references the Autark TypeScript runtime bundle;
2. embeds the JSON spec;
3. calls `AutarkRuntime.fromSpec(spec, { container })`.

Possible implementation options:

- `_repr_html_()` for simple notebook display;
- `anywidget` for richer bidirectional communication;
- JupyterLab extension later if needed.

MVP recommendation:

- Start with `_repr_html_()` or a small static HTML renderer.
- Move to `anywidget` only when Python-to-browser event communication becomes necessary.

## TypeScript Runtime Responsibilities

The runtime should execute a spec in this order:

1. Validate version and required fields.
2. Create an `AutkDb` instance if data/transforms require it.
3. Configure workspace.
4. Load data sources.
5. Execute transforms.
6. Materialize requested layer data for maps and plots.
7. Create DOM layout.
8. Instantiate `AutkMap` and plot views.
9. Apply encodings/styles.
10. Connect selections and links.
11. Expose runtime handles for debugging and incremental updates.

Possible API:

```ts
class AutarkRuntime {
  static async fromSpec(spec: AutarkSpec, options: RuntimeOptions): Promise<AutarkRuntime>;
  updateSpec(spec: AutarkSpec): Promise<void>;
  destroy(): Promise<void>;
  getDb(): AutkDb | undefined;
  getMap(name?: string): AutkMap | undefined;
}
```

## Validation

Validation should exist on both sides:

- Python validates builder inputs early.
- TypeScript validates incoming JSON before execution.

Recommended tools:

- JSON Schema for the public spec.
- TypeScript types generated from or checked against the schema.
- Python models via Pydantic or dataclasses plus JSON Schema validation.

The schema should be versioned:

```text
autark-spec-v0.1.json
autark-spec-v0.2.json
```

## Compatibility and Versioning

The spec should be explicitly versioned.

Rules:

- Minor additions should be backward compatible.
- Breaking changes require a new spec version.
- Python package and TypeScript runtime should check compatibility.

Example:

```json
{
  "version": "0.1"
}
```

The Python package can expose:

```python
ak.SPEC_VERSION
```

and the TypeScript runtime can expose:

```ts
SUPPORTED_SPEC_VERSIONS = ['0.1'];
```

## MVP Scope

The first version should include:

- `View`
- OSM data source
- GeoJSON data source
- CSV data source with lat/lng geometry
- map view
- map layers
- color encoding
- simple style options
- histogram
- scatterplot
- table
- point/interval selections
- links from plots to map layers
- spatial join
- `to_dict()`, `to_json()`, `show()`

Defer:

- render-compute;
- full GPGPU compute;
- GeoTIFF;
- raw SQL;
- complex layout;
- bidirectional Python callbacks;
- full dashboard application embedding;
- advanced map camera animation;
- custom WGSL authoring in Python notebooks.

## Implementation Roadmap

### Phase 1: Spec Skeleton

1. Add `AutarkSpec` TypeScript interfaces.
2. Add JSON Schema for v0.1.
3. Add a small spec validator.
4. Add examples of valid specs.

### Phase 2: TypeScript Runtime MVP

1. Add `AutarkRuntime.fromSpec()`.
2. Support OSM, GeoJSON, and CSV data sources.
3. Support map views and layer color encoding.
4. Support histogram and scatterplot views.
5. Support simple plot-to-map highlighting.

### Phase 3: Python Builder MVP

1. Create Python package skeleton.
2. Implement builder objects.
3. Implement `to_dict()` and `to_json()`.
4. Add pandas/GeoPandas serializers.
5. Add notebook display via generated HTML.

### Phase 4: Evaluation Examples

1. Recreate one existing gallery example from Python.
2. Recreate one use case from Python.
3. Compare the generated spec against a hand-written TypeScript workflow.
4. Use this in a small tutorial/user study.

### Phase 5: Expansion

1. Add spatial join.
2. Add heatmap.
3. Add compute.
4. Add richer linked selections.
5. Add exported standalone HTML.

## Risks

### Spec Becomes Too Large Too Soon

Mitigation:

- keep v0.1 narrow;
- support escape hatches later;
- avoid exposing every internal option.

### Runtime Becomes a Second Application Framework

Mitigation:

- make runtime a thin orchestrator over existing packages;
- keep layout simple initially;
- avoid inventing a full dashboard framework.

### Python API Diverges From TypeScript Capabilities

Mitigation:

- generate or validate Python models against the same JSON Schema;
- make TypeScript runtime the source of truth;
- keep Python as syntax sugar over the spec.

### Data Serialization Becomes Expensive

Mitigation:

- start with GeoJSON/CSV for simplicity;
- later support Arrow/Parquet or binary transfer for larger datasets;
- allow URL-based data sources to avoid embedding large values.

## Why This Helps the Paper

This design clarifies Autark's abstraction. It suggests that the core contribution is not only a TypeScript library, but a browser-native urban visual analytics runtime that can be targeted by multiple frontends.

That gives the paper a stronger conceptual framing:

- Autark provides the execution substrate.
- `AutarkSpec` provides the declarative workflow representation.
- TypeScript and Python are authoring interfaces.
- Agentic coding can become one possible spec-authoring mechanism, not the center of the contribution.

This also aligns well with the user-study idea. A tutorial could ask TypeScript- or Python-familiar users to assemble urban analytics workflows using the declarative API, while measuring how much of the workflow can be expressed at the spec level.

## Minimal Example: Full Spec

```json
{
  "schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
  "version": "0.1",
  "metadata": {
    "title": "Manhattan Building Heights"
  },
  "workspace": {
    "name": "autk",
    "coordinateFormat": "EPSG:4326"
  },
  "data": [
    {
      "type": "osm",
      "name": "manhattan",
      "area": "Manhattan, New York",
      "layers": ["buildings", "roads", "parks", "water"]
    }
  ],
  "views": [
    {
      "type": "map",
      "name": "map",
      "layers": [
        {
          "source": "buildings",
          "type": "buildings",
          "encoding": {
            "color": {
              "field": "height",
              "scale": {
                "scheme": "viridis",
                "domainStrategy": "minMax"
              }
            }
          },
          "style": {
            "opacity": 0.9
          }
        },
        {
          "source": "roads",
          "type": "roads",
          "style": {
            "color": "#444444",
            "width": 1.5
          }
        }
      ]
    },
    {
      "type": "histogram",
      "name": "height_histogram",
      "source": "buildings",
      "x": {
        "field": "height"
      },
      "bins": 30,
      "selection": {
        "name": "height_brush",
        "type": "interval"
      }
    }
  ],
  "links": [
    {
      "selection": "height_brush",
      "target": "buildings",
      "action": "highlight"
    }
  ],
  "layout": {
    "type": "vertical"
  }
}
```

