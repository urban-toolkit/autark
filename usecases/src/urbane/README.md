# Urbane — urban analytics dashboard

Rank Manhattan neighborhoods/buildings using weighted indicators and approximate road sky exposure.

## Pipeline

1. `data.ts`: load `mnt-administrative-geocode-coastlines.osm.pbf`, `mnt_neighs.geojson` and seven `*_manhattan_clean.csv` files from `public/data`. OSM loading uses `geocodeArea: 'New York'` and `areas: ['Manhattan']`, configured in `config.ts`. Both names refer to complete `boundary=administrative` relations in the regional-snapshot PBF, which also retains coastlines across the New York City bbox.
2. Use `AutkDb.spatialQuery` to count/normalize points per neighborhood and attach neighborhood matches to buildings under `properties.sjoin.matches[].properties.ntaname`.
3. `compute.ts`: run `ComputeRender` from road viewpoints, treating the background as the sky class. Store the visible sky fraction as `compute.skyViewFactor` and persist roads back to the DB.
4. Average/normalize road sky fractions per neighborhood. Prepare score inputs from normalized counts and sky exposure, invert arrest/noise inputs, and run a weighted sum in `ComputeGpgpu`.
5. `map.ts` renders neighborhoods/roads/buildings. `plot.ts` creates a linked table and parallel-coordinates plot. `app.ts` coordinates their selections.
6. Drill-down derives `active_buildings` by checking those nested matches against the selected neighborhood names, retaining each building once even when it matches multiple selected neighborhoods. It counts nearby points within **300 m** of building centroids, joins nearby road sky exposure, and recomputes scores. The map and linked plots receive the same selected building collection.
7. Recompute weights in place; drill-up removes the derived buildings layer and restores neighborhood selection.

`config.ts` defines datasets/default weights. `ui.ts` creates sliders and controls, awaits operations, reports interaction errors and restores controls in `finally`. The app also rejects overlapping asynchronous operations; failed data/compute loading does not prematurely change the current level or weights.

## Interpretation and limitations

- The area of interest is **Manhattan borough** (OSM relation **8398124**, `admin_level=7`), scoped inside **New York City** (relation **175905**, `admin_level=5`). This is an administrative territory, not just the geographic `Manhattan Island`: other islands and Marble Hill belonging to the borough can legitimately appear.
- The completed administrative PBF replaces the bounding-box workaround. Neighboring boroughs/New Jersey are not additional areas of interest. Roads, parks and water are clipped to the surface; building parts outside or only partially contained in it are discarded without cutting their geometry. Grouped buildings retain their contained parts with updated indices. Fully contained buildings are left untouched to avoid expanding/rebuilding the entire city dataset in DuckDB-Wasm memory.
- Only the active PBF is served from `public/data`; inactive Manhattan extracts were removed. Regeneration uses `scripts/regenerate-manhattan-administrative-pbf.sh` with a complete regional source.
- Coastline reconstruction uses the geocode bbox, independently of borough thematic extraction. The same PBF includes neighboring shores and islands, so the DB can classify all land before calculating water as the Manhattan bbox minus that land. This generated coastal context is marked `properties.generated = 'coastline'`; it can appear outside the administrative polygon but is bounded by its bbox and is not used by the scoring workflow. Explicit OSM lakes/rivers remain in the water layer. Missing or invalid coastal classification warns and never generates presumed sea.
- Area-layer clipping discards linear fragments (including linear channel centerlines). Otherwise the polygon renderer could fill those lines and paint water across island land; the real-data regression checks this and keeps representative Roosevelt/Randall’s Island points dry.
- The active PBF uses one coherent BBBike regional OSM snapshot for administrative geometry, thematic data and coastlines, rather than combining old themes with live boundary/water repairs. Older derived files are preserved but inactive. OSM represents administrative boundaries but is not a legally authoritative government source.

- Score is a **weighted sum**, not automatically divided by the sum of weights. UI weights are limited to a total of at most 1; the default dataset weights sum to 1 and sky exposure starts at 0.
- Counts are shown in map/plots, while normalized counts feed the score. Normalization is relative to each queried collection, so neighborhood and building scores are not directly comparable.
- Missing inputs default to zero; after inversion this means missing arrest/noise becomes 1. This is retained from the original model and should be reconsidered for scientific use.
- The sky metric uses one sampled direction and a 64 px render tile. It is an approximate visible-sky class fraction, not a validated hemispherical sky-view factor.
- Neighborhood exposure averages intersecting roads; building exposure averages roads within 300 m of centroids. These are proxies, not direct exposure calculations on building surfaces.
- Selections use feature indices. Recomputing a score clears linked selections to avoid stale selection state.
- All weights must be finite and non-negative, with one value per dataset plus sky exposure.

See [workspace instructions and browser checks](../../README.md).
