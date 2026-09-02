# `@urban-toolkit/autk-plot` code-improvement audit

## Summary

Plot can become smaller and more reliable by validating configs/transforms once, separating stable provenance from user properties, consolidating repeated SVG scaffolding, and removing unused dependencies.

## Opportunities

### High priority

1. **Introduce plot-specific normalized configs.**
   Parse public discriminated configs into immutable internal settings once. Validate axis counts/types, transform compatibility, reducer requirements, dimensions, tick formats, margins, and finite sizes before any DOM mutation.

2. **Use stable internal provenance outside feature properties.**
   Source rows are created by spreading properties and then assigning `autkIds` (`plot-base-data.ts:103-108,247-255`). This silently overwrites a user property with that name. Store provenance in a wrapper record, symbol, or namespaced metadata field that cannot collide.

3. **Fix selection identity around source IDs, not object identity.**
   `_selectedMarkDatums` stores ephemeral transformed/source objects. Use stable mark keys derived from transform bucket IDs and source provenance, then rebuild rendered selection after every data refresh.

4. **Build transform keys separately from labels.**
   Numeric/categorical transforms should return stable typed bucket keys plus display labels/order/bounds. This avoids formatting-driven aggregation errors and simplifies sorting.

### Medium priority

5. **Remove unused runtime dependencies.**
   Source imports only D3 and core, but `package.json:51,54-56` lists Turf, Vega, Vega Embed, and Vega-Lite. Remove them unless an exported feature actually uses them; this substantially reduces install/audit footprint.

6. **Extract shared SVG scaffold/axis/title helpers.**
   Scatter, bar, heatmatrix, line, and parallel-coordinate plots repeat root SVG joins, `#plot`, title, margins, and axis labels. Consolidate the stable scaffold without hiding plot-specific scales/marks.

7. **Avoid document-global IDs.**
   Every plot creates `id="plot"`, `axisX`, `axisY`, and `plotTitle`. Selections are scoped, but duplicate IDs are invalid HTML and can confuse CSS/accessibility/tools. Use classes or per-instance IDs.

8. **Replace `any` in D3 event/geometry paths.**
   Brush handlers use `event: any`; path geometry and table selection types contain more `any`. Define D3 brush event aliases and narrow SVG geometry interfaces.

9. **Do not mutate constructor config.**
   Concrete constructors assign defaults and transforms onto `config` (`tablevis.ts:52-61` and other plot constructors). Normalize into new objects, especially for direct concrete-class consumers.

10. **Separate interaction setup from every draw.**
    Redraw currently recreates brush behaviors and rewires handlers. Maintain interaction state explicitly, restore visible brush extents when appropriate, and clear stale active rectangles on layout/data changes.

11. **Add lifecycle cleanup.**
    There is no `destroy()` on `AutkPlot`. Add idempotent cleanup for D3 handlers, DOM ownership, brush state, and event listeners.

12. **Make sizing responsive and validated.**
    Width/height use `config.width || 800`, which treats zero as absent and accepts negative/non-finite truthy values. Normalize finite positive dimensions and optionally observe container size.

## Suggested sequence

1. Normalize configs and provenance/selection identity.
2. Correct transform key modeling.
3. Remove dependencies and consolidate scaffolding.
4. Improve lifecycle, interaction state, IDs, typing, and responsive sizing.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
