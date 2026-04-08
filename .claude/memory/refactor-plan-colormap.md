# Refactoring Plan: Centralized Colormap Architecture

**Date**: 2024-05-21

**Goal**: Refactor the `autk-plot` module to centralize all color-mapping logic within the `ChartBase` class. This will dramatically reduce boilerplate code in individual chart implementations, ensure a consistent visual language, and simplify the creation of new charts.

---

## Final Architecture Decisions

This plan incorporates all final decisions made during our architectural discussion:

1.  **Strict API**: The `ChartConfig` will be updated to use a strict object format for `attributes` and `labels` (e.g., `{ axis: string[], color?: string }`). There will be **no legacy support** for the old array format. The `ScatterplotChartConfig` will not override the `attributes` type; validation will occur in the constructor.

2.  **Centralized Color Logic**: All color resolution logic (selection highlight, default color, and data-driven colormaps) will be centralized in a `getMarkColor(d)` method within the `ChartBase` class.

3.  **Full Domain Support**: The base class will correctly handle and preserve all domain types supported by `autk-core`'s `ColorMap` engine, including sequential (`[min, max]`), diverging (`[min, ref, max]`), and categorical (`string[]`).

4.  **Dynamic Geometry Inference**: The `applyMarkStyles` method in `ChartBase` will automatically infer whether to apply color to the `fill` or `stroke` property by inspecting the SVG element type (`<rect>`, `<circle>`, `<line>`, `<path>`). This eliminates the need for most chart-specific overrides.

5.  **Full Migration**: All 15+ examples in the `gallery` and `usecases` directories will be updated to conform to the new strict API.

6.  **Documentation Update**: The `SKILL.md` guide for creating new charts will be updated to reflect the new, simpler architecture and best practices.

---

## Implementation Plan

The implementation is broken down into four distinct Pull Requests (PRs) to ensure a safe, reviewable, and incremental rollout.

### PR 1: Core API & Base Class Intelligence

**Goal**: Implement the strict, object-based configuration and the intelligent, centralized color management engine in the base class.

*   **`autk-plot/src/api.ts`**
    *   `ChartConfig`: Change `attributes` to `{ axis?: string[], color?: string }`.
    *   `ChartConfig`: Change `labels` to `{ axis?: string[], title?: string, color?: string }`.
    *   `ChartConfig`: Change `domain` to `number[] | string[]` to support diverging and categorical domains.
    *   `ScatterplotChartConfig`: Remove the redundant `attributes` override.

*   **`autk-plot/src/chart-base.ts`**
    *   **Properties**: Rename `_attributes` to `_axisAttributes`. Add `_colorAttribute`, `_colorLabel`, `_domain` (as `number[] | string[]`), and `_categoricalDomain`.
    *   **`constructor()`**: Update to parse the new `{ axis, color }` object structure from the config.
    *   **`draw()`**: Add a call to `this.computeColorDomain()` after `this.computeTransform()`.
    *   **`computeColorDomain()` (New)**: This method will:
        1.  Check if `_colorAttribute` is set.
        2.  Extract all values for that attribute from `this.data`.
        3.  Call `ColorMap.resolveDomainFromData()` to get the correct domain (sequential, diverging, or categorical).
        4.  Cache the result in `this._domain` or `this._categoricalDomain`, preserving the full structure (e.g., `[min, ref, max]`).
    *   **`getMarkColor(d)` (New)**: This core resolver will:
        1.  Check if the datum `d` is selected, returning `ChartStyle.highlight` if so.
        2.  If not selected, check if a `_colorAttribute` is active.
        3.  If so, get the datum's value and use the cached domain to get the correct color from `ColorMap.getColor()`.
        4.  If no color attribute is active, return `ChartStyle.default`.
    *   **`applyMarkStyles(svgs)` (Rewritten)**: This method will be completely replaced with a new implementation that:
        1.  Iterates over each mark using `.each()`.
        2.  Inspects the SVG `nodeName` (`rect`, `circle`, `line`, `path`).
        3.  Dynamically determines whether to style the `fill` or `stroke` property.
        4.  Applies the color by calling `this.getMarkColor(d)`.

*   **`autk-plot/src/charts/*.ts` (Simple Charts)**
    *   In `barchart.ts`, `scatterplot.ts`, and `tablevis.ts`, find all uses of `this._attributes` and rename them to `this._axisAttributes`.

---

### PR 2: Refactor Advanced Charts

**Goal**: Remove all custom color-handling boilerplate from `heatmatrix` and `pcoordinates`, forcing them to use the new, intelligent base class implementation.

*   **`autk-plot/src/charts/heatmatrix.ts`**
    *   `computeTransform()`: Add a line to set `this._colorAttribute` to the name of the value column (e.g., `this._axisAttributes[2]`).
    *   `render()`: In the mark creation chain, replace the manual color calculation with a simple call: `.style('fill', d => this.getMarkColor(d))`.
    *   `applyMarkStyles()`: **Delete this entire method override.**

*   **`autk-plot/src/charts/pcoordinates.ts`**
    *   `render()`: In the axis label `.on('click')` handler, replace the custom `this.colorDimension` logic with `this._colorAttribute = dim` and a call to `this.computeColorDomain()`.
    *   `applyMarkStyles()`: **Delete all color-related logic** (the `if/else` block for `strokeFn`). The override will now only contain:
        1.  A call to `super.applyMarkStyles(svgs)` to handle the stroke color.
        2.  The existing lines that modify `opacity`, `stroke-width`, and `.raise()` selected elements.
    *   `updateAxisLabelStyles()`: Update this method to check `this._colorAttribute` instead of `this.colorDimension`.

---

### PR 3: Migrate All Examples

**Goal**: Update every `AutkChart` instantiation across the entire repository to use the new strict configuration API. This is a required step to ensure the project builds without errors.

*   **Files Affected**: All `.ts` files within `gallery/src/autk-plot/`, `usecases/src/niteroi/`, `usecases/src/urbane/`, and `usecases/src/shadows/`.

*   **Change Required**: For each `new AutkChart(...)` call, the `attributes` and `labels` properties must be converted from the old array format to the new object format.

    *   **Example Change:**
        ```typescript
        // --- OLD ---
        new AutkChart(div, {
            type: 'scatterplot',
            collection: geojson,
            attributes: ['shape_area', 'shape_leng'],
            labels: { axis: ['Area', 'Length'], title: 'Plot' }
        });

        // --- NEW ---
        new AutkChart(div, {
            type: 'scatterplot',
            collection: geojson,
            attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['Area', 'Length'], title: 'Plot' }
        });
        ```
    *   If a chart was implicitly using a third attribute for color, it will now be made explicit: `attributes: { axis: ['a', 'b'], color: 'c' }`.

---

### PR 4: Update Documentation

**Goal**: Ensure the developer guidelines in `SKILL.md` reflect the new, simpler, and more powerful architecture.

*   **`.claude/skills/new-chart/SKILL.md`**
    *   **Section 1 (Skeleton)**: Update the example `ChartConfig` to use the `{ axis, color }` object structure.
    *   **Section 2 (render)**: In the mark creation example, change `.style('fill', ChartStyle.default)` to `.style('fill', d => this.getMarkColor(d))`.
    *   **Section 5 (Overrides)**: Completely rewrite the `applyMarkStyles()` section. The new guidance will state:
        *   **Do not** override this method for color purposes.
        *   Explain that the base class automatically infers `fill` vs. `stroke`.
        *   Clarify that an override is now only necessary for complex, non-color selection effects like changing `opacity`, `stroke-width`, or using `.raise()`.
