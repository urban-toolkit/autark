# Autark Performance Benchmark Report

Generated on: `2026-09-06T14:52:37.144Z` on `darwin arm64`

## Executive Summary

- **Total Views Benchmarked:** 53
- **Success:** 53 | **Warnings:** 0 | **Errors:** 0
- **Average Ready Time:** 1922 ms
- **Median (p50) Ready Time:** 471 ms
- **95th Percentile (p95):** 14276 ms
- **Total Suite Execution Time:** 126.8 s

## Category Breakdown

| Category | Views | Avg Ready (ms) | p50 (ms) | p95 (ms) | Avg Data Size | Success Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **map-osm** | 14 | 557 | 506 | 968 | 0 B | 100% |
| **map-vis** | 16 | 468 | 433 | 865 | 3.3 KB | 100% |
| **map-compute** | 5 | 478 | 471 | 504 | 0 B | 100% |
| **map-spatial-join** | 4 | 513 | 519 | 521 | 0 B | 100% |
| **plot-click** | 6 | 2735 | 430 | 14276 | 23.1 KB | 100% |
| **plot-brush** | 5 | 428 | 428 | 441 | 19.7 KB | 100% |
| **usecase** | 3 | 21191 | 20886 | 30432 | 42.92 MB | 100% |

## Top 5 Slowest Views

| View | App | Category | Ready (ms) | DB/Data (ms) | Render (ms) | Data Transferred |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `usecase-shadows` | usecases | usecase | 30432 | 30302 | 4565 | 575.0 KB |
| `usecase-urbane` | usecases | usecase | 20886 | 20691 | 3133 | 127.95 MB |
| `plot-temporal-events-click` | gallery | plot-click | 14276 | 13634 | 549 | 40.1 KB |
| `usecase-niteroi` | usecases | usecase | 12256 | 0 | 18275 | 237.8 KB |
| `map-osm-layers-api` | gallery | map-osm | 968 | 460 | 145 | 0 B |

## All Benchmark Results

| Status | View ID | App | Category | Nav (ms) | Data (ms) | DB (ms) | Render (ms) | Total Ready (ms) | Memory (MB) |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | `map-building-picking` | gallery | map-osm | 131 | 0 | 306 | 69 | **457** | 14.5 |
| ✅ | `map-camera-animation-vis` | gallery | map-vis | 105 | 0 | 299 | 64 | **424** | 19.6 |
| ✅ | `map-colormap-categorical` | gallery | map-vis | 108 | 0 | 305 | 65 | **433** | 17.4 |
| ✅ | `map-colormap-diverging` | gallery | map-vis | 142 | 0 | 310 | 71 | **472** | 17.4 |
| ✅ | `map-compute-function` | gallery | map-compute | 135 | 0 | 316 | 71 | **471** | 16.3 |
| ✅ | `map-compute-osm-function` | gallery | map-compute | 125 | 0 | 319 | 70 | **464** | 16.3 |
| ✅ | `map-compute-render-osm-sky-exposure` | gallery | map-compute | 149 | 0 | 314 | 72 | **483** | 18.4 |
| ✅ | `map-compute-render-osm-view-score` | gallery | map-compute | 171 | 0 | 313 | 76 | **504** | 19.6 |
| ✅ | `map-compute-render-osm-visibility` | gallery | map-compute | 137 | 0 | 312 | 70 | **469** | 19.6 |
| ✅ | `map-csv-wkt-vis` | gallery | map-vis | 110 | 0 | 306 | 65 | **436** | 14.5 |
| ✅ | `map-geojson-boundaries-vis` | gallery | map-vis | 102 | 0 | 306 | 64 | **428** | 14.5 |
| ✅ | `map-geojson-lines-vis` | gallery | map-vis | 90 | 0 | 303 | 62 | **413** | 15.4 |
| ✅ | `map-geojson-vis` | gallery | map-vis | 80 | 0 | 311 | 62 | **411** | 14.5 |
| ✅ | `map-geotiff-vis` | gallery | map-vis | 101 | 0 | 302 | 63 | **423** | 14.5 |
| ✅ | `map-geotiff-vis-geojson` | gallery | map-vis | 98 | 0 | 306 | 64 | **424** | 14.5 |
| ✅ | `map-heatmap-vis` | gallery | map-vis | 136 | 0 | 317 | 71 | **473** | 14.5 |
| ✅ | `map-heatmap-vis-geojson` | gallery | map-vis | 109 | 0 | 305 | 65 | **434** | 14.5 |
| ✅ | `map-json-wkt-vis` | gallery | map-vis | 177 | 0 | 376 | 86 | **573** | 14.5 |
| ✅ | `map-layer-opacity` | gallery | map-vis | 424 | 0 | 421 | 130 | **865** | 14.5 |
| ✅ | `map-osm-layers-api` | gallery | map-osm | 488 | 0 | 460 | 145 | **968** | 14.5 |
| ✅ | `map-osm-layers-api-chicago` | gallery | map-osm | 147 | 0 | 317 | 73 | **484** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-parks` | gallery | map-osm | 132 | 0 | 313 | 70 | **465** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-s-p` | gallery | map-osm | 139 | 0 | 312 | 71 | **471** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-s-w` | gallery | map-osm | 166 | 0 | 320 | 76 | **506** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-surface` | gallery | map-osm | 303 | 0 | 346 | 100 | **669** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-w-p` | gallery | map-osm | 225 | 0 | 373 | 93 | **618** | 14.5 |
| ✅ | `map-osm-layers-api-manhattan-water` | gallery | map-osm | 239 | 0 | 335 | 89 | **594** | 14.5 |
| ✅ | `map-osm-layers-api-multi` | gallery | map-osm | 224 | 0 | 317 | 84 | **561** | 14.5 |
| ✅ | `map-osm-layers-api-niteroi` | gallery | map-osm | 162 | 0 | 323 | 76 | **505** | 14.5 |
| ✅ | `map-osm-layers-api-paris` | gallery | map-osm | 164 | 0 | 336 | 78 | **520** | 14.5 |
| ✅ | `map-osm-layers-api-workspaces` | gallery | map-osm | 159 | 0 | 326 | 76 | **505** | 14.5 |
| ✅ | `map-osm-layers-pbf` | gallery | map-osm | 140 | 0 | 314 | 71 | **474** | 14.5 |
| ✅ | `map-spatial-join` | gallery | map-spatial-join | 179 | 0 | 322 | 78 | **521** | 17.4 |
| ✅ | `map-spatial-join-buildings` | gallery | map-spatial-join | 165 | 0 | 332 | 78 | **517** | 14.5 |
| ✅ | `map-spatial-join-multi` | gallery | map-spatial-join | 150 | 0 | 323 | 74 | **493** | 14.5 |
| ✅ | `map-spatial-join-near` | gallery | map-spatial-join | 172 | 0 | 327 | 78 | **519** | 14.5 |
| ✅ | `map-standalone-geojson-vis` | gallery | map-vis | 93 | 13 | 28 | 338 | **459** | 9.5 |
| ✅ | `map-standalone-points-geojson-vis` | gallery | map-vis | 63 | 15 | 9 | 329 | **400** | 9.5 |
| ✅ | `map-terrain-layers-niteroi` | gallery | map-vis | 97 | 0 | 303 | 63 | **420** | 14.5 |
| ✅ | `plot-barchart-click` | gallery | plot-click | 89 | 17 | 45 | 339 | **473** | 11.3 |
| ✅ | `plot-heatmatrix-click` | gallery | plot-click | 69 | 14 | 38 | 323 | **430** | 11.3 |
| ✅ | `plot-histogram-brush` | gallery | plot-brush | 69 | 14 | 27 | 337 | **433** | 11.3 |
| ✅ | `plot-histogram-brush-landuse` | gallery | plot-brush | 77 | 15 | 30 | 335 | **441** | 11.3 |
| ✅ | `plot-histogram-rebuild` | gallery | plot-brush | 67 | 15 | 37 | 324 | **428** | 11.3 |
| ✅ | `plot-parallel-coordinates` | gallery | plot-brush | 60 | 15 | 54 | 311 | **425** | 11.3 |
| ✅ | `plot-scatterplot-brush` | gallery | plot-brush | 62 | 14 | 21 | 332 | **415** | 11.3 |
| ✅ | `plot-scatterplot-click` | gallery | plot-click | 62 | 13 | 20 | 333 | **415** | 11.3 |
| ✅ | `plot-table-click` | gallery | plot-click | 62 | 13 | 18 | 350 | **430** | 11.3 |
| ✅ | `plot-temporal-events-click` | gallery | plot-click | 93 | 743 | 13634 | 549 | **14276** | 20.7 |
| ✅ | `plot-timeseries-click` | gallery | plot-click | 46 | 8 | 23 | 317 | **385** | 11.3 |
| ✅ | `usecase-urbane` | usecases | usecase | 175 | 6393 | 20691 | 3133 | **20886** | 1020.4 |
| ✅ | `usecase-shadows` | usecases | usecase | 110 | 18082 | 30302 | 4565 | **30432** | 18.4 |
| ✅ | `usecase-niteroi` | usecases | usecase | 185 | 7010 | 0 | 18275 | **12256** | 22 |
