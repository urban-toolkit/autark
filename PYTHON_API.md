# Autark Python API

Status: MVP implemented and tested as of 2026-06-10.

The Python API lets users author Autark visual analytics specs with Python
objects, serialize them to AutarkSpec JSON, and execute them in the browser
runtime. The browser side owns DuckDB-WASM, WebGPU rendering, plots, transforms,
and linked interaction; Python owns ergonomic spec construction, validation, and
notebook/export workflows.

## What Was Built

### Spec Authoring

- `ak.Spec` / `ak.AutarkSpec` for top-level specs.
- `ak.Metadata` and `ak.Workspace`.
- JSON serialization through `to_dict()`, `to_json()`, and `save_json()`.
- JSON Schema validation through `spec.validate()`.
- Standalone HTML export through `spec.save_html()`.
- Jupyter display through `_repr_html_()` and the bundled anywidget path.

### Data Sources

Runtime-backed data sources:

- `ak.OSM`
- `ak.GeoJSON`
- `ak.CSV`

Python-side helpers:

- `ak.GeoJSON.from_dataframe()` converts pandas-like tabular data with
  latitude/longitude columns into inline GeoJSON points.
- `ak.GeoJSON.from_geopandas()` converts GeoPandas-like objects into inline
  GeoJSON, reprojecting to EPSG:4326 when CRS metadata is available.

Python builders present, runtime/schema wiring still deferred:

- `ak.JSON`
- `ak.GeoTIFF`

### Transforms

Runtime-backed transforms:

- `ak.SpatialJoin`
- `ak.Heatmap`
- `ak.Compute.gpgpu()`
- `ak.Compute.render()`

Aggregation helpers:

- `ak.count()`
- `ak.sum()` / `ak.total()`
- `ak.avg()`
- `ak.min()` / `ak.minimum()`
- `ak.max()` / `ak.maximum()`
- `ak.weighted()`
- `ak.collect()` for spatial joins

### Views

Runtime-backed views:

- `ak.Map`
- `ak.Histogram`
- `ak.Scatterplot`
- `ak.Table`

Map helpers:

- `ak.Layer`
- `ak.Camera`
- `ak.Layout`

Encoding helpers:

- `ak.field()`
- `ak.value()`
- `ak.Field`
- `ak.Value`
- `ak.Scale`

Interaction helpers:

- `ak.interval()`
- `ak.point()`
- `ak.multi()`
- `ak.Link`

## Installation

The Python package is currently installed from the monorepo:

```bash
cd python
pip install -e .
pip install -e ".[validation]"
pip install -e ".[widget]"
```

Use the `validation` extra for `spec.validate()`. Use the `widget` extra for
zero-server Jupyter rendering with `spec.widget()`.

Python package builds use Hatch and `hatch-jupyter-builder` to run
`npm run build:widget` in `autk-runtime` and include the generated
`autark/static/autark-widget.js` bundle in the wheel.

## Basic Usage

```python
import autark as ak

neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/data/neighborhoods.geojson",
    layer_type="polygons",
    coordinate_format="EPSG:4326",
)

spec = ak.Spec(
    metadata=ak.Metadata(title="Neighborhoods"),
    workspace=ak.Workspace(coordinate_format="EPSG:3857"),
    data=[neighborhoods],
    views=[
        ak.Map(
            camera=ak.Camera(zoom=12),
            layers=[
                ak.Layer(neighborhoods, type="polygons").style(
                    color="#2f6f73",
                    opacity=0.75,
                    strokeColor="#123456",
                )
            ],
        )
    ],
)

spec.validate("../schema/autark-spec-v0.1.json")
spec.save_json("neighborhoods.json")
spec.save_html("neighborhoods.html")
```

## TypeScript Versus Python Usage

There are two useful comparisons:

- TypeScript can execute an AutarkSpec directly with `AutarkRuntime`.
- TypeScript can also use the lower-level imperative packages (`AutkDb`,
  `AutkMap`, `AutkPlot`, `AutkCompute`) when building a custom application.
- Python is the ergonomic authoring layer for notebooks, scripts, generated
  specs, and HTML/widget export.

### Same Spec, TypeScript Runtime

```typescript
import { AutarkRuntime } from '@urban-toolkit/autk-runtime';

const spec = {
  $schema: 'https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json',
  version: '0.1',
  data: [
    {
      type: 'geojson',
      name: 'neighborhoods',
      url: '/data/neighborhoods.geojson',
      layerType: 'polygons',
      coordinateFormat: 'EPSG:4326',
    },
  ],
  views: [
    {
      type: 'map',
      layers: [
        {
          source: 'neighborhoods',
          type: 'polygons',
          style: {
            color: '#2f6f73',
            opacity: 0.75,
            strokeColor: '#123456',
          },
        },
      ],
    },
  ],
};

await AutarkRuntime.fromSpec(spec, {
  container: document.getElementById('app')!,
});
```

### Same Spec, Python Builder

```python
import autark as ak

neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/data/neighborhoods.geojson",
    layer_type="polygons",
    coordinate_format="EPSG:4326",
)

spec = ak.Spec(
    data=[neighborhoods],
    views=[
        ak.Map(
            layers=[
                ak.Layer(neighborhoods, type="polygons").style(
                    color="#2f6f73",
                    opacity=0.75,
                    strokeColor="#123456",
                )
            ]
        )
    ],
)

spec.save_json("neighborhoods.json")
spec.save_html("neighborhoods.html")
```

### Imperative TypeScript Workflow

The imperative TypeScript API is lower-level and useful for custom web apps.
The same spatial-join workflow requires explicitly loading data, running the
query, creating the map, loading layers, applying thematic styling, and drawing.
This mirrors examples such as `gallery/src/autk-map/spatial-join.ts`.

```typescript
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import {
  ColorMapDomainStrategy,
  ColorMapInterpolator,
} from '@urban-toolkit/autk-core';

const db = new AutkDb();
await db.init();

await db.loadGeojson({
  geojsonFileUrl: '/data/neighborhoods.geojson',
  outputTableName: 'neighborhoods',
});

await db.loadCsv({
  csvFileUrl: '/data/trees.csv',
  outputTableName: 'trees',
  geometryColumns: true,
});

await db.spatialQuery({
  tableRootName: 'neighborhoods',
  tableJoinName: 'trees',
  groupBy: [{ column: '*', aggregateFn: 'count' }],
});

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();

const neighborhoods = await db.getLayer('neighborhoods');
map.loadCollection('neighborhoods', {
  collection: neighborhoods,
  type: 'polygons',
});
map.updateColorMap('neighborhoods', {
  colorMap: {
    domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
    interpolator: ColorMapInterpolator.SEQ_GREENS,
  },
});
map.updateThematic('neighborhoods', {
  collection: neighborhoods,
  property: 'properties.sjoin.count.trees',
});

map.draw();
```

### Equivalent Python Declarative Workflow

```python
import autark as ak

neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/data/neighborhoods.geojson",
    layer_type="polygons",
)
trees = ak.CSV(
    "trees",
    url="/data/trees.csv",
    geometry=ak.latlng("latitude", "longitude", coordinate_format="EPSG:4326"),
)

spec = ak.Spec(
    data=[neighborhoods, trees],
    transforms=[
        ak.SpatialJoin(
            root=neighborhoods,
            join=trees,
            group_by=[ak.count()],
        )
    ],
    views=[
        ak.Map(
            layers=[
                ak.Layer(neighborhoods, type="polygons").encode(
                    color=ak.field(
                        "properties.sjoin.count.trees",
                        scale=ak.Scale(type="quantile", scheme="greens"),
                    )
                )
            ]
        )
    ],
)
```

## GeoPandas Workflow

```python
import autark as ak
import geopandas as gpd

gdf = gpd.read_file("neighborhoods.geojson")
gdf = gdf[gdf["population"] > 10000]

source = ak.GeoJSON.from_geopandas("neighborhoods", gdf)

spec = ak.Spec(
    data=[source],
    views=[
        ak.Map(
            layers=[
                ak.Layer(source, type="polygons").encode(
                    color=ak.field(
                        "population",
                        scale=ak.Scale(type="quantile", scheme="viridis"),
                    )
                )
            ]
        )
    ],
)
```

A complete example lives at
`python/examples/geopandas_workflow.py`.

## Linked Map And Plot

```python
import autark as ak

points = ak.GeoJSON("points", url="/data/points.geojson", layer_type="points")
brush = ak.interval("value_brush")

spec = ak.Spec(
    data=[points],
    views=[
        ak.Map(layers=[ak.Layer(points, type="points")]),
        ak.Histogram(points, x="value", bins=20, selection=brush),
    ],
    links=[
        ak.Link(source=brush, target="points", action="highlight"),
    ],
    layout=ak.Layout(type="vertical"),
)
```

## Scatterplot And Table

```python
import autark as ak

points = ak.GeoJSON("points", url="/data/points.geojson", layer_type="points")
selection = ak.interval("scatter_brush")

spec = ak.Spec(
    data=[points],
    views=[
        ak.Scatterplot(
            points,
            x="density",
            y="value",
            color="category",
            selection=selection,
        ),
        ak.Table(
            points,
            columns=["id", "category", "density", "value"],
            sort={"column": "value", "direction": "desc"},
        ),
    ],
)
```

## Spatial Join

```python
import autark as ak

neighborhoods = ak.GeoJSON("neighborhoods", url="/data/neighborhoods.geojson", layer_type="polygons")
trees = ak.GeoJSON("trees", url="/data/trees.geojson", layer_type="points")

spec = ak.Spec(
    data=[neighborhoods, trees],
    transforms=[
        ak.SpatialJoin(
            root=neighborhoods,
            join=trees,
            near=ak.Near(distance=250),
            group_by=[ak.count()],
        )
    ],
    views=[
        ak.Map(
            layers=[
                ak.Layer(neighborhoods, type="polygons").encode(
                    color=ak.field("properties.sjoin.count.trees")
                )
            ]
        )
    ],
)
```

## Heatmap

```python
import autark as ak

points = ak.GeoJSON("points", url="/data/points.geojson", layer_type="points")

heatmap = ak.Heatmap(
    points,
    output="points_heatmap",
    near=ak.Near(distance=250),
    grid=ak.HeatmapGrid(rows=64, columns=64),
    group_by=[ak.count("*", as_="point_count")],
)

spec = ak.Spec(
    data=[points],
    transforms=[heatmap],
    views=[
        ak.Map(layers=[ak.Layer("points_heatmap", type="polygons")])
    ],
)
```

## GPGPU Compute

```python
import autark as ak

points = ak.GeoJSON("points", url="/data/points.geojson", layer_type="points")

compute = ak.Compute.gpgpu(
    points,
    output="computed_points",
    variable_mapping={"value": "value"},
    uniforms={"scale": 2.0},
    wgsl_body="return value * scale;",
    result_field="score",
    layer_type="points",
)

spec = ak.Spec(
    data=[points],
    transforms=[compute],
    views=[ak.Table("computed_points", columns=["score"])],
)
```

`Compute.render()` is also wired for the render-based compute transform. It is
more verbose because the runtime needs layer, viewpoint, aggregation, camera,
and tile-size configuration.

## Jupyter Usage

For the bundled widget path:

```python
w = spec.widget()
w

# After interacting with a plot selection:
w.selections
w.observe(lambda change: print(change["new"]), names="selections")
```

The widget JavaScript is packaged with the Python wheel. DuckDB WASM and worker
assets still load from the jsDelivr CDN in this mode, so the notebook needs
network access unless those assets are bundled in a future release.

For development against a local runtime bundle, evaluating `spec` in a notebook
uses `_repr_html_()` and expects the local dev server/runtime URL configured by
the package defaults.

Development-server display is useful while changing the runtime bundle:

```bash
cd /path/to/autark
python cors_server.py 8000
```

Then open a notebook from `python/examples` and evaluate a spec object. If the
output is blank, check that `autk-runtime/dist/autk-runtime.js` exists and that
the data URLs used by the spec are reachable from the browser.

## Examples

Python examples:

- `python/examples/simple_geojson_map.py`
- `python/examples/csv_points_map.py`
- `python/examples/spatial_join.py`
- `python/examples/geopandas_workflow.py`

Spec examples:

- `examples/specs/01-basic-osm-map.json`
- `examples/specs/02-linked-map-histogram.json`
- `examples/specs/03-spatial-join.json`
- `examples/specs/04-geojson-input.json`
- `examples/specs/05-csv-points.json`
- `examples/specs/06-multiple-layers.json`

Runtime fixtures:

- `tests/fixtures/runtime/fixture-01-geojson-map.json`
- `tests/fixtures/runtime/fixture-02-csv-histogram.json`
- `tests/fixtures/runtime/fixture-03-osm-har.json`
- `tests/fixtures/runtime/fixture-05-line-style.json`
- `tests/fixtures/runtime/fixture-06-scatter-table.json`

## Verification

Useful checks from the repository root:

```bash
npm run validate:specs
npm run test:runtime
```

Python checks:

```bash
cd python
python -m unittest tests.test_spec_builders
python -m unittest discover -s tests
python -m mypy
```

The full Python discovery suite includes notebook/widget tests that start a
local Jupyter kernel, so it may need permission to bind local ports in sandboxed
environments.

## Current Limitations

- `ak.JSON` and `ak.GeoTIFF` serialize from Python, but `type: "json"` and
  `type: "geotiff"` are not yet accepted by the AutarkSpec schema/runtime data
  loader.
- OSM support works through the runtime and is covered by HAR-backed tests; live
  Overpass tests remain manual/skipped by default.
- Large dataset handling is still GeoJSON-oriented. Arrow/Parquet or tiled
  raster workflows remain future work.
- Higher-level expression helpers for compute are not implemented; use raw WGSL
  bodies through `Compute.gpgpu()`.

## Documentation Map

- `PYTHON_API.md` is the canonical Python API guide and status document.
- `python/README.md` is the package-level quick start.
- `python/examples/README.md` documents runnable examples.
- `PYTHON_API_IMPLEMENTATION.md` is now a compact implementation tracker.
