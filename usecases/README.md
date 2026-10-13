# Autark case studies

Three complete, browser-based examples demonstrating the published Autark workspace packages:

- [Niterói](src/niteroi/README.md): temperature regression and linked plots.
- [Shadows](src/shadows/README.md): per-building shadow estimation on road segments.
- [Urbane](src/urbane/README.md): weighted urban indicators and neighborhood/building drill-down.

## Run

From the repository root, install dependencies (`make install`) and run:

```sh
make dev APP=usecases
# Or open one case directly:
make dev APP=usecases OPEN=/src/niteroi/main.html
```

Use a WebGPU-enabled browser (Chrome/Edge), with localhost or HTTPS. All three examples load their OSM data from bundled PBF files in `public/data`; none queries Overpass or OSM geocoding during loading. Raster/CSV/GeoJSON inputs are local too. Library runtime resources (for example DuckDB WASM/extensions) may still require network access unless separately cached/hosted. The active PBF preparation scripts are [`scripts/prepare-usecase-pbf.sh`](scripts/prepare-usecase-pbf.sh) (Niterói/Chicago) and [`scripts/regenerate-manhattan-administrative-pbf.sh`](scripts/regenerate-manhattan-administrative-pbf.sh) (Manhattan); they require complete regional source extracts. OSM data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under ODbL; regional sources supplied by Geofabrik and BBBike.

## Read the code

Each app follows the same boundaries:

| File | Responsibility |
| --- | --- |
| `main.ts` | Browser entrypoint, initial loading/error handling |
| `app.ts` | Pipeline orchestration, state and linked map/plot interactions |
| `data.ts` | `AutkDb` loading, SQL and spatial joins |
| `compute.ts` | `AutkCompute` configuration and result preparation |
| `map.ts` | `AutkMap` layers, thematic styling and picking |
| `plot.ts` | `AutkPlot` construction, updates and selection |
| `ui.ts` | DOM controls and draggable/toggleable panels |
| `*.wgsl`, `*.sql` | Analytical shaders and standalone SQL, where applicable |
| `config.ts` / `utils.ts` | Case-specific settings and data transformations |

Start with `app.ts` to follow the workflow; open the corresponding module to see a specific Autark API. `map.ts` and `plot.ts` do not import each other. Data/compute modules do not access the DOM. Only small DOM utilities are shared in `src/shared/`; analytical workflows remain visible in each example.

## Verify

From the repository root:

```sh
npm test -- usecases/test
./node_modules/.bin/tsc -p usecases/tsconfig.json --noEmit
./node_modules/.bin/eslint usecases
npm run build --workspace=usecases
npm run preview --workspace=usecases
```

Production builds include the index and all three `src/<case>/main.html` pages. Local datasets are copied from `public/data`. Relative page links and Vite's `BASE_URL` support deployment under a configured base path.

Tests cover pure data preparation, orchestration using mocked Autark facades, and real loading of Urbane's local administrative PBF through DuckDB. PBF tests check all three local datasets, reject unexpected remote OSM requests, and verify geocode-wide coastal classification, geographic scope and representative land/water probes. Tests do not validate real GPU execution or remote data availability.

### Browser smoke checklist

Run against **preview**, not just the dev server:

1. Open each case from the index; loading must complete and no uncaught errors should appear.
2. Niterói: switch years and regression-angle mode; brush the scatterplot, then pick a road before the debounce completes. The linechart must follow the latest selection.
3. Shadows: select buildings rapidly, change months and switch all three modes. Results must follow the latest building/month. Clear the selection and verify computed values reset. Brush the monthly histogram to highlight roads.
4. Urbane: select a neighborhood in the map/table/parallel coordinates, drill into buildings, recompute weights and return. Neighborhoods must be visible/selectable initially and after returning.
5. On a failed interaction, show an error and restore controls so it can be retried; initial loading failures may keep the loading overlay visible.
6. Toggle/drag panels and check browser resizing. Map controls supplied by Autark remain available.

For reproducible GPU/integration tests, prefer small fixed datasets rather than live Overpass responses. No GPU/browser smoke result is implied by the unit tests.
