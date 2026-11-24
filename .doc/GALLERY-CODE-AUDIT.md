# Gallery code audit: API in focus and Minimal runnable example

**Baseline:** `183d916f`, after the rewrite of [`gallery/code.ts`](../gallery/code.ts) and [`gallery/source.ts`](../gallery/source.ts). **Scope:** all 34 catalog examples.

## Rules applied

- **API in focus** shows only the calls that define the feature. It contains no map or plot bootstrap, no live-demo state, and no helper that the reader cannot see.
- **Minimal runnable example** is a complete program: imports, initialization, the feature, and `map.draw()`. It may simplify the live demo, but it must not contradict it.
- A focus snippet may use data variables such as `collection` or `buildings`; it may not rely on undefined helper functions or constants.
- Chart examples share one compact helper, so the `AutkPlot` configuration and the linkage line are the visible content.

## Result by example

| Examples | Focus | Minimal | Notes |
| --- | --- | --- | --- |
| D01–D06, B03 | Strong | Strong | Each shows the format, workspace, or raster call that distinguishes it. D04 explains WKT versus coordinates once per load. |
| I01–I03 | Strong | Strong | Correct layer id (`table_osm_buildings`), real selection output, and a 25-line camera animation instead of the demo's easing pipeline. |
| S01, S03, S04 | Strong | Strong | S01 derives the district domain from the data instead of a hidden constant. |
| B01, B02, T01–T04 | Strong | Strong | `setView()` before tiles or terrain; fixed-raster terrain loads without unrelated vector layers. |
| P01–P07 | Strong | Strong | Focus is the `AutkPlot` config plus one map-to-plot and one plot-to-map line. Minimal keeps the same calls in a short page program. |
| A01–A08 | Strong | Strong | A02 shows the chained join and colors its result. A06, A07, and A08 now have distinct programs: `classes`/`sky`, building-window viewpoints, and `objects`. |

## What changed from the previous audit

- I01 and I02 targeted a layer named `buildings`; both now use `table_osm_buildings`.
- A06, A07, and A08 shared one program; each now runs the aggregation and viewpoints its live example uses.
- I03 was a copy of the camera demo; it is now a short two-point drive built on `resetCamera` and `requestAnimationFrame`.
- P07 imported the live example as raw text and stripped lines with regexes; it is now a standalone line chart with `binning-events`.
- Plot snippets dropped the repeated hover wiring and the gallery-specific `width` calculation.
- Focus snippets no longer reference `summarize`, `CORINE_PALETTE`, or `BERLIN_BEZIRKE`. S01 builds its domain from `ortsteile`; B03 shows only raster loading.

## Verification

- Every example and selected variants render non-empty, balanced snippets: 48 programs across 34 examples.
- The 48 generated programs pass `tsc` against the current packages, including gallery path aliases.
- Gallery type check, ESLint, and `npm run build --workspace ./gallery` pass.
- Not covered: running every snippet in a browser against its data. The programs type-check and mirror the live examples, but interaction and visual output were not replayed end to end.

## Remaining trade-offs

- I01, A07, and A08 stay near 25 lines because they need a scene to compute against. Shorter versions would hide the aggregation inputs.
- A08 prints sample counts rather than coloring buildings; mapping computed object keys back to features is example-specific logic that the live demo already owns.
- D04 is explicit per format rather than looped. Three short loads read faster than a data-driven loop and keep the WKT contrast visible.
