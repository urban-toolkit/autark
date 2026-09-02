# `@urban-toolkit/autk-plot` bug audit

## Summary

Confirmed defects affect numeric bin correctness, transform reducers, combined interactions, selection after redraw, empty categories, and negative bars.

## Findings

### 1. Numeric bins can collapse because display labels are used as bucket keys — High

**Evidence:** bin assignment uses precise `minValue`/`binWidth`, but labels are built from rounded bounds and `.2s` formatting (`binning-1d.ts:145-167`). `reduceBuckets()` groups by that label. `labelToOrder` retains only the first occurrence (`binning-1d.ts:152-155`).

**Impact:** distinct bins with equal rounded/SI labels merge into one aggregate. This is common for narrow ranges at large magnitudes, changing counts/sums and heatmatrix cells.

**Fix:** use an internal bin index as the grouping key, store precise boundaries, and generate a display label only after reduction. Ensure labels remain unique or include precision sufficient for adjacent bounds.

### 2. Binning-2d non-count reducers without `value` return fabricated results — High

**Evidence:** when `valueAttr` is absent, `valueOf` is `undefined` even for sum/avg/min/max (`binning-2d.ts:93-97`). `reduceBuckets()` then uses numeric value `1` (`kernel.ts:72`).

**Impact:** sum becomes count and avg/min/max become 1 instead of reporting invalid configuration.

**Fix:** reject non-count reducers without `options.value`; encode this requirement in the public union.

### 3. Click and brush modes interfere — High

**Evidence:** plots append marks, then `configureSignalListeners()` calls D3 brush on the same group (`scatterplot.ts:190-202`; `plot-base-interactive.ts:276-303`). D3 appends a brush overlay after the marks, so it receives pointer input above them.

**Impact:** when both `CLICK` and a brush event are enabled, the overlay can prevent mark click handlers from receiving clicks.

**Fix:** define an interaction arbitration model: modifier-key brush, separate overlay activation, pointer-event routing, or mutually exclusive modes with a configuration error.

### 4. Local bijective selections cannot be deselected after redraw — High

**Evidence:** `draw()` rebuilds every source datum (`plot-base-data.ts:151-158,247-255`). `restoreLocalSelectionAfterDraw()` only rehydrates aggregated projection (`plot-base-interactive.ts:525-537`). Old objects remain in `_selectedMarkDatums`; clicking a new datum adds/removes only the new object, while feature sync still sees the stale one (`plot-base-interactive.ts:247-258,783-789`).

**Impact:** after manual redraw or table sort, a previously selected feature can remain selected even when clicked to deselect.

**Fix:** rebuild `_selectedMarkDatums` from `_selectedFeatureIds` for both projection modes after data refresh, replacing stale object references.

### 5. Aggregated selection does not round-trip through the public source-ID API — Medium

**Evidence:** local aggregate highlighting checks exact selected mark objects, while external highlighting selects every aggregate sharing any source ID (`plot-base-interactive.ts:194-204`). The public getter exposes only source IDs (`plot-base-interactive.ts:72-74`) and `setSelection()` restores from those IDs (`plot-base-interactive.ts:109-118`).

**Impact:** passing a locally selected aggregate's `selection` back through `setSelection()`—or to another equivalent plot—can highlight additional overlapping aggregates that were not originally selected.

**Fix:** expose stable aggregate/mark IDs alongside source IDs and define explicit projection semantics. Make local-to-external round trips idempotent or let callers choose source versus mark selection.

### 6. Empty-string bucket keys are silently dropped — Medium

**Evidence:** `reduceBuckets()` uses `if (!key) return` (`kernel.ts:54`) although the callback contract says return `null` to skip. Categorical binning legitimately maps an empty string to `''` (`binning-1d.ts:132`).

**Impact:** rows in an empty-string category disappear from counts and provenance.

**Fix:** skip only `key === null`; preserve empty string and other valid string keys.

### 7. Invalid/zero bin counts are not rejected — Medium

**Evidence:** `numBins` is used directly in division, loops, and clamping (`binning-1d.ts:66,145-169`); 2D bin counts delegate to the same mapper.

**Impact:** zero, negative, fractional, `NaN`, or infinite values create invalid boundaries, empty maps, or non-terminating work.

**Fix:** require finite positive integer bin counts with a documented upper limit.

### 8. Barcharts do not render negative values correctly — Medium

**Evidence:** y domain is forced to `[0, max]` (`barchart.ts:133-134`), and bar height is `height - mapY(value)` (`barchart.ts:225-226`). Negative values map beyond the baseline and produce negative SVG heights.

**Impact:** negative bars disappear or render invalidly.

**Fix:** include zero in `[min,max]`, compute a zero baseline, and use absolute height plus the smaller y coordinate.

### 9. Numeric plots silently coerce missing/invalid values to zero — Medium

**Evidence:** scatter and parallel coordinates repeatedly use `Number(value) || 0` (`scatterplot.ts:117-120,196-197`; `pcoordinates.ts:126,285`).

**Impact:** missing strings/NaN are plotted as real zero observations, biasing domains and selections; infinity can still poison scales.

**Fix:** validate finite values, omit/mark invalid observations, and expose an invalid-data policy.

### 10. Duplicate table labels sort the wrong column — Low

**Evidence:** header mapping uses `_axisLabels.indexOf(axisLabel)` (`tablevis.ts:121,204,210`).

**Impact:** repeated display labels always resolve to the first column.

**Fix:** bind headers to `{ attribute, label, index }` records rather than reverse-looking up display text.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
