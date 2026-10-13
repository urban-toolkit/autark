# Niterói — land surface temperature

Explore annual LST (2001–2024) on roads and link a regression scatterplot to selected-road time series.

## Pipeline

1. `data.ts`: load `public/data/niteroi.osm.pbf` and `public/data/niteroi_lst_verao_2001_2024.tif` with `AutkDb`. `config.ts` retains the administrative query (`Rio de Janeiro` / `Niterói`); the PBF contains Rio state geometry and geocode-bbox coastlines, with no runtime Overpass requests.
2. Average each of the 24 raster bands within **1,000 m** of each road's centroid, treating decoded cells as points at their centers. `AutkDb` joins the compact arrays without materializing per-pixel geometries. Assemble a numeric `lst_timeseries` array using SQL; dotted band keys require quoted JSON paths (`$.sjoin.avg."lst.band_1"`).
3. `compute.ts` / `regression.wgsl`: use `ComputeGpgpu` to fit OLS with year indices 0–23. Outputs are `properties.compute.angle` and `properties.compute.intercept`.
4. Convert the numeric series to `{ timestamp, value }` objects for `AutkPlot`'s `reduce-series` transform.
5. `map.ts`: color roads by regression angle or temperature for the selected year. Load the raster as a initially hidden layer and update its band with `updateRaster` (enable it through map layer controls).
6. `plot.ts`: scatterplot of fitted baseline/angle and a reduced time-series linechart for selected roads. `app.ts` synchronizes picking/brushing and cancels obsolete brush timers.

`ui.ts` owns year/mode controls and the draggable plot panel. Supported years and band mapping live in `config.ts`.

## Units and limitations

- Temperature labels assume the raster values are **°C**, as in the original example; verify the dataset metadata before substituting another raster.
- Intercept is the fitted baseline at **2001**, not necessarily that year's observed temperature.
- The shader returns **atan(slope) in degrees**, not the slope in °C/year. This angle is a visualization convention, dependent on the chosen temperature/time units, not a physical spatial angle. The formula has been preserved; labels now describe its actual output.
- The original SQL **replaces absent joined band values with zero**. This policy is retained for compatibility, but can bias regressions. Scientific use requires a deliberate missing-data strategy (valid-sample fitting, filtering or documented imputation).
- Road/raster joins are neighborhood averages, not direct measurements of a road's surface temperature. A 1 km search radius smooths local variation.
- Regression colors use the 2nd–98th percentile domain; annual temperatures use min/max. These domains affect color interpretation, not GPU regression results.

See [workspace instructions and browser checks](../../README.md).
