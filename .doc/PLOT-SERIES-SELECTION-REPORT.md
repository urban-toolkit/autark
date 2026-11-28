# Series-aware plot selection: implementation report

## Decision

Replace the plot `shares` array with one object keyed by source feature ID. Migrate all in-repository consumers together; do not emit, accept, or maintain two public formats. Keep the callback names, `selection: number[]`, brush `extent`, and `plot.setSelection(selection, shares?)` argument order. This is a breaking change for external consumers of plot shares; document it in the plot README and release migration notes. Do not change `AutkMap`, its events, its selection API, or its whole-feature highlight.

```ts
{
    selection: [12],
    shares: {
        12: {
            feature: { selectedUnits: 2, totalUnits: 2 },
            series: [
                { id: 'JFK', selectedUnits: 1, totalUnits: 3 },
                { id: 'LaGuardia', selectedUnits: 2, totalUnits: 2 },
            ],
        },
    },
}
```

- Emit each selected source ID once, and each selected series key once per ID. Do not emit mark IDs or buckets. The example shows what the format can express; today `attributes.series` assigns each feature to one series. This work does not expand grouping or add named collections.
- `shares[id].feature` is the existing feature-level coverage, not a sum or average across series. Its current provenance rule returns the highest coverage when a feature has contributions in multiple stages or unit groups. For a series entry with counts, calculate coverage within that feature and series using the same weighting and stage/group rule. Each series entry uses `id` for the series key. A selected feature with no fractional coverage to report can have a series entry such as `{ id: 'JFK' }`. When counts exist, both counts are present. Do not fabricate `1/1` counts for membership-only entries.
- Ungrouped aggregated selections report `feature` only; ungrouped one-to-one selections can still omit `shares`. An empty selection carries no shares. When clearing one brush leaves another active, emit shares for the remaining selection even though `extent` is `null`. `selection` remains authoritative: shares for IDs outside it must not cause a highlight.

## Click, brush, and linked reaction

- **Local click:** Toggle the hit mark only, so selecting one line point does not select its neighbors or the equivalent point in another series. Preserve the existing ability to accumulate local clicks. Check the transition from external selection to local click: the current code seeds the local mark set from external IDs, so it can accidentally carry unrelated inferred marks into the next local payload. For grouped plots, the first local click starts a local mark selection rather than inheriting those inferred marks.
- **Local brush:** Hit-test the actual rendered marks using the existing brush geometry. Collect their feature–series pairs, then deduplicate `selection`. An X brush can pick multiple series in the same interval. `extent` continues to describe the brush, not replace the selected pairs.
- **Grouped receiving plot:** When an ID has series entries, only matching keys are eligible; a nonmatching key must not fall back to that feature's overall share. When no series entries were provided for that ID (for example, from the map or an ungrouped plot), keep ID-based matching. Callers linking different feature ID spaces or unrelated series groupings must remap the payload or forward only the feature-level data; matching keys are not a cross-dataset identity system.
- **Boolean highlight:** Use eligible features to decide which marks to highlight. Membership-only metadata must not activate partial geometry. In a mixed selection, an eligible mark without coverage still gets a whole-mark highlight rather than disappearing.
- **Partial highlight:** One-to-one marks use the matching series counts if supplied; ungrouped receivers and grouped receivers given feature-only data use `shares[id].feature`. Aggregated receivers continue recomputing subset values from their own provenance, but only for features eligible for the target row's series. Do not scale an aggregate using the sending view's fractions: the two views may represent different units. This is feature-and-series linking, not exact bucket replay.
- **Visual encoding:** Preserve the legend color on selected grouped marks, including subset points, bar fills, and line paths. Use a non-color cue such as an outline or a heavier overlay stroke. Preserve existing gaps, scales, clipping, and ungrouped styles. Hover and annotations are outside this API change.

## Repository impact

| Area | Required change |
| --- | --- |
| Public types and provenance | `autk-plot/src/types-events.ts`, `types-provenance.ts`, `index.ts`, and `plot.ts`: switch the public event and setter together. `provenance/model.ts`: migrate the exported `featureShares()` result and preserve weighting and feature-level semantics. `series.ts` and `transforms/grouped-reduce-series.ts`: use the resolved group for each row; keep series identity separate from the provenance unit groups used by transforms such as Sankey and fold. |
| Selection engine | `autk-plot/src/plot-base-interactive.ts`: update click/brush payloads, incoming mark matching, and partial contribution lookup. In particular, `segregatedActive` currently checks whether shares exist; it must distinguish actual counts from membership metadata. Keep selection reprojection consistent after a redraw. |
| Series-capable rendering | Update the shared `autk-plot/src/plots/registered.ts` path so grouped scatter and bubble glyphs, bar lengths, reduced-line points and paths, and registered plots that opt in with `series: true` all use the same rules. `drawAutoParts()` and `appendSeriesPart()` currently use one global highlight color. Review custom highlight functions too: the engine must supply only eligible parts and expose row-level series colors, without overriding styling owned by the extension. Area charts do not currently support grouping; preserve their existing partial geometry under the new payload. |
| Apps and examples | `usecases/src/provenance/app.ts` already forwards `data.shares` and reapplies it to remounted lab plots; verify both paths and leave the map forwarding `selection` only. Review gallery links and their displayed snippets in `gallery/code.ts` and `gallery/source.ts`: the Manhattan noise example currently drops shares between the line and hexbin; the split taxi scatters remap source IDs, so any forwarded shares must be filtered and rekeyed with those IDs. The airport timeline example in `gallery/src/autk-plot/bubble-annotations.ts` currently discards the airport on click and compares both airports; make clicks airport-aware while keeping its explicit X-brush comparison by hour. ID-only links need no format change when that is their intended behavior. Regenerate provenance lab templates if built-in plot sources change. |
| Tests and docs | Update share fixtures and assertions, the provenance equivalence tests, and the native snapshot serializer. Verify existing ungrouped geometry and interactions independently of expected payload changes; do not treat wholesale snapshot regeneration as validation. Update package docs and public examples. |

## Acceptance and verification

1. Click one grouped line point: only that local mark is highlighted; its event has its contributor IDs and one series entry per ID. Brush across two series: both are represented, and a feature contributing to several selected points appears once in `selection`. Test the same ID with two series entries at the input/provenance level; current source grouping cannot produce that case through a public chart config.
2. Link into grouped line, scatter, bubble, bar, and a registered plot. Test matching and nonmatching series, membership-only vs. partial coverage, mixed coverage, filtered or out-of-domain rows, and clearing/restoring styles. Verify line overlay paths and points retain their series colors and do not bridge missing buckets.
3. Verify map-to-plot still highlights by ID, plot-to-map remains whole-feature only, and plot-to-plot links without shared grouping still work with feature-only data. Verify fractional density, Sankey step/column coverage, and existing ungrouped partial highlights keep their values and geometry.
4. Run `npm test`, `node autk-plot/test/run-browser.mjs`, and `make verify`; exercise the provenance app and the affected gallery examples in the browser. Rebuild workspace packages before checking app types against their updated declarations.

## Implementation verification

- The keyed payload replaced the array in plot events, `setSelection()`, and `provenance.featureShares()`. The map did not change.
- The plot browser suite passed all 658 tests. The workspace Vitest suite passed 1,461 tests with three skipped (`npm test -- --maxWorkers=3`). Workspace type checking and package validation passed.
- Chrome smoke checks confirmed distinct linked overlay colors in Manhattan noise, airport-specific clicks and clear in the airport timeline, and correctly remapped hourly coverage in both taxi scatterplots.
