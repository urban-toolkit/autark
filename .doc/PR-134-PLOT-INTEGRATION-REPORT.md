# PR #134 audit against the new plot base

**Compared:** [PR #134](https://github.com/urban-toolkit/autark/pull/134) at `84b5de82` and `integrate/pr-119` at `cfab39c` (PR #119 head `de172f0` plus gallery fixes). The findings below describe the behavior before the port; see the implementation status at the end.

## Findings

| #134 concern | Status on #119 | Evidence and recommendation |
| --- | --- | --- |
| 1. Scatter colors on first render; selection colors after redraw | Covered | Five Chrome tests pass in `point-colors.browser.ts`: default, numeric and categorical colors, plus scatter and line selection after redraw. The line test checks the selected contribution, which is the new rendering contract. Keep #119's implementation. |
| 2. Table row clicks when click is disabled | Covered | Both tests in `table-row-clicks.browser.ts` pass, including receiving a selection before clicking a noninteractive row. |
| 3. Repeated SVG and axis IDs | Mostly covered | Three tests in `element-ids.browser.ts` pass: container isolation, no duplicate IDs, and scoped selectors. One #134 regression is still missing: `registered.ts` sets the whole SVG `class` attribute on redraw, which overwrites host-added classes. Add the redraw case and use `classed()` so the renderer does not own unrelated classes. |
| 4. True bin edges, distinct labels, and correct boundary membership | Partial | Existing edge-label tests pass for ordinary ranges. Running #134's full binning suite exposed failures for a rounded zero edge, SI prefixes on large edges, and decimal boundary membership: `0.3` can go into the preceding `0.1`-width bin. Port the shared numeric bin rules for 1D and both 2D axes. |
| 5. Axis titles overlap ticks or leave the frame | Covered for tested cases | Five Chrome tests pass in `axis-titles.browser.ts`, including rotated labels, narrow margins, and redraw. The newer registered renderer already measures labels and can grow margins; do not port the old layout algorithm. Add a targeted check that a redraw with short labels restores the configured margins; that specific #134 case was not rerun. |
| 6. Decimal labels below one and no synthetic line ticks between buckets | Covered | #119's Chrome tests pass for bar, line, scatter, and parallel coordinates and for line ticks at bucket positions. |
| 7. Numeric categories and buckets printed without SI shorthand or floating-point noise | Partial | Ordinary years, ZIP codes, long fractions, and caller formats are covered. Imported #134 probes fail for arithmetic-noise labels (`0.1 + 0.2` and its negative), and for a large single-value bin label. `barchart.ts` passes plain categories through as raw strings; preserve category identity and precision while formatting display labels. The large-bin mismatch belongs to the bin formatter. |
| 8. Short or missing `tickFormats` | Covered | Tests pass for short arrays, omitted entries, empty arrays, and explicit caller formats. |
| 9. Missing values counted as zero, treated as categories, or ordered first | Still present | Imported cases reproduce null in the first numeric bin, NaN triggering categorical behavior, `unknown` sorting first, and all-missing cases producing no bin or a `NaN` label. A 2D unknown column also sorts before numeric columns. Port these rules and assert source feature IDs as well as counts. |

## Recommended port order

1. **Fix numeric binning first.** Use one edge and missing-value policy for 1D and 2D: internal edges open the next bin, the final edge belongs to the final bin, and missing values go in an `unknown` bin after numeric bins. Keep #119's deliberate retention of empty numeric bins. Test linked selection and provenance where a row changes bin, not just labels and totals.
2. **Fix display labels without changing keys.** Remove floating-point noise from raw numeric category labels, without truncating meaningful digits, converting ZIP codes, or reformatting labels already supplied by the transform. Explicit tick formats still win.
3. **Preserve host SVG classes.** Add the missing redraw regression. Add the configured-margin recovery test separately; only change layout code if it fails.

## Verification

- **29 existing Chrome cases passed:** point colors (5), table clicks (2), element IDs (3), axis titles (5), and tick formats (14).
- **#134 binning suite against #119:** 7 passed, 10 failed. The failures cover three edge/format cases, six 1D missing-value cases, and one 2D unknown-column case.
- **Five additional #134 tick probes in Chrome:** 2 passed, 3 failed (positive and negative floating-point artifacts, and the large single-value bin label).
- The initial audit ran the extra probes in the disposable #119 preview worktree.

## Implementation status

The port fixes numeric boundary membership and missing-value bins on both axes, retains empty 1D ranges, formats bin edges without SI prefixes, shortens raw numeric bar labels without changing keys, and preserves host SVG classes. Tests verify source IDs emitted by real plot clicks for corrected boundary and unknown bins. The existing axis-layout implementation passed the margin-reset regression unchanged.

The plot and generated-template suites passed 151 tests; the Chrome suite passed all 585 cases. The remaining integration step is to land the port on the branch before closing #134.
