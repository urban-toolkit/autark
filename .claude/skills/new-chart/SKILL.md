---
name: new-chart
description: >
  Guide for implementing a new chart type in autk-plot. Use when the user asks
  to add a new chart, create a new visualization, or extend the chart system.
argument-hint: "[chart-type-name]"
---

# Implementing a new autk-plot chart

## Style rules

- Use `ChartConfig` directly. Only define a new discriminated config type in `api.ts` if the chart needs an option `ChartConfig` doesn't have.
- No helper functions. Keep all logic inside the class methods.
- Overrides (`computeTransform`, `applyMarkStyles`, `onSelectionUpdated`) are escape hatches — only use them when the default genuinely breaks for this chart.

---

## 1. File and class skeleton

Create `autk-plot/src/charts/<name>.ts`:

```typescript
import * as d3 from 'd3';
import { valueAtPath } from '../core-types';
import type { ChartConfig } from '../api';
import { ChartBase } from '../chart-base';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../events-types';

export class MyChart extends ChartBase {

    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.tickFormats === undefined) { config.tickFormats = ['~s', '~s']; }
        // Validate inputs here (throw if invalid)
        super(config);
        this.draw();
    }

    public render(): void {
        // see section 2
    }
}
```

---

## 2. render() — required skeleton (in this order)

```typescript
public render(): void {
    // 1. Create or reuse the root SVG
    const svg = d3.select(this._div)
        .selectAll('#plot').data([0]).join('svg')
        .attr('id', 'plot')
        .attr('width', this._width)
        .attr('height', this._height);

    const width  = this._width  - this._margins.left - this._margins.right;
    const height = this._height - this._margins.top  - this._margins.bottom;

    // 2. Title
    if (this._title) {
        svg.selectAll('#plotTitle').data([this._title]).join('text')
            .attr('id', 'plotTitle')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);
    }

    // 3. Scales and axes (chart-specific)
    // ...

    // 4. Marks group — must have both classes; brush wiring depends on them
    const cGroup = svg
        .selectAll('.autkBrush').data([0]).join('g')
        .attr('class', 'autkBrush autkMarksGroup')
        .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

    // 5. Clear rect — lets click-on-background reset the selection
    cGroup.selectAll('.autkClear').data([0]).join('rect')
        .attr('class', 'autkClear')
        .attr('width', width).attr('height', height)
        .style('fill', 'white').style('opacity', 0);

    // 6. Marks — bind this.data, use ChartStyle.default as initial fill
    cGroup.selectAll('.autkMark')
        .data(this.data)
        .join('circle')           // replace with rect/path/etc as needed
        .attr('class', 'autkMark')
        // ... position and size attributes ...
        .style('fill', ChartStyle.default);

    // 7. Wire interactions — always the last line
    this.configureSignalListeners();
}
```

---

## 3. DOM class conventions

The base class interaction system relies entirely on these classes/attributes being present:

| Class / Attribute | Purpose |
|---|---|
| `.autkMark` | Every interactive mark. The bound datum **must** carry `autkIds: number[]`. |
| `.autkMarksGroup` | Parent `<g>` of all marks. Used for brush coordinate offset math. |
| `.autkBrush` | Group that hosts the D3 brush. Usually the same `<g>` as `.autkMarksGroup`. |
| `.autkClear` | Invisible rect that resets selection on click. |
| `autkBrushId` attr | Only needed for multi-brush charts (e.g. one brush per axis). Keys the internal brush map. |

---

## 4. Type registration (3 files, all required)

**`autk-plot/src/api.ts`**

```typescript
// Extend the ChartType union:
export type ChartType = '...' | 'my-chart';

// Only add a new config type if your chart needs chart-specific config options:
export type MyChartConfig = Omit<ChartConfig, 'div'> & { type: 'my-chart'; myOption?: string };

// Add it to the discriminated union:
export type UnifiedChartConfig = ... | MyChartConfig;
```

**`autk-plot/src/main.ts`** — add a case to `createPlot()`:

```typescript
case 'my-chart': {
    const { type, ...chartConfig } = config;
    void type;
    return new MyChart({ div, ...chartConfig });
}
```

**`autk-plot/src/charts/index.ts`** — add the export:

```typescript
export { MyChart } from './mychartfile';
```

---

## 5. Overrides — only when the default breaks

### `computeTransform()` — only for charts that aggregate data

The default is a no-op. Override when the chart uses a transform preset (histogram, sort, temporal, timeseries, binning-2d, …):

```typescript
protected override computeTransform(): void {
    if (!this._transformConfig) return;
    const allRows = this._sourceFeatures.map((f, idx) => ({
        ...(f.properties ?? {}),
        autkIds: [idx],
    }));
    const transformed = run(allRows, this._transformConfig) as ExecutedXxxTransform;
    this.data = transformed.rows as any;
    this._attributes = transformed.attributes as unknown as string[];
}
```

When a transform is required (not optional), validate it in the constructor and skip the `if (!this._transformConfig) return` guard. Also: when a transform replaces `this._attributes`, do **not** add an `attributes` tuple to the chart's config type — the transform output is the authoritative attribute list.

#### Creating a new transform preset

If no existing preset covers the aggregation the chart needs, create one. Registration checklist (4 places):

1. **New file** `autk-plot/src/transforms/presets/<name>.ts` — name it after the operation, not the chart (e.g. `binning-2d.ts`, not `heatmatrix.ts`) to avoid naming collisions with the chart file
2. **`api.ts`** — add `XxxTransformConfig` type; add to `ChartTransformConfig` union
3. **`transforms/index.ts`** — `import` the runner; `export * from './presets/<name>'`; add `ExecutedXxxTransform` to `ExecutedChartTransform` union; add `if (config.preset === 'xxx') return runXxx(rows, config);` to `run()`
4. The chart file imports from `'../transforms'` (the index) — no direct preset import needed

### `applyMarkStyles()` — override when the default fill encoding loses information

The default sets every mark to either `ChartStyle.highlight` (selected) or `ChartStyle.default` (unselected). This is correct for most charts.

Override when marks carry a **data-driven fill** that should be preserved for unselected marks — for example a color-mapped heatmap cell that should stay colored while only selected cells switch to highlight. In that case, recompute the color domain from `this.data` and apply it per-mark:

```typescript
protected override applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
    const colorValues = this.data.map(d => d ? Number(valueAtPath(d, this._attributes[2])) || 0 : 0);
    const lo = this._domain?.[0] ?? Math.min(...colorValues);
    const hi = this._domain?.[1] ?? Math.max(...colorValues);
    const sel = this.selection;

    svgs.style('fill', (d: unknown) => {
        if ((d as AutkDatum)?.autkIds?.some(id => sel.includes(id))) return ChartStyle.highlight;
        const v = d ? Number(valueAtPath(d as Record<string, unknown>, this._attributes[2])) || 0 : 0;
        const { r, g, b } = ColorMap.getColor(v, this._colorMapInterpolator, [lo, hi]);
        return `rgb(${r},${g},${b})`;
    });
}
```

For stroke-based marks (paths, polylines) override for the same reason. See `pcoordinates.ts`.

### `onSelectionUpdated()` — only when marks must reorder on selection

The default no-op is correct for all SVG charts. Override only if mark DOM nodes need to be re-rendered or reordered when the selection changes (e.g. a table that pins selected rows to the top). See `tablevis.ts` for the pattern.

---

## Reference implementations

| File | What to look at |
|---|---|
| `autk-plot/src/charts/scatterplot.ts` | Simplest complete chart — good starting point |
| `autk-plot/src/charts/pcoordinates.ts` | `applyMarkStyles` override, multi-brush with `autkBrushId` |
| `autk-plot/src/charts/tablevis.ts` | `computeTransform` + `onSelectionUpdated` overrides |
| `autk-plot/src/chart-base.ts` | Full base class — all protected properties and interaction wiring |
