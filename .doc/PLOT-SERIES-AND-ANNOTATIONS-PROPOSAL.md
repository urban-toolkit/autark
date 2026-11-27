# Plot series and annotations proposal

**Status:** Fixed and statistical references, untransformed series, and grouped line charts with `reduce-series` and series-point callouts are implemented in `@urban-toolkit/autk-plot`. The map and data APIs are unchanged.

## Summary

- **Series** group rows from one collection on shared scales. Scatter and bubble distinguish groups by color; a bar chart places them side by side. A later line milestone draws one path per series.
- **Annotations** are reference marks, not input data. Autark positions them using the same coordinates as the marks without changing the domains or interaction state.
- **First release:** fixed reference annotations on registered Cartesian plots and scatter, bubble, and bar; untransformed grouping on registered plots and those three built-ins. Built-in and registered plots use the same caller API and opt in through `PlotDefinition`.
- **Follow-ups:** grouped `reduce-series` and line annotations, then statistical annotations. Defer overlaid bars, custom annotation callbacks, and named collections.

## Current behavior and constraints

- [`PlotConfig`](../autk-plot/src/api.ts) takes one GeoJSON `collection`. `attributes.axis` chooses inputs, `attributes.color` can color points, and optional `scales` override display domains. A color field on a scatterplot already distinguishes groups visually, but it does not define a grouping boundary for transforms or provide a group identity for annotations.
- Built-in and custom charts are both [`PlotDefinition`](../autk-plot/src/plots/registered.ts) objects. `registerPlot` exposes custom definitions through `new AutkPlot(container, { type: 'registered', plot: name, ... })`. A drawing binds original row objects to elements with the `autkMark` class. The existing `draw` return field `series` describes rendered paths for linked highlights; it is **not** a grouped-input API.
- [`linechart`](../autk-plot/src/plots/linechart.ts) positions X by bucket rank, even when the labels look like dates. A caller must be able to annotate `'2025-02'`, not the rank `1` or a pixel coordinate. The chart already registers the raw bucket mapping for brushing separately from its display axis.
- [`stackedbar`](../autk-plot/src/plots/stackedbar.ts) is already a separate, hierarchy-based plot. Side-by-side and overlaid bars do not sum their values and should not change that plot's behavior.
- Selection payloads and [`featureId`](../autk-plot/src/provenance/model.ts) currently use source feature indexes within one collection. Two collections will both have a feature `0`; concatenating them without retaining their source identity would break linking back to the original collections.

## 1. Multi-series feature

### Caller API

Add `attributes.series` as a field name. A series is one distinct value of that field; the caller does not list the groups separately. For the first version, require string keys containing at least one non-whitespace character on features that remain after filtering. Preserve valid keys verbatim. A missing or invalid key raises an error naming the field and original feature index. Without `attributes.series`, keep the current behavior.

A bar chart with series divides each category band into one slot per series. Missing `(category, series)` pairs leave empty slots. There is no `style.barLayout` option in the first release. Grouped bars accept finite, nonnegative amounts; reject invalid amounts and duplicate pairs after source filtering and before manual display clipping. Include the offending category and series in the error. Do not aggregate duplicates, even if one of the bars would be outside the view.

Series mode uses categorical colors and a shared legend and rejects simultaneous `attributes.color`. Without series, keep ordinary color and legend behavior. Resolve slot order from first appearance among valid unfiltered source keys. Ignore invalid keys while building the order, then validate all rows that survive the source filter. Filtering cannot renumber slots or colors, including when it removes an entire group. `updateCollection()` derives a new order from the replacement collection.

Use `style.colorMap` for categorical colors: reject a numeric palette in series mode and treat numeric-looking strings as literal keys. An explicit color domain controls palette indexing only, not slot order. Require unique valid string keys and coverage of all valid unfiltered source keys; extra keys may reserve palette entries but do not create groups. Show a legend entry only for a group with at least one row eligible to draw after filtering, transforms, and categorical-domain omission. Numeric clip windows do not change legend membership.

### Built-in examples

The examples share a small GeoJSON collection. The first four rows have direct numeric fields for scatter and bars. Each feature also contains a short observed series for the line example.

```ts
import type { FeatureCollection, Point } from 'geojson';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const input = [
  { scenario: 'Baseline', borough: 'North', x: 1, y: 10, monthly: [10, 12, 14] },
  { scenario: 'Baseline', borough: 'South', x: 2, y: 14, monthly: [14, 16, 18] },
  { scenario: 'Proposal', borough: 'North', x: 1, y: 18, monthly: [18, 20, 22] },
  { scenario: 'Proposal', borough: 'South', x: 2, y: 22, monthly: [22, 24, 26] },
];
const months = ['2025-01', '2025-02', '2025-03'];
const collection: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: input.map(({ monthly, ...properties }, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [i, 0] },
    properties: {
      ...properties,
      monthly: monthly.map((value, j) => ({ timestamp: months[j], value })),
    },
  })),
};
```

**Line chart follow-up: two paths, one color per scenario.** `reduce-series` averages each month's values independently within each scenario. The plotted values are `[12, 14, 16]` for Baseline and `[20, 22, 24]` for Proposal.

```ts
const lines = new AutkPlot(lineHost, {
  type: 'linechart',
  collection,
  attributes: { axis: ['monthly'], series: 'scenario' },
  transform: { preset: 'reduce-series', options: { reducer: 'avg' } },
  events: [PlotEvent.CLICK],
});
```

**Bar chart: two bars per borough.** Grouped bars share a zero baseline.

```ts
const bars = new AutkPlot(barHost, {
  type: 'barchart',
  collection,
  attributes: { axis: ['borough', 'y'], series: 'scenario' },
});
```

### Opt-in for registered plots

Use a top-level `series: true` opt-in on `PlotDefinition`. It enables untransformed groups on shared coordinates. Reject `attributes.series` if the plot did not opt in. In series mode, `ctx.seriesGroups` is a read-only ordered list of `{ key, rows, color }`, including empty groups so slot positions remain stable. `ctx.rows` is the combined data and each group holds the same row objects; bind those objects to marks. Without `attributes.series`, `ctx.seriesGroups` is `undefined` and existing extensions need no changes.

`ctx.color(row)` and mark restyling use selection and hover colors when active and restore the series color afterward. Series colors take precedence over ordinary field and base colors while grouped. `ctx.colorBy()` cannot change the field in series mode. Autark owns the series legend; extensions can still draw their own geometry and return the existing `draw().series` path descriptors for linked highlights. Those descriptors are independent of input grouping.

The registered scatterplot below is a complete example of the **proposed** extension hooks. It draws points itself, opts into shared grouping and annotations, and uses the same caller configuration as the built-in scatterplot. It assumes numeric X/Y fields, like the sample data above.

```ts
import * as d3 from 'd3';
import { registerPlot } from '@urban-toolkit/autk-plot';

registerPlot({
  name: 'scenario-scatter',
  series: true,
  annotations: 'reference',
  highlight: 'boolean',

  draw({ group, rows, seriesGroups, value, color, width, height, axisX, axisY, scaleDomain }) {
    const xOf = (row: (typeof rows)[number]) => Number(value(row, 0));
    const yOf = (row: (typeof rows)[number]) => Number(value(row, 1));
    const [xMin, xMax] = d3.extent(rows, xOf);
    const [yMin, yMax] = d3.extent(rows, yOf);
    const x = d3.scaleLinear(
      scaleDomain?.('x', 'numeric') ?? [xMin ?? 0, xMax ?? 1], [0, width],
    );
    const y = d3.scaleLinear(
      scaleDomain?.('y', 'numeric') ?? [yMin ?? 0, yMax ?? 1], [height, 0],
    );

    axisX(d3.axisBottom(x));
    axisY(d3.axisLeft(y));

    for (const { key, rows: points } of seriesGroups ?? [{ key: '', rows }]) {
      group.append('g').attr('data-series', key)
        .selectAll('circle').data(points).join('circle')
        .attr('class', 'autkMark')
        .attr('cx', row => x(xOf(row)))
        .attr('cy', row => y(yOf(row)))
        .attr('r', 4)
        .attr('fill', color);
    }
  },
});
```

### Grouping, transforms, and provenance

- **Untransformed grouping:** use the existing source filter and provenance chain. Assign each surviving row to one group without copying it or renumbering the original feature index. Reject `topK` and transforms in series mode, except for the built-in line follow-up below. Compute one display domain per axis over the combined data, respecting manual overrides.
- **Grouped line follow-up:** allow only the built-in `linechart` with `reduce-series`. Run the same transform and reducer independently per nonempty group. Build one shared graph by merging corresponding transform stages, not by chaining one group's transform after another. Keep source `featureId` and filter-stage IDs unchanged. Qualify every transform-local ID using a collision-safe encoding of the series key and local ID; remap stage IDs, relation endpoints, contribution targets, and final row IDs consistently. Keep contribution sources at their original feature IDs. Derive mark IDs from the qualified row IDs and retain the common reducer. An empty result is valid. In grouped mode, `ctx.transform` is `undefined`, not a result from an arbitrary group; a future extension that needs transform metadata will need an explicit contract.
- **Line bucket order and gaps:** use the union of transformed bucket keys in the existing line bucket order, or use `scales.x.domain` as the exact ordered vocabulary when supplied. Do not infer cadence or normalize additional timestamp formats. A bucket absent in one series breaks that path when it exists in the shared vocabulary. If no series has the bucket, callers must include it in the explicit domain to show the gap. Base paths and linked-highlight paths share that gap logic; placeholders are not rendered rows or selectable marks. Use the same published position for the mark, guide, and callout, including a single-bucket domain. Preserve the existing ungrouped path behavior.

**Task 4 implementation contract.** An internal runner accepts source-ordered series groups containing already-filtered rows with original `autkIds`. It returns reduced groups (including empty slots), their combined rows in the same order, and one `TransformProvenance`. Output groups share the combined row objects. Qualify transform-local IDs as `series:` followed by the JSON encoding of `[seriesKey, localId]`, preserving IDs if filter results or group order change. Merge `D1` series points and `D2` buckets by stage, leaving `D0` endpoints and contribution sources untouched so the existing pipeline can insert its filter stage. With no output, still return both empty stages, both empty relations, and the configured reducer (default `avg`). Do not enable grouped line rendering or expose a new preset in this task.

### Later phase: multiple named collections

When data actually comes from separate sources, reuse the series renderer instead of adding a second rendering API:

```ts
new AutkPlot(lineHost, {
  type: 'linechart',
  collections: [
    { id: 'baseline', label: 'Baseline', collection: baseline },
    { id: 'proposal', label: 'Proposal', collection: proposal },
  ],
  attributes: { axis: ['monthly'] },
  transform: { preset: 'reduce-series' },
});
```

This is a later API sketch. It would accept **either** `collection` or `collections`; each named source becomes one series. Defer combining source grouping and `attributes.series` until there is a use case for nested groups. Require stable, unique source IDs. Before exposing this API, specify how to update a source and how click, brush, hover, and inbound selection carry a source-qualified feature reference such as `{ source: 'proposal', index: 0 }`. Keep the existing `number[]` selection and `updateCollection` behavior for single-collection plots. Internal global indexes are fine as an implementation detail, but they are not a substitute for source identity in public events.

## 2. Annotation feature

### Caller API and built-in marks

Use `plot.setAnnotations(list)` to replace the page-supplied annotations; `plot.setAnnotations([])` clears them, and is a no-op on unsupported plots. Each annotation needs a unique, nonempty string `id`. Optional `label` and `color` are caller-supplied; otherwise use no label and a default reference color (the series color for a series-point callout).

| Mark | First release: fixed coordinates | Follow-up |
| --- | --- | --- |
| Line | Exactly one of `x` (vertical) or `y` (horizontal). | `fit: 'linear'` alone on numeric X/Y with paired observations. |
| Point | Both `x` and `y`. | `series` and a fixed X bucket without `y` on grouped lines. Statistical coordinates on supported numeric axes. |
| Band | Exactly one interval, `x: [from, to]` or `y: [from, to]`. Both category endpoints are included. | No statistical endpoints planned. |

Fixed coordinates are finite numbers on numeric axes, and literal strings on category or bucket axes. A category called `'mean'` remains a category even after statistics ship. Numeric line and point coordinates can also accept `'min'`, `'max'`, or `'mean'` once the plot declares observations for that axis. A point with `'mean'` on both numeric axes requests the paired centroid; other point coordinates resolve independently.

### Built-in examples

**Scatterplot statistics follow-up: two series, overall mean, and a trend.** The mean Y of the sample points is `16`; the paired centroid is `(1.5, 16)`.

```ts
const scatterConfig = {
  collection,
  attributes: { axis: ['x', 'y'], series: 'scenario' },
  events: [PlotEvent.CLICK],
};

const scatter = new AutkPlot(scatterHost, { type: 'scatterplot', ...scatterConfig });
scatter.setAnnotations([
  { id: 'mean-y', type: 'line', y: 'mean', label: 'Average Y' },
  { id: 'fit', type: 'line', fit: 'linear', label: 'Linear trend' },
  { id: 'centroid', type: 'point', x: 'mean', y: 'mean', label: 'Centroid' },
]);
```

**Line chart follow-up: a specific X position and one point on one series.** These annotations can be supplied or replaced when a related map or table selection changes. The point appears at Proposal's observed value (`22` in February), not at Baseline's value or a Y estimated by interpolating the path.

```ts
lines.setAnnotations([
  { id: 'review-month', type: 'line', x: '2025-02', label: 'Review month' },
  { id: 'proposal-in-feb', type: 'point', series: 'Proposal', x: '2025-02', label: 'Proposal' },
  { id: 'review-window', type: 'band', x: ['2025-02', '2025-03'], color: '#2563eb' },
]);
```

**Bar chart: a target range and a target line.** The band doesn't change the bars or their domain.

```ts
bars.setAnnotations([
  { id: 'target-range', type: 'band', y: [15, 20], label: 'Target range', color: '#16a34a' },
  { id: 'target', type: 'line', y: 18, label: 'Target' },
]);
```

### Opt-in for registered plots

`annotations: 'reference'` on `PlotDefinition` opts in. Omitting it leaves existing extensions unchanged; submitting a nonempty list to an unsupported plot is an error. The preset draws only page-supplied marks. Defer custom callbacks until there is a use case that defines separate background and foreground drawing contracts.

For standard linear, band, and point axes, obtain the annotation mapping from `axisX`/`axisY`. The draw context can explicitly publish a mapping that takes precedence over the axis mapping: the side, the coordinate kind (`numeric` or `categorical`), a function from a number or raw key to a plot-local position, and optional category bounds. Return `undefined` for a key with no position. Declare supported mappings consistently even with empty data. If an explicit categorical mapping does not supply bounds, it supports guides and points but not bands. The line follow-up publishes the actual raw bucket mapping, not rank numbers. A series-point lookup is a separate declaration; it returns the actual plot-local `(x, y)` for a unique `(seriesKey, xKey)`, or no match.

**Use the `reference` preset in an extension.** The `scenario-scatter` definition above opts in. The point scales are enough for fixed guides, but do not enable statistics.

```ts
const customScatter = new AutkPlot(customHost, {
  type: 'registered', plot: 'scenario-scatter', ...scatterConfig,
});
customScatter.setAnnotations([
  { id: 'target-y', type: 'line', y: 16, label: 'Target Y', color: '#d97706' },
]);
```

### Coordinate, statistics, and lifecycle rules

- **Observations (statistics follow-up):** add a draw-context hook that declares which numeric axes support statistics and publishes a list of paired records `{ x?: number; y?: number }`. Omit missing or nonfinite coordinates rather than replacing them with the renderer's zero fallback. Scatter and bubble may normalize nonempty numeric strings the same way as their geometry. Keep support declared even when the records are empty. Pool records across series after source filtering and transforms, before manual numeric clipping or categorical-domain omission. A Y mean for a reduced line uses the bucket values, not the raw values. Plots with only positional mappings have no statistical support.
- **Statistics:** single-coordinate statistics use finite values on that axis independently. The centroid and ordinary least-squares fit use only pairs with both values finite. The fit segment spans the observed X extent of those pairs; do not extrapolate. With fewer than two finite pairs or no X variance, hide the fit. Hide a statistic with no finite input.
- **Domains and clipping:** clip annotation geometry to the plot rectangle without clamping a point onto an edge. A band-scale guide uses the category center, and a categorical band spans the outer edges of the endpoint bands, including space between them. On a point or bucket scale, boundaries are midpoints to neighboring positions, with plot edges as outer boundaries. Normalize reversed endpoints. If either category endpoint is absent from the current mapping, hide the band. Keep labels within the plot area and hide them with their marks.
- **Series-point lookup (line follow-up):** skip the callout if the matching point is absent, filtered out, ambiguous, or outside the view. Do not snap to another series, use the nearest bucket, or interpolate.
- **Lifecycle:** keep separate SVG layers and cache only the final layout's mappings and data declarations after any margin-adjustment pass. Draw bands behind data and lines, points, and labels in front. `setAnnotations()` repaints only those layers; it does not rerun transforms, recreate marks or brushes, or change selection, hover, legends, or provenance. Installed requests persist through redraw, resize, and `updateCollection()`. Annotations are not `autkMark` elements and all annotation layers are noninteractive.
- **Errors:** validate the entire replacement list before changing requests or SVG. Reject malformed or unsupported items with the ID (or list index if no valid ID) and reason; the prior list and overlay stay intact. Distinguish an unsupported coordinate or observation declaration from a supported request with no current match: hide the latter and retry on redraw, without throwing if a bucket or series disappears.

## Built-in adoption study

| Plot | Series recommendation | Annotation recommendation |
| --- | --- | --- |
| **Line** | Follow-up: multiple colored paths with shared buckets. | Line follow-up: fixed marks and series-point callouts. Statistics follow-up: Y only, never regression on bucket ranks. |
| **Bar** | First release: grouped category slots. | First release: fixed category and numeric references. Statistics follow-up: Y only. |
| **Scatter / bubble** | First release: series color and identity; bubble size keeps its existing mapping. | First release: fixed marks. Statistics follow-up: axis statistics, centroid, and linear fit. No series-point lookup. |
| **Area** | Evaluate later: overlapping fills and linked parts can obscure other series. | Same bucket guides and point semantics as line. Can follow once the shared series/coordinate behavior is verified. |
| **Stacked bar, box, violin** | Keep their existing behavior. A new grouping layout needs a separate design. | Consider fixed guides and bands. Define the observation before offering stats: stack totals versus segments, or underlying observations versus summaries. |
| **Heat matrix, hexbin, density** | Defer. Multiple grids or distributions need explicit comparison behavior. | Consider fixed references on their existing display coordinates. Do not fit a trend or mean over bin centers or density sampling points by accident. |
| **ECDF, Pareto, radar, parallel coordinates, calendar, hierarchy, flow, and other non-Cartesian plots** | Defer unless a specific grouping use case fits the plot. | Defer. Multiple value channels, per-field axes, or non-Cartesian coordinates need their own annotation semantics. Treemaps remain unchanged. |

## Implementation and verification

### First release

1. **Fixed references on a registered plot.** Use the registered scatter fixture above with series disabled, plus a registered categorical-axis fixture with a literal `'mean'` key. Implement the preset, runtime validation, and final-layout layers. **Accept:** guides, points, and bands follow the mapped coordinates and clipping after resize; invalid replacements preserve the previous overlay; replacing or clearing annotations preserves existing marks, brush, selection, and provenance and does not rerun the transform. **Spec:** none; the contract above covers this task. **Verify:** browser suite and typecheck.
2. **Untransformed series on registered scatter, scatter, and bubble.** Use the four-row fixture above with axis bindings `['x', 'y']` for scatter and `['x', 'y', 'y']` for bubble. Route row colors and legend entries through shared grouping. **Accept:** click and brush use original feature indexes; filtering out an entire group preserves surviving colors; clearing hover or selection restores group color; numeric-looking series keys stay categorical; ungrouped baselines remain unchanged. Enable fixed references on built-in scatter and bubble. **Spec:** none. **Verify:** browser suite, template check, and typecheck.
3. **Grouped bar geometry and fixed references.** Use the two-borough fixture. Split category bands using stable slot order and use the outer category mapping for guides and bands. **Accept:** a missing pair or fully filtered group leaves the same slot empty; a duplicate or invalid amount identifies the offending pair; categorical display windows hide the corresponding bars and legend entries without renumbering slots; ungrouped bars retain existing behavior. **Spec:** none. **Verify:** browser suite, template check, and typecheck.

### Follow-ups

4. **Grouped `reduce-series` provenance (implemented).** First pin the ID encoding, stage merge, and empty-result behavior in a short implementation spec. Use the two scenarios sharing February and a source filter that leaves nonconsecutive original feature indexes. Test the merged data and graph without enabling the grouped line renderer yet. **Accept:** February has distinct row IDs per group; inverse paths and contribution targets resolve to the correct original features for both groups and preserve the reducer; empty output is valid. **Spec:** short. **Verify:** plot unit tests and browser suite.
5. **Grouped line rendering and callouts (implemented).** Build on task 4. Remove February first from one scenario, then from both, and use the explicit month domain in the second case. **Accept:** base and linked-highlight paths break at the expected buckets; the February marks have distinct provenance IDs and selecting Proposal's point by click or brush yields only its contributors; a guide and callout align with the actual mark even in a one-bucket view; a missing point hides the callout. **Spec:** none. **Verify:** browser suite, template check, and typecheck.
6. **Statistical references (implemented).** Add the observation hook, first on scatter/bubble, then numeric Y on line/bar. Use uneven missing X/Y values to distinguish marginal means from the paired centroid; include empty data, constant X, and manual numeric and categorical domains. **Accept:** display windows do not change results; unsupported axes reject the request; supported axes with no observations hide it; line Y statistics use grouped bucket values. **Spec:** none. **Verify:** plot unit tests, browser suite, template check, and typecheck.

Run verification from the repository root:

- Browser suite: `npm run test:browser --workspace=@urban-toolkit/autk-plot` (requires Chrome; set `CHROME_BIN` if needed).
- Plot unit tests: `npm test -- autk-plot/test`.
- Template check after built-in changes: `node usecases/scripts/lab-templates.mjs` then `npm test -- usecases/test/lab-templates.test.ts`.
- Typecheck and lint: `make typecheck` and `make lint`. Update the extension docs when the public contract ships.

**Deferred:** named collections, overlaid bars, bar aggregation, custom annotation callbacks, new stacking layouts, mixed chart types, independent axes, nested series, series-specific fits, confidence or statistical bands, and annotations that alter data or domains.
