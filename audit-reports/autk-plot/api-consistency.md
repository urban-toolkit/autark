# `@urban-toolkit/autk-plot` API consistency audit

## Summary

The unified wrapper is clear, but public exports, configuration typing, event timing, transform contracts, and style ownership do not fully match implementation behavior.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| High | `UnifiedPlotConfig` is not discriminated by plot type requirements. | It is one `Omit<PlotConfig, 'div'> & { type: PlotType }` (`api.ts:81-88`); scatter requires two axes (`scatterplot.ts:66`), heatmatrix requires `binning-2d` (`heatmatrix.ts:53-55`), and linechart requires one of two transforms (`linechart.ts:65-70`). | Many invalid configurations compile and fail only during construction. | Define a union of `ScatterplotConfig`, `HeatmatrixConfig`, etc., with required axis tuples and transform discriminants. |
| Medium | Concrete plot classes exist but are not exported at the package root, while base classes are. | `plots/index.ts` exports six concrete classes; root `index.ts:32-33` exports `PlotBaseData`/`PlotBaseInteractive` but not the concrete classes. Source docs show direct `new Scatterplot(...)`. | Advanced users get implementation bases but not the ready implementations those bases support. | Either export concrete classes intentionally, or make bases internal and document `AutkPlot.instance` as the only advanced surface. |
| Medium | Brush events are described as post-interaction but emitted during start, brush, and end. | `types-events.ts` says “Emitted after”; handlers subscribe to `'start brush end'` and emit on each callback (`plot-base-interactive.ts:287-301,326-340,369-397`). | One gesture can emit several indistinguishable events, causing excessive linked-view work. | Emit once on `end` by default, or expose event phase in payload/configurable continuous mode. |
| Medium | Transform value requirements are only comments and are inconsistently implemented. | API says non-count reducers require `options.value` (`api.ts:113,133`); binning-1d falls back to the binned attribute (`binning-1d.ts:73-76`), while binning-2d falls back to implicit ones (`binning-2d.ts:93`). | Equivalent transform configurations have different meanings. | Use reducer-discriminated option unions and reject missing value fields consistently. |
| Medium | Styling ownership differs from map. | `PlotStyle` is static process-wide (`plot-style.ts:9-16`); `MapStyle` is per map. | Multiple plots cannot have independent default/highlight colors, and cross-package theming has two ownership models. | Add instance style/theme config and optionally share core theme primitives. |
| Medium | `run()` silently routes unknown runtime presets to `reduce-series`. | Dispatcher’s final branch is unconditional (`transforms/index.ts:61-67`) and docs say it falls through. | Untyped JS or decoded JSON with a typo runs the wrong transform rather than failing. | Use an exhaustive switch with an explicit unsupported-preset error. |
| Low | Plot constructors draw immediately while also exposing `draw()`. | Each concrete constructor calls `draw()`; wrapper exposes `draw()` (`plot.ts:130-137`). | Callers cannot configure/listen before the first render, unlike map’s explicit initialization model. | Document eager rendering clearly or offer `autoDraw: false`/explicit initialization. |

## Recommended order

1. Introduce plot-specific discriminated configs and transform option unions.
2. Standardize event timing and unknown-preset handling.
3. Decide concrete/base class export policy.
4. Move styling to instance ownership.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
