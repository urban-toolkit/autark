# PR #125 integration: gallery validation report

Date: November 11, 2026. Local branch: `fix/pr-125-raster-integration`.

This integrates PR #125 on current main, fixes the review findings, and preserves PR #124's rendering/camera behavior. This document is a validation checklist, not a claim that every gallery page has been manually exercised.

## What changed and what to expect

- Geometry-less rasters use the same collection-bounds resolver for origin, fitting, and raster quad geometry, including declared 2D and 3D bboxes. Geometry still takes precedence; the geometry-only bounding-box API retains its old behavior.
- RGB data has an explicit layer mode and loading path. Scalar domains/labels, legends, and palette controls are suppressed for RGB, and the previous scalar legend preference returns when switching back.
- Every RGB channel must match the existing layer grid. Invalid dimensions, missing channels, and invalid ranges preserve the previous image and mode and log a warning.
- Automatic stretching uses only complete, finite RGB pixels. Partially missing pixels stay transparent and cannot distort visible contrast. Normalized 0–1 imagery explicitly uses `[0, 1]`; it is not guessed from numeric values.
- Geometry-less GeoTIFF exports retain their own extent through `getLayer`; the original `getRaster` path remains supported. A raster that previously stretched across a workspace can intentionally have a different footprint now. Validate against its own data extent rather than preserving that old distortion.
- `geotiff-vis` now exercises `getLayer` for the raster. `geotiff-vis-geojson` retains the legacy `getRaster` path.
- Building/terrain physical depth, 2D layer order, scalar color calculations, picking policy, and ordinary camera behavior are preserved. Loading still does not automatically fit the camera.

## Start the gallery

From the repository root:

```sh
make dev APP=gallery OPEN=/src/autk-map/raster-rgb.html
```

Use the localhost URL printed by Vite. Links below assume port 5173; substitute its actual port if another development server is running. Use a WebGPU-enabled Chrome or Edge, keep DevTools Console/Network open, and reload after rebuilding packages if using an existing dev session. For each page, check that initialization completes without uncaught errors or WebGPU validation errors. Exercise pan/zoom and the page's own controls. Network/Overpass/geocoding failures must be distinguished from rendering regressions.

Priority P0 is direct raster validation; P1 covers the shared-core, rendering, controls, and camera regression surface; P2 completes the OSM, compute, and linked-plot smoke sweep. All three groups together cover every HTML example under `gallery/src`.

## P0: exact steps for the new RGB example

Open [RGB raster and scalar transitions](http://localhost:5173/src/autk-map/raster-rgb.html). It uses local synthetic arrays, no database or external datasets.

1. Initial RGB: see red, green, blue, and white quadrants around a transparent center showing the gray map background. The complete rectangle is fitted. Status origin should be `300480, 700320`; no scalar legend is visible.
2. Open the map layer menu: the imagery palette control is disabled while RGB is active; visibility still works.
3. Select **Reflectance + masked outlier**: colors and visible contrast should match RGB bytes; the no-data center remains transparent despite its large invisible channel values.
4. Select **Normalized RGB [0, 1]**: colors should match RGB bytes, rather than becoming nearly black.
5. Select **Scalar band + legend**: a scalar ramp and its legend appear; its palette control is available. Change the palette/legend preference if desired.
6. Select **RGB bytes** again: scalar legend disappears and the palette control is disabled. Return to scalar to verify its prior legend preference and scalar styling are restored. The scalar button enables the legend on its first use; later switches preserve the saved preference.
7. In both RGB and scalar modes, select **Reject wrong dimensions** and **Reject invalid range**. Each logs one expected warning. The current image, mode, and legend remain unchanged.
8. Move opacity from 1 to 0 and back: the image fades toward the map background in both modes. No-data pixels remain transparent.
9. Pan/zoom, resize the window, and select **Fit / reset** or press `r`: the entire raster is framed again. No vector layer is needed to establish the origin or bounds.

## P0: existing raster/terrain checks

- **GeoTIFF raster:** wait for OSM and DEM loading. Toggle the raster and vector layers independently. Coastline/streets should align with the DEM, which must retain its own extent even though OSM loaded first. Scalar palette and legend remain available. A resampling warning is expected only if the source exceeds the configured cell limit.
- **Raster and vector layers:** compare with the previous example using the direct `getRaster` export. DEM extent and scalar appearance remain correct; GeoJSON polygons retain their geometry-derived origin.
- **Both heatmaps:** verify the expected pattern, 0.5 layer opacity, scalar palette/legend behavior, and transparent low/no-data areas. These exercise the scalar and transfer-function path that RGB must not change.
- **Terrain layers:** navigate the terrain, check draped roads/surface and building placement/occlusion. Terrain uses actual elevation; RGB support must not flatten it or change its camera path.

## Complete gallery checklist

The inventory below is checked against all HTML example files, including pages such as `render-sizing` that may not be linked from the gallery index. Asset names are detected from each entry module; helper-generated/dynamic data and server-side DuckDB extensions can add dependencies. A locally present file is not a guarantee that its source service is available.

| Priority | Example | What to validate | Data/services |
| --- | --- | --- | --- |
| P1 | [building-hiding](http://localhost:5173/src/autk-map/building-hiding.html) | Pick buildings, hide selected buildings, verify they cannot be picked, then restore them; borders/other layers remain intact. | `lower_mnt.osm.pbf`; geocoding for named areas; local PBF |
| P1 | [building-picking](http://localhost:5173/src/autk-map/building-picking.html) | Enable/select buildings, double-click visible roofs/walls, inspect the selection panel, and clear selection; picking remains aligned with geometry. | OSM/geocoding services |
| P1 | [camera-animation-vis](http://localhost:5173/src/autk-map/camera-animation-vis.html) | Run the existing camera/scene sequence; targets remain centered, transitions complete, and manual navigation still works. | `mnt_neighs.geojson`, `noise.csv`, `noise_manhattan_clean.csv`; OSM/geocoding services |
| P1 | [colormap-categorical-numeric](http://localhost:5173/src/autk-map/colormap-categorical-numeric.html) | Verify numeric categories retain discrete colors and labels instead of a continuous gradient; picking still highlights. | `mnt_roads.geojson` |
| P1 | [colormap-categorical](http://localhost:5173/src/autk-map/colormap-categorical.html) | Display categorical roads, toggle the palette/legend, and pick features; category colors and labels remain consistent. | `mnt_roads.geojson` |
| P1 | [colormap-diverging](http://localhost:5173/src/autk-map/colormap-diverging.html) | Verify the diverging ramp, center value, endpoint labels, and vector legend are unchanged. | `mnt_neighs.geojson` |
| P2 | [compute-function](http://localhost:5173/src/autk-map/compute-function.html) | Run the attribute computation and verify the mapped result is present, finite, and aligned with neighborhood geometry. | `mnt_neighs.geojson`, `noise.csv` |
| P2 | [compute-osm-function](http://localhost:5173/src/autk-map/compute-osm-function.html) | Run the OSM computation and confirm computed feature styling renders on the expected map layers. | OSM/geocoding services |
| P2 | [compute-render-osm-sky-exposure](http://localhost:5173/src/autk-map/compute-render-osm-sky-exposure.html) | Run sky-exposure computation; results shade the expected surfaces without moving buildings or introducing invalid values. | OSM/geocoding services |
| P2 | [compute-render-osm-view-score](http://localhost:5173/src/autk-map/compute-render-osm-view-score.html) | Run view-score calculation; computed results remain associated with the same features and the scene renders normally. | `lower_mnt.osm.pbf`; geocoding for named areas; local PBF |
| P2 | [compute-render-osm-visibility](http://localhost:5173/src/autk-map/compute-render-osm-visibility.html) | Run visibility calculation; result geometry/colors remain aligned with buildings and the map stack. | `lower_mnt.osm.pbf`; geocoding for named areas; local PBF |
| P2 | [csv-wkt-vis](http://localhost:5173/src/autk-map/csv-wkt-vis.html) | CSV/WKT neighborhood polygons load at the same location and size; toggle layer visibility and palette. | `nyc_neigs.csv` |
| P1 | [geojson-boundaries-vis](http://localhost:5173/src/autk-map/geojson-boundaries-vis.html) | Polygon boundaries follow neighborhood edges, including rings; pan/zoom and toggle borders without missing outlines. | `mnt_neighs.geojson` |
| P1 | [geojson-lines-vis](http://localhost:5173/src/autk-map/geojson-lines-vis.html) | Road lines load in the expected position; change palette/visibility and confirm widths remain stable under zoom. | `mnt_roads.geojson` |
| P1 | [geojson-vis](http://localhost:5173/src/autk-map/geojson-vis.html) | Neighborhood fills and borders load with geometry-based origin; palette, visibility, and pan/zoom remain correct. | `mnt_neighs.geojson` |
| P0 | [geotiff-vis-geojson](http://localhost:5173/src/autk-map/geotiff-vis-geojson.html) | Load GeoJSON plus the legacy getRaster DEM path; scalar colors, alignment, opacity, and the raster palette control still work. | `mnt_dem.tif`, `mnt_neighs.geojson` |
| P0 | [geotiff-vis](http://localhost:5173/src/autk-map/geotiff-vis.html) | Load OSM plus DEM through getLayer; DEM keeps its own footprint and aligns with streets/coastline instead of stretching to the workspace. | `lower_mnt.osm.pbf`, `lower_mnt_dem.tif`; geocoding for named areas; local PBF |
| P0 | [heatmap-vis-geojson](http://localhost:5173/src/autk-map/heatmap-vis-geojson.html) | GeoJSON/noise-derived heatmap remains aligned; scalar coloring and transfer-function transparency match the existing behavior. | `mnt_neighs.geojson`, `noise.csv` |
| P0 | [heatmap-vis](http://localhost:5173/src/autk-map/heatmap-vis.html) | OSM/noise-derived heatmap remains spatially aligned; alpha is 0.5, ramps render, and the scalar palette/legend stays available. | `lower_mnt.osm.pbf`, `noise.csv`; geocoding for named areas; local PBF |
| P2 | [json-wkt-vis](http://localhost:5173/src/autk-map/json-wkt-vis.html) | JSON/WKT neighborhood polygons load at the same location and size; palette and visibility controls still work. | `nyc_neigs.json` |
| P1 | [layer-opacity](http://localhost:5173/src/autk-map/layer-opacity.html) | Exercise the opacity slider and feature picking; normal fills fade while selected features stay opaque. | `mnt_neighs.geojson`; OSM/geocoding services |
| P2 | [map-poster](http://localhost:5173/src/autk-map/map-poster.html) | Generate a poster for the default bbox, adjust street width and text, then export PNG; framing and export remain correct. | OSM/geocoding services |
| P2 | [osm-layers-api-bbox](http://localhost:5173/src/autk-map/osm-layers-api-bbox.html) | Load the explicit bbox; features respect the requested area and remain centered without extent-related stretching. | OSM/geocoding services |
| P2 | [osm-layers-api-chicago](http://localhost:5173/src/autk-map/osm-layers-api-chicago.html) | Load Chicago neighborhoods; large extents and multiple polygons stay correctly located and ordered. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-parks](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-parks.html) | Load parks-only view; polygons and borders render at the correct shared origin and controls still work. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-s+p](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-s+p.html) | Load surface plus parks; parks overlay the surface correctly and retain independent visibility controls. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-s+w](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-s+w.html) | Load surface plus water; coast/water boundaries remain aligned and correctly ordered. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-surface](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-surface.html) | Load the surface-only view; geometry bounds/origin remain unchanged and the initial camera behavior is preserved. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-w+p](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-w+p.html) | Load water plus parks; neither layer shifts when the other is visible or hidden. | OSM/geocoding services |
| P2 | [osm-layers-api-manhattan-water](http://localhost:5173/src/autk-map/osm-layers-api-manhattan-water.html) | Load water-only view; geometry remains centered with expected boundaries and visibility. | OSM/geocoding services |
| P1 | [osm-layers-api-multi](http://localhost:5173/src/autk-map/osm-layers-api-multi.html) | Check both independent map/database instances; navigation, layer state, and origins do not leak between maps. | OSM/geocoding services |
| P2 | [osm-layers-api-niteroi](http://localhost:5173/src/autk-map/osm-layers-api-niteroi.html) | Load Niteroi and local building geometry; buildings align with the base map and remain physically elevated. | `nit_buildings.geojson`; OSM/geocoding services |
| P2 | [osm-layers-api-paris](http://localhost:5173/src/autk-map/osm-layers-api-paris.html) | Load Paris; geometry-based centering and the complete layer stack remain correct. | OSM/geocoding services |
| P1 | [osm-layers-api-workspaces](http://localhost:5173/src/autk-map/osm-layers-api-workspaces.html) | Check both workspaces/canvases; each retains its own extent, layers, and origin without cross-workspace contamination. | OSM/geocoding services |
| P2 | [osm-layers-api](http://localhost:5173/src/autk-map/osm-layers-api.html) | Load the default named area; confirm surface, parks, water, roads, and buildings keep their existing drawing relationships. | OSM/geocoding services |
| P2 | [osm-layers-pbf-bbox](http://localhost:5173/src/autk-map/osm-layers-pbf-bbox.html) | Load the local PBF bbox; pan/zoom/pick buildings and verify the stack, physical depth, and clipped footprint. | `lower_mnt.osm.pbf`; geocoding for named areas; local PBF |
| P2 | [osm-layers-pbf](http://localhost:5173/src/autk-map/osm-layers-pbf.html) | Load the local PBF named area; compare its layer stack and position with the corresponding API example. | `lower_mnt.osm.pbf`; geocoding for named areas; local PBF |
| P2 | [osm-tag-sets](http://localhost:5173/src/autk-map/osm-tag-sets.html) | Check custom polygon, polyline, and point layers; adjust widths/radii/opacity and verify picking and palette controls. | OSM/geocoding services |
| P0 | [raster-rgb](http://localhost:5173/src/autk-map/raster-rgb.html) | Run the full RGB/scalar procedure below; colors, hole, legends, fitting, and rejected updates behave as specified. | Local in-memory data |
| P1 | [render-sizing](http://localhost:5173/src/autk-map/render-sizing.html) | Adjust point radius, generic line width, and road width; switch the picking layer and confirm hit coverage follows visible geometry. | Local in-memory data |
| P2 | [spatial-join-buildings](http://localhost:5173/src/autk-map/spatial-join-buildings.html) | Verify building aggregation results, feature highlighting, and spatial alignment with the base map. | `noise.csv`; OSM/geocoding services |
| P2 | [spatial-join-multi](http://localhost:5173/src/autk-map/spatial-join-multi.html) | Switch between noise and parking aggregations; values, domain, labels, and neighborhood geometry update consistently. | `mnt_neighs.geojson`, `noise.csv`, `parking.csv` |
| P2 | [spatial-join-near](http://localhost:5173/src/autk-map/spatial-join-near.html) | Verify proximity aggregation and thematic rendering without shifted features or missing buildings. | `noise.csv`; OSM/geocoding services |
| P2 | [spatial-join](http://localhost:5173/src/autk-map/spatial-join.html) | Inspect neighborhood aggregation and thematic colors; joined values/legend remain attached to the same neighborhoods. | `mnt_neighs.geojson`, `noise.csv` |
| P1 | [standalone-geojson-vis](http://localhost:5173/src/autk-map/standalone-geojson-vis.html) | Load projected GeoJSON without a database; geometry-based origin, borders, picking, and camera navigation remain correct. | `mnt_neighs_proj.geojson` |
| P1 | [standalone-points-geojson-vis](http://localhost:5173/src/autk-map/standalone-points-geojson-vis.html) | Verify point and neighborhood alignment in the database-free path; point picking/radius and palette remain functional. | `mnt_neighs_proj.geojson`, `mnt_pois_proj.geojson` |
| P0 | [terrain-layers-niteroi](http://localhost:5173/src/autk-map/terrain-layers-niteroi.html) | Orbit/pan/zoom terrain; draped surface/roads and elevated buildings remain aligned and terrain occludes buildings correctly. | `nit_buildings.geojson`, `niteroi-elevation.tif`; OSM/geocoding services |
| P2 | [barchart-click](http://localhost:5173/src/autk-plot/barchart-click.html) | Click bars and map features in both directions; linked selections highlight the matching neighborhoods and can be cleared. | `mnt_neighs_proj.geojson` |
| P2 | [heatmatrix-click](http://localhost:5173/src/autk-plot/heatmatrix-click.html) | Click heatmatrix cells; corresponding map features highlight and selection can be cleared without changing categorical labels. | `mnt_neighs_proj_landuse.geojson` |
| P2 | [histogram-brush-landuse](http://localhost:5173/src/autk-plot/histogram-brush-landuse.html) | Brush the land-use histogram; categorical data and linked map selections stay consistent. | `mnt_neighs_proj_landuse.geojson` |
| P2 | [histogram-brush](http://localhost:5173/src/autk-plot/histogram-brush.html) | Brush several ranges and clear the brush; matching neighborhoods highlight while nonselected features retain their styling. | `mnt_neighs_proj.geojson` |
| P2 | [histogram-rebuild](http://localhost:5173/src/autk-plot/histogram-rebuild.html) | Wait for the scheduled collection rebuild, then click bins/map features; redrawn bins and selections remain functional. | `mnt_neighs_proj.geojson` |
| P2 | [parallel-coordinates](http://localhost:5173/src/autk-plot/parallel-coordinates.html) | Brush/change selections on the parallel-coordinate axes and verify the corresponding map highlights and clear behavior. | `mnt_neighs_proj.geojson` |
| P2 | [scatterplot-brush](http://localhost:5173/src/autk-plot/scatterplot-brush.html) | Brush clusters/ranges and clear selection; matching map features highlight correctly. | `mnt_neighs_proj.geojson` |
| P2 | [scatterplot-click](http://localhost:5173/src/autk-plot/scatterplot-click.html) | Click plot points and map features; selections remain linked to the correct source features. | `mnt_neighs_proj.geojson` |
| P2 | [table-click](http://localhost:5173/src/autk-plot/table-click.html) | Click table rows and map features; linked row/map selections remain consistent and clear correctly. | `mnt_neighs_proj.geojson` |
| P2 | [temporal-events-click](http://localhost:5173/src/autk-plot/temporal-events-click.html) | Interact with event marks/time selections; linked road/map highlighting and temporal labels still work. | `mnt_roads.geojson`, `noise_manhattan_clean.csv` |
| P2 | [timeseries-click](http://localhost:5173/src/autk-plot/timeseries-click.html) | Click time-series marks and map features; linked selections and chart labels remain correct. | `mnt_neighs_proj.geojson` |

Inventory: **58 examples**. 6 P0 pages, 15 P1 pages, and 37 P2 pages. All statically detected dataset files were present during report preparation.

## Automated evidence and limitations

- Full local unit suite: 573 tests passed across 55 files, using two workers and a 60-second test timeout.
- Focused core/map suite: 227 tests passed before the full run; these overlap with the full-suite count.
- Real-WebGPU RGB regression: standalone bounds/fitting, exact quadrant colors, explicit normalized range, masked-outlier stretching, no-data alpha, scalar/RGB transitions, real legend visibility, rejected updates, and premultiplied opacity passed in headless Chrome.
- Existing WebGPU camera/vector/building/terrain regression: all 10 groups passed. The RGB regression passed five groups and the actual new gallery entry/control smoke test passed five groups, for 20 browser regression groups in total.
- Repository lint, all workspace builds/type checks, package artifact validation, and packing all six packages passed.
- Isolated npm-consumer verification could not complete: installing dependencies from `registry.npmjs.org` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Retrying with Node's system certificate store also failed. TLS verification remained enabled and no project configuration was changed. This check remains unverified until registry certificate trust is repaired; it is not counted as a passing check.
- Automated tests do not replace running every checklist row. This task does not claim a manual pass for all city/API/compute examples. The checklist is the recommended human validation sweep; service-dependent failures should be retried or compared with baseline before attributing them to this change.

## Pass criteria

Run P0 first, then P1, then P2 for the full regression sweep. Record browser/version, page, controls exercised, result, and any console/Network errors. An unexpected uncaught error, invalid GPU resource, shifted geometry, altered scalar colors/alpha, stale RGB legend, image change after a rejected update, or selection mismatch is a failure. Expected differences are the corrected GeoTIFF footprint, working raster-only fit, RGB-specific palette disabling, and explicit warnings for resampling/rejected updates.

Neither manual checks nor tests prove absence of every regression; together they cover the changed paths and the gallery's existing consumers.

## Reproduce automated checks

```sh
npm run lint
npm test -- --maxWorkers=2 --testTimeout=60000
make typecheck
npm run validate:packages
npm run pack:packages
npm run test:packages
node autk-compute/test/run-webgpu.mjs /autk-map/test/raster-rgb.webgpu.ts
node autk-compute/test/run-webgpu.mjs /autk-map/test/render-order.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/raster-rgb.webgpu.ts
```
