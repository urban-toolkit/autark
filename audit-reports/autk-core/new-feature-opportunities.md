# `@urban-toolkit/autk-core` new-feature opportunities

## Summary

Core is the right location for deterministic geometry preparation, data validation, and shared provenance contracts. The opportunities below would remove ad hoc logic from map, compute, DB, and plot.

## Evidence basis

Geometry-family inference currently maps every `GeometryCollection` to polygons (`utils-layer.ts:55-60`); triangulator options include mutable global state (`triangulator-points.ts:33-51`, `triangulator-polylines.ts:19`); and tolerant geometry paths warn/skip or return empty buffers (`triangulator-raster.ts:39-44`). Public origins are generally unshaped `number[]` values. These are the concrete gaps behind the analyzer, validated result, coordinate, diagnostic, and deterministic-policy proposals.

## Opportunities

### 1. Recursive geometry-family analyzer — High

Add a utility that returns:

- all geometry families present;
- counts and source feature indices;
- null/empty/unsupported diagnostics;
- whether the collection is homogeneous;
- optional split FeatureCollections by family.

This would replace the current “GeometryCollection means polygons” behavior and duplicate inference in map.

### 2. Validated mesh builder results — High

Return a structured result such as `{ geometry, components, diagnostics, bounds, positionSize }`. Include checks for:

- finite positions;
- valid index ranges and triangle alignment;
- component totals matching geometry;
- feature provenance;
- optional border/UV alignment.

### 3. CRS and local-coordinate primitives — High

Introduce branded or explicit types for geographic coordinates, projected coordinates, local map coordinates, and CRS identifiers. Provide shared origin/transform helpers so DB, map, and compute cannot accidentally mix coordinate spaces.

### 4. Deterministic building fallback policy — Medium

Support configurable height resolution:

- fixed fallback height;
- level-to-height conversion;
- seeded pseudo-random fallback when desired;
- user callback by feature/part;
- diagnostics describing the chosen source.

### 5. Shared provenance IDs — Medium

Define a toolkit-wide provenance shape that supports source feature index, GeoJSON `feature.id`, table/key identity, and aggregation lineage. Map/compute/plot currently rely heavily on array indices or package-specific fields.

### 6. Geometry simplification and level-of-detail utilities — Medium

Offer deterministic simplification, quantization, and mesh LOD generation before GPU upload. Return error bounds and preserve component/provenance mapping.

### 7. Streaming/chunked triangulation — Medium

Provide iterators or chunk callbacks for large collections so callers can limit peak memory, show progress, and cancel long geometry preparation.

### 8. Shared numeric validity masks — Low

Add utilities that produce packed values plus validity masks rather than coercing missing/non-finite values to zero. Compute, map thematic rendering, rasters, and plots can consume the same representation.

## Design constraints

- Default outputs should be deterministic.
- Tolerant processing should return diagnostics rather than write directly to the console.
- Geometry layout and coordinate space must be explicit in public result types.
- Provenance must survive splitting, aggregation, and triangulation.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
