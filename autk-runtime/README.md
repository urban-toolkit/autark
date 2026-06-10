# @urban-toolkit/autk-runtime

Runtime for executing declarative **AutarkSpec** specifications.

## Overview

The Autark runtime takes a JSON specification and executes it to create fully interactive urban visual analytics applications. This enables:

- **Declarative workflows**: Define urban VA apps in JSON instead of imperative code
- **Python API**: Generate specs from Python (via `autark` package)
- **Agentic coding**: LLMs can generate specs more reliably than imperative code
- **Reproducibility**: Specs are portable and version-controlled

## Installation

```bash
npm install @urban-toolkit/autk-runtime
```

## Usage

### From TypeScript/JavaScript

```typescript
import { AutarkRuntime } from '@urban-toolkit/autk-runtime';

const spec = {
  $schema: 'https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json',
  version: '0.1',
  data: [
    {
      type: 'osm',
      name: 'manhattan',
      area: 'Manhattan, New York',
      layers: ['buildings']
    }
  ],
  views: [
    {
      type: 'map',
      layers: [
        {
          source: 'manhattan_buildings',
          encoding: {
            color: { field: 'properties.height' }
          }
        }
      ]
    }
  ]
};

const runtime = await AutarkRuntime.fromSpec(spec, {
  container: document.getElementById('app')
});
```

### From Python

```python
import autark as ak

view = (
    ak.Spec()
    .data(ak.OSM("manhattan", area="Manhattan, New York", layers=["buildings"]))
    .views([
        ak.Map().layer(
            ak.Layer("manhattan_buildings").encode(color="properties.height")
        )
    ])
)

view.show()  # Generates spec and embeds runtime in Jupyter
```

## Architecture

The runtime follows a structured execution pipeline:

1. **Validate**: Check spec against JSON Schema
2. **Verify references**: Ensure data sources, selections, and targets exist
3. **Initialize database**: Create AutkDb instance with workspace
4. **Load data**: Execute OSM/GeoJSON/CSV loaders
5. **Execute transforms**: Run spatial joins and other operations
6. **Create layout**: Generate DOM structure
7. **Render views**: Create maps and plots
8. **Connect links**: Wire up cross-view selections

## API

### AutarkRuntime

Main runtime class.

#### `AutarkRuntime.fromSpec(spec, options)`

Execute a specification.

**Parameters:**
- `spec: AutarkSpec` - The specification to execute
- `options?: RuntimeOptions`
  - `container?: HTMLElement | string` - DOM container
  - `validate?: boolean | 'strict'` - Validation mode (default: true)
  - `onError?: 'throw' | 'warn' | 'silent'` - Error handling (default: 'throw')
  - `onProgress?: (message, percent?) => void` - Progress callback

**Returns:** `Promise<AutarkRuntime>`

#### `runtime.getDb()`

Get the AutkDb instance.

#### `runtime.getMap(name?)`

Get a map view by name (or first map if no name).

#### `runtime.getPlot(name?)`

Get a plot view by name (or first plot if no name).

#### `runtime.destroy()`

Clean up all resources.

### SpecValidator

JSON Schema validator for specs.

#### `validator.validate(spec)`

Validate a spec. Throws `SpecValidationError` if invalid.

#### `validator.isValid(spec)`

Check if spec is valid (returns boolean).

## Locked Conventions (v0.1 MVP)

### OSM Table Naming

OSM data sources generate tables as `${name}_${layer}`:

```json
{
  "data": [{"type": "osm", "name": "chicago", "layers": ["buildings", "roads"]}]
}
```

Creates tables: `chicago_buildings`, `chicago_roads`

### Transform Mutation Semantics

Spatial joins **mutate the root table in place** (MVP):

```json
{
  "transforms": [
    {"type": "spatialJoin", "root": "neighborhoods", "join": "trees"}
  ],
  "views": [
    {"layers": [{"source": "neighborhoods"}]}  // Use root table
  ]
}
```

### Field Paths

- **Map encodings**: Use full paths (`properties.height`)
- **Plot fields**: Use property names (`height`)

```json
{
  "views": [
    {"type": "map", "layers": [{"encoding": {"color": {"field": "properties.height"}}}]},
    {"type": "histogram", "x": {"field": "height"}}
  ]
}
```

### Link Targets

Links target **layer IDs**, not data sources:

```json
{
  "views": [
    {"type": "map", "layers": [{"source": "buildings", "id": "buildings_layer"}]}
  ],
  "links": [
    {"selection": "brush", "target": "buildings_layer", "action": "highlight"}
  ]
}
```

## Status

**Version:** 0.1.0 (MVP)

**Implemented:**
- ✅ JSON Schema validation
- ✅ Reference integrity validation
- ✅ Execution pipeline structure
- ✅ Data source loaders (OSM, GeoJSON, CSV)
- ✅ Spatial join transform
- ✅ Map and histogram views (stubs)
- ⚠️ View rendering (partial - needs completion)
- ⚠️ Link management (stub only)

**Not Yet Implemented (Post-MVP):**
- GeoTIFF support
- Heatmap transform
- Scatterplot view
- Filter link action
- Layout composition operators (hconcat/vconcat)
- Expression-language compute
- Render compute
- anywidget bidirectional communication

## Development

Build the package:

```bash
npm run build
```

Watch mode:

```bash
npm run watch
```

## License

MIT
