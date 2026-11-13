# Manhattan — provenance views

Explore the March 2025 noise complaints of the 38 Manhattan regions in 24 linked charts, each painting only the part of its marks that a selection produces.

## Pipeline

1. `data.ts`: load the regions (`mnt_neighs_proj_landuse.geojson`, EPSG:3395) and `noise_manhattan_clean.csv`. Each complaint is placed in the region that contains it and stored as `sjoin.collect.noise`. The complaints per day of each region are also kept as a numeric series, `noise_daily` (zero on days without complaints), which `reduce-series` reduces in Try it Yourself; no chart of the page reads it.
2. `map.ts`: render the regions with `AutkMap`, fit the camera to them, and emit the regions picked with a double click. The map highlights whole regions.
3. `plot.ts`: configure the 24 `AutkPlot` charts. The page reducer applies to the aggregating transforms that accept it; the area chart reads a 7-day moving average registered outside the package core (`moving-average.ts`, `registerTransform`).
4. `app.ts`: forward every selection, with the feature shares of aggregating charts, to all the other views and to the map. Each chart then paints only the part of its marks produced by the selected regions, and its provenance path shows the entities the selection reaches at each stage.
5. `ui.ts`: the workspace — chart cards, the toolbox, the transforms drawer, Try it Yourself and the page settings. `catalog.ts` and `icons.ts` hold what the workspace shows about each chart and transform.
6. `lab-transform.ts` / `lab-plot.ts`: Try it Yourself. Code typed in the page is evaluated with `new Function`, checked by `checkTransformReport` (six provenance invariants) or `checkPlot` (six drawing invariants), and drawn only when every invariant holds. The D3 tab also lists the partial view inferred from the geometry of the marks. Templates live in `lab-*-templates.ts`. Besides examples, the D3 tab starts from the code of any of the 24 built-in charts, and the Transform tab from the code of any of the 12 built-in transforms: they are registered with the same functions (`registerPlot`, `registerTransform`) and checked by the same contracts, so a developer's chart or transform is written like them. That code is `lab-builtin-templates.ts`, generated from the package sources by `scripts/lab-templates.mjs` (a test fails when it is out of date); both tabs run it with `d3`, `autk` and `core` in scope (`lab-scope.ts`). A transform is drawn by a chart of the page that reads the shape of its rows.

Every chart is created with `width: 'auto'`: it fills its card and redraws when the card width changes, keeping the selection (a brush rectangle is cleared, the regions it selected stay selected).

`config.ts` holds the plot height, the page filters, the map layer and the dataset paths. There are no HTML inline event handlers; `window.autk` exposes the map and plots for inspection from the console.

## Reading the views

- **Aggregating charts** (N:1, N:N) paint the part of each mark produced by the selected regions: a slice of a bar, an inner sector of a pie, a second line, a narrower Sankey band.
- **One-to-one charts** (1:1) receive, with the selection, the share of each region that the selected marks cover, and paint that share.
- **The filter** keeps, in every chart but not on the map, only the regions that meet its condition (`FILTERS` in `config.ts`: area, or land use): picking an excluded region shows, in each provenance path, the stage where it was lost and why.
- **Transforms** lists the 12 transforms of the package and the moving average this page registers, all registered the same way: each with its label and row shape (from the registry), its relation types, the charts of the page that run it (the table sorts by default), and, for the built-in ones, a button that opens its code in Try it Yourself.

## Units and approximations

- Complaint times are New York local times, carried as UTC fields; days are the UTC days of those values, as in `binning-events`.
- The density and violin charts use an Epanechnikov kernel. With 38 regions the bandwidth is wide, so near the smallest value the curve extends well below it (negative areas), a known boundary effect of kernel density estimates; a brush on the curve reaches every region whose kernel covers the brushed range, often more regions than the range suggests.
- The moving average divides every day by the full window; the first and last days of the month have incomplete windows and read lower.
- A complaint outside every region is dropped; one on a shared border goes to the first region that contains it.
- The inferred partial view recognizes linear and square-root scales through zero; other scales fall back to a glyph with the area of the fraction.
- Try it Yourself runs code in this browser only, like the console. In a project, the same definitions go in files and are registered with `registerTransform` and `registerPlot`.

The datasets come from the Autark gallery. The interface uses Inter (SIL Open Font License 1.1, see `fonts/OFL.txt`).

See [workspace instructions and browser checks](../../README.md).
