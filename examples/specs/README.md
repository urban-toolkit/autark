# Autark Spec Examples

This directory contains hand-authored JSON specifications for the AutarkSpec v0.1 format. These examples were created to validate the schema design before implementing the TypeScript runtime and Python API.

## Purpose

These examples serve multiple purposes:

1. **Schema validation** - Identify missing fields, inconsistencies, or unclear semantics
2. **Runtime design** - Guide the implementation of `AutarkRuntime.fromSpec()`
3. **Python API design** - Inform what the Python builders need to generate
4. **Documentation** - Provide reference implementations for users

## Examples

### 01-basic-osm-map.json

**Purpose:** Simplest possible example - load OSM data and render it on a map.

**Features demonstrated:**
- OSM data source with Overpass API
- Multiple OSM layers (buildings, roads)
- Map view with camera configuration
- Color encoding based on building height
- Linear color scale with Viridis scheme
- Layer styling (opacity, color, width)

**Key design questions exposed:**
- How are OSM sub-layers referenced? (e.g., `manhattan_osm.buildings`)
- What are valid layer type values? (`buildings`, `roads`, `polygons`, etc.)
- What camera parameters are required vs optional?
- What encoding types are supported? (field-based vs value-based)

### 02-linked-map-histogram.json

**Purpose:** Demonstrate coordinated views with selection and linking.

**Features demonstrated:**
- Map view
- Histogram plot view
- Interval selection on histogram
- Link from selection to map layer (highlight action)
- Vertical layout composition

**Key design questions exposed:**
- How are selections defined? (name, type, fields)
- How are links specified? (selection name, target layer id, action)
- What are valid link actions? (`highlight`, `filter`, `focus`)
- How does selection propagate across views?
- What is the layout model?

### 03-spatial-join.json

**Purpose:** Demonstrate spatial data transformation and multi-source composition.

**Features demonstrated:**
- GeoJSON data source (neighborhoods)
- CSV data source with lat/lng geometry (trees)
- Spatial join transform with aggregation
- Count aggregation
- Collect aggregation (for species)
- Thematic mapping of join results
- Multiple layers on one map (polygons + points)
- Filter action for linked selection

**Key design questions exposed:**
- How are transforms named and referenced?
- What is the output of a spatial join? (new data source?)
- How are join results accessed? (`properties.sjoin.count.tree_count`)
- Can transforms reference other transforms?
- How are CSV geometry specifications structured?
- What aggregation operations are supported?
- How are point layers styled?

## ✅ Executable Conventions (Locked 2026-06-07)

**All examples have been updated to use runtime-executable syntax.** These conventions are locked for MVP implementation.

### 1. OSM Sub-Layer Table Naming
Use underscore concatenation: `${name}_${layer}`

```json
{"data": [{"type": "osm", "name": "chicago_osm", "layers": ["buildings"]}],
 "views": [{"layers": [{"source": "chicago_osm_buildings"}]}]}
```

### 2. Transform Mutation Semantics (MVP)
Spatial joins mutate root table in place. Reference root table after transform.

```json
{"transforms": [{"type": "spatialJoin", "root": "neighborhoods", "join": "trees"}],
 "views": [{"layers": [{"source": "neighborhoods"}]}]}
```

### 3. Field Path Normalization
- **Map encodings:** Use full paths (`properties.height`)
- **Plot fields:** Use property names only (`height`)

```json
{"views": [
  {"type": "map", "layers": [{"encoding": {"color": {"field": "properties.height"}}}]},
  {"type": "histogram", "x": {"field": "height"}}
]}
```

### 4. Link Target Semantics
Links target **layer IDs**, not data sources.

```json
{"links": [{"selection": "height_brush", "target": "buildings_layer"}]}
```

### 5. Schema Key
Use `"$schema"` (JSON Schema standard).

### 6. Data File References
Examples use placeholder paths. Runtime tests will point to actual fixtures.

---

## Design Resolution Summary

All major design questions raised by these examples have been resolved and locked as executable conventions:

1. **OSM layer references** → Use `${name}_${layer}` (e.g., `manhattan_osm_buildings`)
2. **Transform outputs** → Mutate root table in place for MVP
3. **Field paths** → Full paths for maps (`properties.height`), short for plots (`height`)
4. **Link targets** → Layer IDs, not data sources
5. **Link actions** → `highlight` for MVP, `filter` deferred
6. **Layout** → Simple vertical/horizontal for MVP, composition operators post-MVP

See [PYTHON_API_IMPLEMENTATION.md](../../PYTHON_API_IMPLEMENTATION.md) "Locked Executable Spec Conventions" for full details.

## Schema Gaps Identified

Based on these examples, the JSON Schema needs:

### Required Types
- [x] Top-level `AutarkSpec`
- [x] `Metadata` object
- [x] `Workspace` object
- [x] Data sources: `OsmDataSpec`, `GeoJsonDataSpec`, `CsvDataSpec`
- [x] Transform: `SpatialJoinSpec` with aggregation options
- [x] Views: `MapViewSpec`, `HistogramSpec`
- [x] `MapLayerSpec` with encoding and style
- [x] `EncodingSpec` with field/value variants
- [x] `ScaleSpec` with type and scheme
- [x] `SelectionSpec`
- [x] `LinkSpec`
- [x] `LayoutSpec` (basic)

### Missing Specifications
- [ ] Camera configuration details (pitch, bearing, zoom ranges)
- [ ] Complete list of valid layer types
- [ ] Complete list of valid color schemes
- [ ] Scale domain strategy options
- [ ] Link action semantics
- [ ] Error handling configuration
- [ ] Loading strategy options (for future)

### Validation Rules
- [ ] Data source names must be unique
- [ ] Transform names must be unique
- [ ] Layer ids must be unique within a map
- [ ] Selection names must be unique
- [ ] Link targets must reference existing layers or data sources
- [ ] Field references must be valid property paths

## Next Steps

1. **Create JSON Schema** - Define `autark-spec-v0.1.json` based on these examples
2. **Validate examples** - Ensure all three examples validate against the schema
3. **Implement runtime** - Build `AutarkRuntime.fromSpec()` to execute these specs
4. **Fix transform semantics** - Add `outputTableName` support to `spatialQuery()`
5. **Build Python API** - Create builders that generate equivalent JSON
6. **Add more examples** - Scatterplot, multiple selections, etc.

## Notes

- All examples use `"version": "0.1"` and reference schema at `https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json`
- Examples use realistic URLs/paths but don't include actual data files yet
- Examples focus on MVP features only (no compute, no GeoTIFF, no advanced layouts)
- Examples intentionally expose design ambiguities that need resolution
