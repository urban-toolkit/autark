# `@urban-toolkit/autk-plot` new-feature opportunities

## Summary

Plot has a solid linked-selection foundation. The most valuable additions are lifecycle/responsiveness, richer chart semantics, accessible interaction, and scalable data updates.

## Evidence basis

Constructors eagerly draw and the wrapper exposes redraw but no disposal (`plot.ts:130-137`); source rows are fully rebuilt on draw (`plot-base-data.ts:151-158,247-255`); brush listeners combine start/brush/end without phase metadata (`plot-base-interactive.ts:287-301,326-340,369-397`); and style defaults are process-global (`plot-style.ts:9-16`). Numeric bin identity is also coupled to formatted labels (`binning-1d.ts:145-167`). These gaps motivate lifecycle, explicit interactions, incremental updates, rich transform metadata, and instance themes.

## Opportunities

### 1. Responsive plot lifecycle — High

Add `resize()`, `ResizeObserver` support, `destroy()`, and `autoDraw`/deferred construction. Preserve selection and optional brush extents across responsive redraws.

### 2. Typed multi-series charts — High

Extend line/bar APIs with series/group channels, legends, stacked/grouped modes, confidence bands, and stable source provenance per series point. Avoid overloading generic axis arrays for these semantics.

### 3. Interaction policy and selection modes — High

Support explicit interaction configuration:

- replace/add/toggle selection;
- AND/OR multi-brush mode as public config;
- click versus brush arbitration/modifier keys;
- continuous versus end-only events;
- clear controls and externally controlled selection.

Include event phase and selected mark/bucket metadata while retaining source IDs.

### 4. Accessible marks and tables — High

Add keyboard navigation, focus styles, ARIA labels/descriptions, semantic titles, screen-reader summaries, and non-color selection indicators. Generate unique IDs for label relationships.

### 5. Tooltips and legend components — Medium

Provide reusable, configurable tooltips and categorical/continuous legends based on core colormap domains. Expose invalid/missing values and aggregate count/provenance in tooltip payloads.

### 6. Incremental/streaming updates — Medium

Add append/patch/remove APIs keyed by stable source IDs. Recompute only affected transforms/domains where possible and avoid replacing all datum objects on every draw.

### 7. Rich transform metadata — Medium

Return bin boundaries, exact keys, dropped-row diagnostics, invalid counts, reducer/value field, and source provenance. Expose transform execution separately for inspection before rendering.

### 8. More plot types — Medium

High-value additions for urban analytics include histograms as a first-class config, box/violin plots, stacked area, small multiples, network/flow views, and geospatially linked time brushing.

### 9. Shared cross-toolkit theme — Medium

Accept an instance theme compatible with map colors, highlights, invalid values, typography, and categorical palettes. Keep global defaults only as a compatibility layer.

### 10. Large-data rendering mode — Low

Offer canvas/WebGPU-backed scatter/density rendering above a configurable threshold while retaining SVG axes and linked source selection.

## Design constraints

- Preserve stable source provenance through every aggregation.
- Keep interaction event timing explicit.
- Never use formatted labels as aggregation identity.
- Styling and lifecycle should be instance-owned.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
