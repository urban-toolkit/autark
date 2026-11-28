<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk-plot</h1>

  <br>
  <p><strong>D3.js-based plotting library for linked urban data views.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## @urban-toolkit/autk-plot

`@urban-toolkit/autk-plot` is a D3.js-based plotting library for visualizing GeoJSON feature properties. It provides a unified `AutkPlot` wrapper for multiple chart types, shared styling and colormap utilities, interaction events, selections, data updates, and transform presets for common aggregation workflows.

### Basic usage

```ts
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const container = document.querySelector<HTMLElement>('#plot')!;

const plot = new AutkPlot(container, {
  type: 'scatterplot',
  collection: pointsGeojson,
  attributes: { axis: ['population', 'income'], color: 'zone' },
  labels: { axis: ['Population', 'Income'], title: 'Urban indicators' },
  events: [PlotEvent.CLICK],
});

plot.events.on(PlotEvent.CLICK, ({ selection }) => {
  console.log(selection);
});

plot.setSelection([0, 4, 10]);
```

### API summary

* `new AutkPlot(container, config)`: Creates a plot using the selected `type`.
* `type`: Returns the active plot type.
* `instance`: Exposes the underlying plot implementation for advanced use.
* `selection`: Returns selected source feature ids.
* `events`: Typed event bus for click, brush, and other supported plot events.
* `setSelection(selection, shares?)`: Applies a selection by source feature IDs, with optional series membership and coverage keyed by feature ID.
* `setAnnotations(list)`: Replaces reference marks without redrawing the data. Pass `[]` to clear them.
* `updateCollection(collection)`: Replaces the source GeoJSON collection and redraws.
* `draw()`: Redraws the plot synchronously.
* `provenance`: Provenance graph of the current draw, from source features to marks.
* `destroy()`: Stops following the host size and removes the plot from its host.

Besides the attributes, labels and styling options, the config accepts:

* `width: 'auto'`: Fills the content width of the host and redraws when it changes, keeping the selection.
* `filter`: Keeps only the features that meet one or more conditions (`==`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not-in`).
* `topK`: Keeps the `k` largest rows, optionally gathering the rest in an "Others" row.
* `provenance: { path: true }`: Shows, under the plot, how many entities the selection reaches at each stage. Off by default.

### Series and fixed reference marks

Scatter, bubble, and bar charts can group one collection on shared scales. Set `attributes.series` to a property with nonempty string keys. Groups use categorical colors and a legend; filtering does not change the colors or move bar slots for the remaining groups. In series mode, use a categorical `style.colorMap` if you want to override colors. An explicit color domain must include all source series keys and sets color order independently of slot order. Do not combine series with `attributes.color` or `topK`. Transforms are supported in series mode only for the line chart's `reduce-series` preset.

To assign colors to specific keys, import `ColorMapDomainStrategy` from `@urban-toolkit/autk-core` and add this to your plot configuration:

```ts
style: {
    colorMap: {
        type: 'categorical',
        colors: ['#087e78', '#875194'],
        domainSpec: { type: ColorMapDomainStrategy.USER, params: ['Before', 'After'] },
    },
},
```

`Before` is teal and `After` is plum, regardless of which appears first in the collection. The legend uses the same colors.

```ts
const plot = new AutkPlot(container, {
    type: 'barchart',
    collection,
    attributes: { axis: ['district', 'trips'], series: 'period' },
});
plot.setAnnotations([
    { id: 'target-range', type: 'band', y: [110, 135], label: 'Target range' },
    { id: 'district', type: 'line', x: 'South' },
]);
```

Grouped bars require one finite, nonnegative number per `(category, series)` pair. Missing pairs leave empty slots; duplicate pairs raise an error. Grouped selection keeps source feature IDs and legend colors. A click toggles the clicked mark; a brush can select marks in multiple series.

Fixed annotations are available on scatter, bubble, bar, and line charts. A line takes one coordinate (`x` or `y`), a point takes both, and a band takes a two-value interval on one axis. Use numbers on numeric axes and unformatted keys on categorical axes. Each annotation has a unique nonempty `id` and may specify a `label` or CSS `color`. Annotations do not affect selection, automatic domains, or provenance. A reference outside the view is hidden or clipped; an invalid replacement leaves the previous list installed.

Registered Cartesian plots can opt in through `series: true` or `annotations: 'reference'` on their definition. In series mode, `draw` gets `seriesGroups` with `{ key, color, rows }` entries, including empty groups, and `color(row)` uses the series encoding. Bind the original draw-context rows to marks. Use `visibleRows` when a categorical domain omits rows so the series legend can omit those groups too. The annotation preset uses the scales passed to `axisX` and `axisY`; call `setAnnotationAxis?.(side, mapping)` to supply plot-local positions explicitly when the ticks do not use the same coordinates as the marks. Categorical bands on explicit mappings also require category bounds.

### Grouped line charts

Set `attributes.series` and `transform: { preset: 'reduce-series' }` to reduce the observations in each series independently and draw one path per group. The groups share the union of observed bucket keys in line-chart order. Set `scales.x.domain` to specify the exact bucket order or reserve buckets missing from every series. A missing bucket breaks the affected path and its linked highlight; it does not count as a row or a zero. Clicks and brushes on the bucket points still report original feature IDs.

```ts
const lines = new AutkPlot(container, {
    type: 'linechart',
    collection,
    attributes: { axis: ['monthly'], series: 'scenario' },
    transform: { preset: 'reduce-series', options: { reducer: 'avg' } },
});
lines.setAnnotations([
    { id: 'review-month', type: 'line', x: '2025-02' },
    { id: 'proposal', type: 'point', series: 'Proposal', x: '2025-02', label: 'Proposal' },
]);
```

For a series-point callout, omit `y` and use the raw bucket key, not a tick label. The callout follows the transformed point and defaults to the series color. If that point is missing or outside the display window, the callout stays installed but hidden.

### Statistical annotations

Use `'min'`, `'max'`, or `'mean'` in place of a numeric line or point coordinate. Scatter and bubble support statistics on both axes; bar and line charts support them on Y only. On a categorical or bucket axis, `'mean'` is still a literal key. Band endpoints remain fixed coordinates.

```ts
scatter.setAnnotations([
    { id: 'average', type: 'line', y: 'mean' },
    { id: 'centroid', type: 'point', x: 'mean', y: 'mean' },
    { id: 'trend', type: 'line', fit: 'linear' },
]);
```

Statistics pool finite observations across series after filtering and transforms, before manual display windows. A single coordinate uses all finite observations on that axis. The centroid and least-squares fit use complete X/Y pairs only. The fit stops at the observed X extent and is hidden when fewer than two pairs are available or all paired X values are equal. The line chart's Y mean uses the transformed bucket values, not the observations inside each bucket.

Registered plots can call `setAnnotationObservations?.({ axes: ['x', 'y'], rows })` to opt in to statistics. Each observation is a record with optional numeric `x` and `y` coordinates; omit missing values. Declare supported axes even when there are no observations. Providing an axis scale alone does not opt in to statistics.

### Numeric axis ticks

Set `ticks: { x: { count: 4 }, y: { count: 6, format: ',d' } }` to request about four X ticks and six Y ticks, formatting Y labels as comma-separated integers. Both axes and both settings are optional. D3 may choose a different count to keep tick values round. Missing, nonpositive, or nonfinite counts use the axis default. Set the D3 number format with `ticks.x.format` or `ticks.y.format`. For parallel coordinates, set a format by field with `ticks.dimensions`, such as `{ population: { format: ',d' } }`.

The option applies to numeric axes that generate their tick positions:

- **X and Y:** scatter, bubble, hexbin, and ECDF.
- **Y only:** bar, line, area, box, violin, stacked bar, and Pareto (the primary count axis, not the secondary share axis).
- **X only:** density; its relative Y axis has no numeric labels.

Compact scatterplots, bar charts, and line charts request fewer numeric ticks by default. Other plots keep their existing defaults unless you supply a count. Category and bucket axes, fixed tick positions, and plots without standard X/Y axes (such as parallel coordinates) are unchanged. Registered plots using the `axisX` and `axisY` helpers also honor count overrides on eligible numeric axes; use the drawing context's `format` helper to read the configured format.

For bar, line, and area charts, `ticks.x.label` receives the raw category or bucket key and overrides the default label and numeric format. Return `''` to leave a bar tick unlabeled or to omit a line or area tick. For example, `ticks: { x: { label: key => key === '2024-03-02' ? 'Launch day' : '' } }` labels only the launch bucket. Without a callback, date and timestamp buckets use short UTC labels such as `Mar 2`; timestamp spans of four days or less also show the hour, such as `Mar 2 06h`. Month and year buckets retain their keys. Labels do not change the data or selection keys.

### Manual scale domains

Plots infer domains by default. Set `scales` to override only the channels you need. For example, this bar chart orders its categories and fixes the Y axis to `[0, 1]`:

```ts
scales: {
    x: { domain: ['Low', 'Medium', 'High'] },
    y: { domain: [0, 1] },
}
```

Numeric domains must have two finite, increasing bounds. Marks are clipped to the plot area, not filtered before aggregation. Categorical domains use an ordered list of unique string keys: missing categories get empty slots, and categories left out of the list are not drawn. Use the original category or bucket keys, not formatted tick labels. Scale types and pixel ranges are unchanged.

| Plot | Supported domains |
| --- | --- |
| Bar, stacked bar, box, violin | Categorical `x`, numeric `y` |
| Scatter, bubble | Numeric `x` and `y`; bubble also supports numeric `size` |
| Line, area | Categorical `x` (equally spaced buckets), numeric `y` |
| Heat matrix | Categorical `x` and `y` (category or bucket keys) |
| Density, hexbin | Numeric `x` and `y`; domains do not recompute the density or bins |
| Parallel coordinates | Numeric or categorical `scales.dimensions[field].domain`, matching the field's scale |

For bubbles, `scales.size.domain` must be nonnegative. Values outside it use the nearest endpoint radius. For colors, use `style.colorMap.domainSpec` instead.

### Plot appearance

Use `style` for per-plot appearance overrides. `style.radius` sets a fixed scatterplot point radius in pixels. Omit it or pass a nonpositive or nonfinite value to keep the 5 px default. It does not affect bubble sizes. Use `style.columnFormats` on tables to set D3 number formats by column field. `style.barPadding` controls bar-chart band spacing from `0` (no padding) to `1` (full padding); the default is `0.25` and invalid values fall back to it.

`style.colorMap` accepts the same object as `map.updateColorMap(layerId, { colorMap })`. Keep the data field in `attributes.color`:

```ts
const colorMap = {
    type: 'diverging',
    colors: ['#b2182b', '#f7f7f7', '#2166ac'],
    domainSpec: { type: ColorMapDomainStrategy.USER, params: [-20, 0, 50] },
} as const satisfies ColorMapOptions;

new AutkPlot(container, {
    type: 'scatterplot', collection,
    attributes: { axis: ['income', 'rent'], color: 'change' },
    style: { radius: 3, colorMap },
});
```

Import `ColorMapDomainStrategy` and the `ColorMapOptions` type from `@urban-toolkit/autk-core`. Use `{ interpolator: ColorMapInterpolator.SEQ_VIRIDIS }` for a named scale, or `{ type, colors }` for a custom hex palette. Categorical colors follow domain order and reuse the last color if the palette is short. Sequential palettes are ramps, and diverging palettes use three colors with the middle color at the domain midpoint. Selection highlights are unchanged. Set the domain strategy inside `style.colorMap`.

### Supported plot types

* `scatterplot`, `barchart`, `parallel-coordinates`, `table`, `linechart`, `heatmatrix`
* `boxplot`, `sankey`, `pie`, `donut`, `areachart`, `bubble`, `hexbin`, `calendar`, `waffle`
* `stackedbar`, `treemap`, `sunburst`, `radar`, `ecdf`, `pareto`, `chord`, `density`, `violin`
* `registered`: a chart written in plain D3 and registered with `registerPlot`.

### Provenance and the segregated view

Every transform records weighted relations between its inputs and outputs, from the source features to the rendered marks, and classifies each step as 1:1, N:1, 1:N or N:N. Selections use them in both directions: an aggregated mark highlights only the part produced by the selected features, and a mark selected in an aggregated view sends the share of each feature it covers. The relations extend the `autkIds` of the previous versions, which are kept unchanged.

A mark shows a selection from another view in one of three highlight modes: `boolean` (the whole mark), `subset` (the default: the mark drawn again with the value of the selected subset, through the plot's own encoding) or custom (a preset: `glyph`, `trace`, `members`, or a function of the plot). For a plain D3 chart, the channel of the subset render is inferred from the geometry of its marks (a least-squares fit, R² ≥ 0.99 over at least three distinct values); when no channel is proven, a preset stands in. `provenance: { highlight: 'boolean' }` in a configuration gives any plot the whole-mark highlight.

A plot is interactive only with `events`: with none, it selects nothing, sorts no table and recolors no axis on click, but still shows the selections of other views and its tooltips.

### Hovering marks

Enable `PlotEvent.HOVER` in `events` to temporarily color hovered marks with the map's default hover color (`#f4a261`). Hover does not change the plot's selection. Leaving the mark restores its normal or selected color.

```ts
plot.events.on(PlotEvent.HOVER, ({ selection, datum }) => {
    // selection contains source feature IDs for the hovered mark.
    // datum is the rendered row (an aggregate for an aggregated mark).
    if (datum) console.log(selection, datum);
});
```

When hover clears, the event carries `selection: []` and `datum: null`.

Hover can also come from another view. `plot.setHover(selection)` highlights those source features without changing the selection, and `plot.setHover([])` clears it. In an aggregated plot the hovered feature is drawn as a part of its mark, in the hover color; stroke-only marks such as parallel-coordinate lines also thicken while hovered. This is how a map hover can highlight plot marks:

```ts
map.updateRenderInfo('neighborhoods', { isHover: true });
map.events.on(MapEvent.HOVER, ({ selection, source }) => {
  if (source === 'pointer') plot.setHover(selection);
});
```

### Linked selection and shares

`selection` contains each selected source feature ID once. Click and brush events can also carry `shares`, a `SelectionShares` object keyed by feature ID:

```ts
{
  selection: [12],
  shares: {
    12: {
      feature: { selectedUnits: 1, totalUnits: 3 },
      series: [{ id: 'After', selectedUnits: 1, totalUnits: 3 }],
    },
  },
}
```

`feature` is coverage across the feature's contributions in the emitting view. If provenance distinguishes stages or unit groups, the highest coverage is reported rather than summing groups. Each `series` entry identifies an eligible series and may report coverage within it. Entries for grouped one-to-one marks can be just `{ id: 'After' }`. A series membership entry without coverage can still highlight a whole mark. Ungrouped plots omit the series list and ignore any incoming series restriction.

```ts
source.events.on(PlotEvent.CLICK, ({ selection, shares }) => {
  target.setSelection(selection, shares); // Plots sharing a feature ID space and compatible series keys
  map.setSelection('regions', selection); // The map highlights whole features only
});
```

If two plots group the same features differently, forward only the feature-level entries (or just `selection` if partial coverage is not needed). Series keys are local grouping values, not cross-collection IDs. Aggregating receivers recompute subsets from their own contributors; one-to-one receivers use incoming coverage to draw partial marks. Registered plots with custom highlights receive eligible `parts` and `colorOf(row)` for the row's selection color. Return one path descriptor per input series if a grouped custom plot draws linked subset paths.

**Migration:** `PlotEventData.shares`, `setSelection`'s optional second argument, and the result of `provenance.featureShares()` now use the keyed object, not an array. Replace `shares.find(item => item.feature === id)` with `shares?.[id]?.feature`. Callers that forward the event's shares directly, or only use `selection`, need no call-site change once rebuilt together.

### Brush bounds

`PlotEvent.BRUSH`, `BRUSH_X`, and `BRUSH_Y` include `extent` alongside `selection` and optional provenance `shares`. An active brush always reports `extent.pixels` in the brush group's local SVG coordinates. A cleared brush reports `extent: null`, even if another brush still contributes to the selection.

Where axis scales are available, `extent.data` provides numeric `range` values (low to high) or categorical `keys` in axis order. Bar brushes report overlapping category bands; line and area brushes report raw bucket keys at positions inside the interval, independent of the displayed tick labels. A gap can return `keys: []`. Parallel coordinates also report the axis field in `extent.dimension`. Plots without a matching axis still report pixels. Registered plots get data bounds from `axisX` and `axisY` and can override a brush scale with `setBrushScale` after drawing the axis.

### Transform API summary

`@urban-toolkit/autk-plot` also exports a shared transform layer for preparing plot data while preserving source-feature provenance through `autkIds` and explicit relations.

* `run(rows, config, channels)`: Runs a built-in transform preset.
* `reduceBuckets(params)`: Applies low-level bucket aggregation.
* Transform presets: `binning-1d`, `binning-2d`, `binning-events`, `reduce-series`, `sort`, `box-stats`, `flows`, `binning-hex`, `hierarchy`, `cumulative`, `fold`, and `density`. `binning-1d` keeps the empty ranges of a numeric column (value 0, no `autkIds`), so a histogram does not skip them. In 1D and 2D, an internal edge belongs to the bin it opens, and the maximum belongs to the final bin. Quantitative axes place missing and non-finite values in an `unknown` bin after the numeric ranges. Numeric bin edges are labeled without SI prefixes.
* In `attributes.axis`, an optional `'@transform'` after the input columns marks where the value the transform computes goes (in `attributes.color` when that value is drawn as a color); it is never an axis label.
* Reducers: `count`, `sum`, `avg`, `min`, and `max`.
* Time resolutions: `hour`, `day`, `weekday`, `monthday`, `month`, and `year`.

### Extending autk-plot

The 24 built-in plots and the 12 built-in transforms are registered with the same functions as yours, and drawn and run by the same code: none is privileged. Their definitions are reference examples: `registeredPlot('barchart')` and `registeredTransform('fold')` return them (frozen), and their sources in `src/plots` and `src/transforms/presets` use only public exports. Built-in names are reserved.

* `registerTransform(definition)`: Adds a transform with provenance, used as `{ preset: 'registered', name }`. Its rows have one of eleven shapes (`category-value`, `series`, `hierarchy`, `flows`…), and every plot that reads that shape draws them. `checkTransformReport` checks its six provenance invariants.
* `registerPlot(definition)`: Turns plain D3 drawing code into a chart, used as `{ type: 'registered', plot: name }`. The code only annotates its selectable marks (class `autkMark`, with their own row as D3 datum); selection, linking and the segregated view come with it, and the highlight is inferred from the geometry of the marks. Only `name` and `draw` are required; optional fields declare the highlight (`highlight`), the series to redraw, the transforms and reducers the plot reads, and the style of a highlighted mark, and the drawing context offers axes, formats, a legend and tick counts. `checkPlot` checks its six drawing invariants.

### Writing a chart

A chart is plain D3 code. `draw` receives the rendered rows and a marks group; bind the rows themselves to the selectable marks and give them the class `autkMark`:

```ts
import * as d3 from 'd3';
import { AutkPlot, PlotEvent, registerPlot } from '@urban-toolkit/autk-plot';

registerPlot({
  name: 'dots',
  draw({ group, rows, value, width, height, axisX, axisY }) {
    // value(row, i) reads the i-th field of attributes.axis, nested paths included ('sjoin.count.noise').
    const x = d3.scaleLinear(d3.extent(rows, row => Number(value(row, 0))) as [number, number], [0, width]);
    const y = d3.scaleLinear(d3.extent(rows, row => Number(value(row, 1))) as [number, number], [height, 0]);
    axisX(d3.axisBottom(x));
    axisY(d3.axisLeft(y));
    group.selectAll('circle').data(rows).join('circle')
      .attr('class', 'autkMark')
      .attr('cx', row => x(Number(value(row, 0))))
      .attr('cy', row => y(Number(value(row, 1))))
      .attr('r', 4);
  },
});

new AutkPlot(container, {
  type: 'registered', plot: 'dots', collection,
  attributes: { axis: ['population', 'income'] },
  events: [PlotEvent.BRUSH],
});
```

`width` and `height` are the drawing area inside the margins (`margins` in the config). Besides `group` and `rows`, the context gives `html` (a container for HTML marks), `fields`, `format(i)` (the axis's configured format, or by default SI prefixes from one up and decimals under one: `0.5`, not `500m`), `hasFormat(i)` (whether that axis has a configured format: a numeric category is otherwise written as it is), `axisLabels`, `legend`, `tickCount` and `interactive` (whether the configuration asks for any `events`). `axisX` and `axisY` label an axis with the field it shows: by default the first and second fields, or `axisX(axis, 1)` for the field of index 1 (a horizontal bar chart), or a text. Autark colors the marks (gray, and the selection color) and gives them the pointer cursor when clicks select; style anything else by state with `markStyle`. Optional fields declare the transforms and reducers the chart reads (`transforms`, `requiresTransform`, `reducers`), the highlight (`highlight`: a word such as `'boolean'`, `'subset'`, `'glyph'` or `'trace'`, a rule per mark family such as `{ rect: { mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' } }`, or a function that draws the parts), and defaults and checks of the config (`defaults`, `validate`).

### Writing a transform

A transform turns one row per feature into the rows a chart draws, with their provenance: stages `D1…Dn`, weighted relations from the features (`D0`) to the rows, one id per row (`rowIds`), the units each row reduces (`contributions`), and the reducer. Public blocks build it: `collectBuckets` groups and reduces rows, and `binnedProvenance`, `unnestedProvenance` and `rowwiseProvenance` record the relations of a partition, of an unnest then partition, and of one row per feature.

```ts
import { AutkPlot, binnedProvenance, collectBuckets, indexedBins, registerTransform } from '@urban-toolkit/autk-plot';

registerTransform({
  name: 'by-initial',
  shape: 'category-value', // { label, value } rows: bar, pie, donut and waffle charts read them
  run(rows, options, columns) {
    const buckets = collectBuckets({
      rows, reducer: 'count', valueOf: undefined,
      bucketOf: row => String(row[columns[0]] ?? '').charAt(0) || null,
    });
    const keys = buckets.map(bucket => bucket.key);
    return {
      rows: buckets.map(bucket => ({ label: bucket.key, value: bucket.value, autkIds: bucket.autkIds })),
      provenance: binnedProvenance({ rows, buckets, bins: indexedBins(keys, keys, 'initial'), binLabel: 'initials', rowKeys: keys, reducer: 'count' }),
    };
  },
});

new AutkPlot(container, {
  type: 'barchart', collection,
  attributes: { axis: ['name', '@transform'] },
  transform: { preset: 'registered', name: 'by-initial' },
});
```

The sources of the built-in transforms (`src/transforms/presets`) are written the same way.

### Tests

The transform baselines run with the repository's Vitest suite. The plot tests draw and select in a real DOM, so they run in headless Chrome: run `npm run test:browser --workspace=@urban-toolkit/autk-plot` from the repository root (local sources through Vite, no downloaded fixtures; requires Node with built-in WebSocket support and Chrome; set `CHROME_BIN` if Chrome is not at the default macOS, Linux or Windows path). They keep Vitest's API; `test/harness.ts` runs them in the page with Vitest's own `expect`. `test/baselines/` holds the outputs of the original autk-plot 4.1.1, which the baseline tests compare against, and the snapshots of the hand-written plots each built-in plot reproduces (`natives.json`, recorded in Chrome; record again only on purpose with `AUTK_RECORD=1`).

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
