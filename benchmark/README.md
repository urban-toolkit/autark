# Autark Performance Benchmark Suite

A modular Playwright-based performance benchmark harness for measuring data ingestion, database processing, geometry triangulation, and WebGPU rendering latencies across all Autark visual analytics views.

## Standardized SpatialBench Alignment

This benchmark suite implements the mathematical distributions and query specifications from the [Apache Sedona SpatialBench](https://sedona.apache.org/spatialbench/) standard:

- **Point Distributions**: [Hierarchical Thomas Cluster Process](https://sedona.apache.org/spatialbench/spatialbench-distributions/) modeling realistic urban trip and event concentrations.
- **Polygon Footprints**: [SpiderWeb](https://github.com/apache/sedona-spatialbench/blob/main/spatialbench-cli/CONFIGURATION.md) procedural non-convex building footprints with log-normal height distributions.
- **Spatial Queries**: DuckDB-WASM execution of SpatialBench standardized queries (Q1 distance join via `ST_DWithin`, Q2 point-in-polygon via `ST_Intersects`, and Q3 convex hull area aggregation).

## Features

- **Standardized Synthetic Data Generation**: Generates reproducible urban datasets (SpatialBench Star Schema trips/buildings/zones, GeoJSON polygons, 3D extruded buildings, road polylines, sensor points, tabular CSVs with WKT/coordinates, GeoTIFF rasters, and valid OpenStreetMap Overpass API payloads).
- **Coverage of All Existing Views**: Benchmarks all 53 views across `@urban-toolkit/autk-map` gallery (39 views), `@urban-toolkit/autk-plot` gallery (11 views), and IEEE VIS use case applications (3 use cases: Urbane, Shadows, Niteroi).
- **Accurate Granular Timing**: Deconstructs performance into:
  - Navigation & DOM initialization time
  - Data transfer & payload byte volume
  - DuckDB-WASM ingestion & spatial query duration
  - Geometry triangulation & GPU buffer creation
  - WebGPU render submission & first frame ready time
  - Peak JS heap memory usage
- **Multiple Output Formats**:
  - Colored CLI terminal summary with percentile stats (p50, p95) and bottleneck diagnostics
  - `benchmark/results/benchmark-report.json`
  - `benchmark/results/benchmark-report.md`
  - `benchmark/results/benchmark-report.html` (interactive web dashboard)

## Quick Start

### Run the complete benchmark suite (All 53 views + SpatialBench + Scaling)
```bash
make benchmark
```
or via npm:
```bash
npm run benchmark
```

### Run standardized SpatialBench query suite
```bash
make benchmark-spatialbench
```
or via npm:
```bash
npm run benchmark:spatialbench
```

### Run only view benchmarks
```bash
make benchmark-views
```
or via npm:
```bash
npm run benchmark:views
```

### Run synthetic data scaling benchmarks
```bash
make benchmark-synthetic
```
or via npm:
```bash
npm run benchmark:synthetic
```

## Architecture

- `src/generators/`: Synthetic GeoJSON, CSV, JSON, GeoTIFF, and SpatialBench data generators.
- `src/registry/`: Strongly-typed view catalog covering all 53 gallery and use case views.
- `src/mock/`: Route interceptor serving SpatialBench datasets without external network overhead.
- `src/metrics/`: Client performance harness and CDP metrics collector.
- `src/reporter/`: Multi-format report generators (CLI, Markdown, JSON, HTML dashboard).
- `src/direct/`: In-memory SpatialBench query runner and WebGPU triangulation scaling benchmarks.
- `tests/`: Playwright test specs (`views.spec.ts`, `spatialbench.spec.ts`, `synthetic-scaling.spec.ts`).

## References
- [Apache Sedona SpatialBench](https://sedona.apache.org/spatialbench/)
- [SpatialBench Data Distributions](https://sedona.apache.org/spatialbench/spatialbench-distributions/)
- [Sedona SpatialBench Repository](https://github.com/apache/sedona-spatialbench)
