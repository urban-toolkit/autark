# Chicago — road shadows

Compare a monthly shadow baseline with a selected building's estimated contribution to road shadowing.

## Pipeline

1. `data.ts`: load `public/data/shadows-chicago.osm.pbf` for Loop/Near South Side and `public/data/shadows_chicago.csv`. `config.ts` retains the Chicago administrative query; all required OSM geometry is read from the PBF, with no runtime Overpass requests. Lake Michigan is explicit OSM water, not marine coastline.
2. `split-roads.sql`: divide LineStrings into segments no longer than **20 m**, using workspace planar coordinates. Each segment receives a stable `geojson_id` (`road/<OSM way ID>/segment/<index>`); the original `id` and source attributes are preserved. Reusing the original way ID as every segment's feature ID would make thematic matching ambiguous.
3. Average monthly measurements within **200 m** of each segment's centroid. After all monthly joins succeed, delete the temporary `shadows` measurement layer so its points are not rendered. Joined values remain on the road segments for map, plot, and compute use. Month/day-of-year/label configuration is defined once in `utils.ts`.
4. `map.ts`: render the layers and emit building selections. Building layers enable `loadConfig.buildingsZeroHeight` so buildings without height metadata remain visible. The original unsegmented roads are not rendered.
5. `compute.ts` / `shadow.wgsl`: send segment coordinates, monthly baseline, footprint and height to `ComputeGpgpu`; output shadow minutes and percentage contribution.
6. `app.ts`: merge results into `properties.compute` only if they belong to the current building/month. Deselecting or selecting invalid geometry clears previous results.
7. `plot.ts`: show the **monthly baseline**, independent of the chosen analytical display mode; brushing highlights road segments.

`ui.ts` owns the month selector, display radios and draggable histogram. There are no HTML inline event handlers or exported window globals.

## Units and approximations

- GPU shadow time is an **hourly-sampled estimate in minutes**: each intersecting sample contributes 60 minutes. The shader searches daylight over hours 5–21 and excludes boundary hours; it is not continuous integration or a fixed 07:00–19:00 simulation.
- The baseline CSV lacks unit metadata. The histogram therefore labels these as **dataset units**, rather than asserting hours. Percentage contribution assumes baseline values are also minutes; verify provenance before interpreting those percentages scientifically.
- A selected building uses its largest outer polygon ring and the maximum available part height. Those can originate from different parts. Missing height falls back to 20 m for shadow calculations (levels are approximated as 3 m each). For visualization, `buildingsZeroHeight` uses the triangulator's existing random fallback heights, not measured or literal zero heights; explicitly zero or invalid heights remain excluded. Visual fallback heights can differ from the 20 m calculation assumption.
- The shadow footprint uses a shadow-aligned bounding box, not an exact polygon union. Polygon holes, other buildings and partial street coverage are not modeled.
- Solar latitude/longitude and reference meridian are hard-coded for Chicago. Seasonal daylight-saving/time conventions are not separately modeled.
- Compute preserves feature order/count; selections and result merging use feature indices, not persistent OSM identifiers. Count mismatches are rejected.

See [workspace instructions and browser checks](../../README.md).
