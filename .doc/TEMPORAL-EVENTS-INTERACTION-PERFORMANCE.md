# Temporal events: Roads interaction performance report

## Finding

**The Roads hover freeze is a map-renderer regression exposed by linked plot hover, not a stall in SVG rendering or in the plot’s provenance calculation.** The visible polyline pipeline reads `highlightedVertices` inside its vertex loop. With hover active, every read recreates the *contents* of the entire hover mask. For a single day representing 315 roads, Chrome recorded a **34.2-second main-thread task**. Reading the mask once per visible upload eliminated the long task in the same browser-input reproduction, with all 315 road IDs still hovered.

Brushing has a different, smaller performance problem: road selection rebuilds the selection mask and reuploads geometry and state to both map pipelines. The registered plot adds measurable work to build brush provenance shares, but that is not the dominant cost on this page. Fix the mask read first; then separate map feature-state updates from geometry uploads before optimizing the plot more broadly.

## Reproduction and scope

1. Open [the Roads variant](http://localhost:5173/src/autk-plot/temporal-events-click.html?variant=roads) and wait for the chart and map to finish loading. The URL is equivalent to choosing **Roads** under **Group noise reports by**.
2. In Chrome DevTools **Performance**, record while moving onto a daily dot, such as March 9. Move directly onto the dot; moving only near the line need not trigger hover. Look under the next animation frame for `PipelinePolyline.updateVertexBuffers`, `get highlightedVertices`, and `_forEachUniqueVertexInComponents`.
3. Repeat with `?variant=neighborhoods` as a control. To profile brush selection separately, start off the dots and drag horizontally across the chart. To distinguish plot from map, temporarily make the corresponding plot-to-map listener a no-op in the profiling session and repeat.

Measurements used the running gallery and its workspace package bundles (`ac4a9fa4` plus existing working-tree changes), Chrome 158.0.8127.37 headless with WebGPU enabled, Apple M4 Pro / macOS 26.6.2, and a 1,440 × 1,000 browser viewport. For the headline comparison, Chrome DevTools Protocol dispatched the same mouse move on a fresh Roads page in each configuration. For the breakdown, browser-side probes timed actual plot and map methods while sending pointer and drag events through the page’s handlers. The isolated-plot runs bypassed the outbound map setter; inbound runs called `plot.setHover` or `plot.setSelection` directly to exclude GPU picking. The experiment that hoisted the mask read intercepted the generated map module for that Chrome session only; it did not change the server or repository code.

These are local measurements, not cross-device guarantees. Elapsed mouse-test time includes waiting for two animation frames. CPU method times are nested and must not be added twice. GPU buffer bytes are the payload submitted through `GPUQueue.writeBuffer`, not GPU execution time or GPU memory consumption. Startup, join time, physical-display latency, and end-to-end map pointer picking were not benchmarked.

| Runtime workload | Neighborhoods | Roads |
| --- | ---: | ---: |
| Map components | 38 | 8,166 |
| Event matches processed by the plot | 1,893 | 23,025 |
| Daily plot marks | 32 | 32 |
| Distinct features per populated day (median / max) | 23 / 28 | 546 / 741 |
| Road renderer expanded vertex count | — | 245,440 |

Roads uses a 200 m spatial join. One report can contribute to multiple roads; event matches and distinct road IDs are not interchangeable. The plot does not render thousands of dots: both variants render the same number of daily marks.

## Root cause and evidence

1. The [gallery wiring](../gallery/src/autk-plot/temporal-events-click.ts#L56-L62) sends all source IDs from `PlotEvent.HOVER` to `map.setHover`. The [plot handler](../autk-plot/src/plot-base-interactive.ts#L667-L700) hits the dot through the brush overlay and emits only when the mark changes. It does not recompute the spatial join or the time bins.
2. [`AutkMap.setHover`](../autk-map/src/map.ts#L1018-L1034) updates transient map state and emits an API-sourced event; the gallery only sends pointer-sourced map hover back to the chart. The expensive work is not event recursion. [`VectorLayer.setHoveredIds`](../autk-map/src/layer-vector.ts#L147-L152) marks the layer’s data dirty.
3. The [visible polyline upload](../autk-map/src/pipeline-polyline.ts#L110-L135) accesses `layer.highlightedVertices[i]` once per vertex. The [getter](../autk-map/src/layer-vector.ts#L136-L145) returns the base selection array cheaply when hover is empty. When hover is active, it copies the whole selection array into a reused scratch buffer, then walks the hovered components’ index ranges and creates a fresh `Set` to visit each vertex once. This repeats for **every** vertex even though neither selection nor hover changes during the upload. The picking branch does not read the mask; it encodes component IDs instead.
4. With `V` expanded vertices and `Iₕ` index entries for the hovered components, the faulty part scales as **O(V × (V + Iₕ))**. One read changes that to **O(V + Iₕ)**. The measured Roads upload read the getter 245,440 times. At 981,760 bytes per mask copy, this is about 241 GB of repeated CPU-side copy payload in one upload, before counting the index walks. That is not 241 GB sent to the GPU.

| Roads experiment | Observed result |
| --- | --- |
| Unmodified, browser mouse over March 9 | 315 hovered road IDs; 34.2 s long task; 34.22 s to the post-input observation |
| Unmodified, instrumented March 9 hover | 245,440 mask reads; 40.05 s in the visible upload; 4.1 ms in the picking upload; roughly 0.1 ms each in plot hit testing and `map.setHover` |
| One-read prototype, same browser mouse move | 315 hovered road IDs; no task ≥50 ms reported; 49 ms to the post-input observation (includes frame waits) |
| One-read prototype, seven daily dots and clear | One mask read per visible upload, zero per picking upload; median 9.3 ms in the road layer’s render pass, max 9.8 ms |
| Plot pointer hover with map listener bypassed | Roads median 0.3 ms hit test and 0.1 ms hover painting; no road uploads |
| Neighborhoods, unmodified linked hover on seven dots and clear | Median 1.9 ms / max 2.6 ms in the layer’s render pass; eight mask reads total |

The CPU profile of the instrumented slow run attributed approximately 22.7 s of sampled self time to the active `highlightedVertices` getter and 14.6 s to its index traversal. These are profiling estimates, not independent timers. Polygon neighborhoods use a pipeline that reads the mask once, not the per-polyline-vertex access. A direct map-pointer hover over a road can hit the same bad upload path after the GPU pick resolves; the headline timings are specifically plot-to-map hover.

## What the plot rewrite costs here

- **Local plot hover:** The 32-node hit test and style update were sub-millisecond in the measured sweep. Passing several hundred IDs was not the bottleneck; the setter itself returned in about 0.1 ms in the single-day stall. Keep the requirement to hover *all* matching roads.
- **Map-to-plot partial hover:** For eight individual road IDs with the most matching days (15–19 days each), plus clear, direct `plot.setHover` took a median **0.5 ms**, max **1.7 ms**. Persistent `plot.setSelection` for the same inputs took median **2.4 ms**, max **3.8 ms**. These include plot-side part drawing but not GPU picking or a subsequent browser paint. They do not establish cost for charts with thousands of marks or much larger provenance graphs.
- **Brush:** In a 12-position Roads drag with no active hover, the actual handlers emitted 13 brush events (including start/end) and reached **5,077 selected roads**. Median costs were **0.5 ms** for plot brush hit testing and selection resolution, **0.1 ms** for plot selection rendering, **1.0 ms** for the plot event payload (including feature shares), and **3.4 ms** for the map’s synchronous `setSelection`. The road render pass on the corresponding frames took **10.5 ms median / 13.3 ms max**. The input work and next frame’s work are separate; together they leave little headroom for layout, browser painting, and GPU work on a 60 Hz display. A subsequent run with the mask hoisted still measured road render-pass medians of **8.6–9.6 ms** across three drags, so fixing hover does not fix the brush uploads.
- **Incremental cost introduced by richer plot events:** [`selectionEventData`](../autk-plot/src/plot-base-interactive.ts#L362-L380) computes feature shares for local aggregated selections. [`featureShares`](../autk-plot/src/provenance/model.ts#L343-L381) gathers the selected rows’ unit indices, sorts them in source order, and builds a share payload even though this gallery’s map listener uses only `selection`. The instrumented drag measured **1.0 ms median / 6.2 ms max** in `featureShares`; larger charts and wider brushes could make this meaningful. An old-plot control built from `cec5cad9` emitted different road selections on the synthetic drag, so it is not an equivalent-workload before/after benchmark. No claim is made about rewrite-wide speed.
- **History:** The polyline loop came from dynamic line sizing (`d8aeb263`); the expensive active-hover getter predates the registered plot merge (`e2e19ea0` is an ancestor of `c404fede`). The gallery’s earlier plot hover used persistent map highlight state; the current bidirectional wiring exercises the transient mask for an entire day’s matches. Multiple IDs amplify the preexisting repeated work; reducing hover to one road would still leave the bad loop and would regress the feature.

## Remaining map cost after the one-read fix

The same dirty bit is used for transient hover, persistent selection, and changes to layer data. The [vector visible pass](../autk-map/src/layer-vector.ts#L331-L343) and the [polyline picking-first path](../autk-map/src/layer-polyline.ts#L38-L45) can refresh both pipelines. Each full polyline refresh recopies and uploads centers, adjacency, indices, packed feature state, and default widths, even if only highlight values changed.

| Roads upload per dirty update | One pipeline | Visible + picking |
| --- | ---: | ---: |
| Centers, adjacency, topology, default widths | 5,499,464 B | 10,998,928 B |
| Packed feature-state buffers | 3,927,040 B | 7,854,080 B |
| Total, excluding small uniforms | 9,426,504 B | **18,853,008 B** |

A selection or hover change does not alter picking identity or picking visibility. Uploading only the existing packed visible state would reduce those bytes by about **79%** (18.85 MB to 3.93 MB) before any shader/layout redesign. There is also redundant CPU work on brush end: the measured last `brush` event and `end` event both selected the same 5,077 roads, and [`VectorLayer.setSelection`](../autk-map/src/layer-vector.ts#L397-L407) clears and walks the mask again for identical IDs.

## Recommended implementation order

### P0 — Take one highlight snapshot per visible polyline upload

In `PipelinePolyline.updateVertexBuffers`, read the hover-aware array outside both vertex loops, and leave the picking pipeline on its existing ID branch. For example:

```ts
const highlights = this.picking ? undefined : layer.highlightedVertices;
// Inside the existing vertex loop:
this._stateData[i * 4 + 1] = highlights === undefined
    ? ((id >> 8) & 0xff) / 255
    : highlights[i];
```

This is the exact intervention tested in memory. It does not change public APIs, cap highlighted IDs, remove partial hover, or change clearing behavior. Prefer this to a generic getter cache for the immediate fix: the local snapshot needs no invalidation bookkeeping when selection, geometry, or hover changes. Do not replace hover with persistent selection or disable the Roads link as the permanent fix.

### P1 — Separate road feature-state invalidation from geometry

**Implemented for roads and generic polylines:** click, brush selection, and hover now upload only the visible feature-state buffer. Hide/unhide also refreshes picking state before the next pick. Neither operation uploads geometry or widths. In a repeat of the Roads profile, hover and brush submitted **3,927,040 bytes** of visible state per dirty update, down from **18,853,008 bytes** across both pipelines. The median CPU time inside the road render pass was **3.0 ms** for hover (previously 9.3 ms after P0) and **2.4–2.7 ms** across three brush drags (previously 8.6–9.6 ms). The synchronous `setSelection` still rebuilds the CPU mask. These numbers do not include GPU execution time or measure other layer types.

Implementation details and follow-ups:

- Distinguish geometry, widths, visible feature state, and picking-relevant state. On hover or selection only, update the visible state buffer; leave geometry, widths, and picking buffers alone. Geometry replacement still rebuilds all dependent data. Skip-state and width changes must still update what picking reads. Test both visible-first and picking-first frame order so the flags cannot be consumed by the wrong pass.
- When the incoming selection denotes the same component set as the current selection, skip the mask traversal and render invalidation. Compare membership rather than only array identity or order; preserve observable ID ordering if it is part of the API contract. Once that works, consider updating only added/removed components using their contiguous polyline vertex ranges, after verifying the mesh invariant. Preserve shared-vertex semantics for other vector layers.
- For a wider brush, coalesce the linked map update to the latest selection per animation frame *if* traces still show redundant work. Guarantee the final drag/clear update and do not change the plot’s public brush event or extent behavior. The map already schedules on-demand frames; frame coalescing alone cannot cure a 34-second upload.

### P2 — Optimize the plot path where a larger benchmark justifies it

- When brush bounds move but the selected bucket set is unchanged, reuse the selected source IDs and shares, avoid repainting unchanged marks, and still emit the new data/pixel extent. Cache by mark set and provenance generation, not only by source ID set: two date ranges can select the same roads with different event shares. Invalidate on redraw, transform changes, and collection replacement. Preserve event snapshot semantics for consumers.
- For sparse external hover in large aggregated plots, use a feature-to-row/unit index so `hoverParts()` need not scan every row and its contributions. Cache the mark-node lookup per draw, update only affected parts, and diff pointer styling between the old and new mark. Treat this as a second benchmark project; it is not needed to fix this page’s freeze.
- Consider compact GPU-side state by component only if the state-only uploads are still limiting. At 8,166 roads, one 32-bit state word per component would be about 32.7 KB, versus 3.93 MB of existing packed visible state per full upload. That is an illustration, not a measured result: it requires a reliable vertex-to-component mapping and shader/buffer changes. Measure before committing to it.

## Regression tests and acceptance criteria

| Scope | Acceptance criteria |
| --- | --- |
| Polyline upload unit test | Count getter reads on a fixture with multiple components and vertices: **one** for a visible upload, **zero** for picking. Assert all hovered components are encoded, a previously selected component keeps selection on clear, and unrelated or skipped components are unaffected. Prefer operation counts over a timing assertion in CI. |
| Dirty-state unit / WebGPU tests | A hover, selection, or clear performs no geometry/default-width uploads and no picking-state upload. A repeated identical selection does no upload. Verify geometry replacement, skipped roads, road width changes, and both pass orders still draw and pick correctly. Extend [`polyline-pipeline.test.ts`](../autk-map/test/polyline-pipeline.test.ts) and the map WebGPU suites. |
| Linked browser regression | Brush a range, hover a daily dot, and verify the map receives the full distinct ID set, hover clears on leave, and the prior brush selection survives. Hover a road on the map and verify the matching chart contributions appear without feedback or stuck hover. Run both gallery variants. |
| Performance verification | Repeat the sweep and drag in a real Chrome window with DevTools. The one-read patch should remove interaction long tasks ≥50 ms on the Roads fixture on this test machine; capture the map update/upload bytes and median/p95 for brush and hover after the dirty-state change. Use the 16.7 ms frame budget at 60 Hz as a target, not a machine-independent CI cutoff. |

## Related follow-up: building selection tooltip

The tooltip in `gallery/src/autk-map/building-picking.html` usually took less than 1 ms to update after identifying a building. The larger delay was sampling pointer movement only every 100 ms and rendering a new scene and picking pass for each sample. Click and hover now share the last feature-ID texture for the same layer, camera, and pickable state. Flat on-demand pointer-only frames skip the visible scene; terrain keeps its regular scene update but can skip regenerating the picking image when elevation, occlusion, and projection are unchanged.

On the local Chrome sweep, the same 135 input moves produced 75 GPU hover reads but only one picking render pass with the cache. Visible redraws occurred 56 times, as hover state changed; the earlier uncached 33 ms experiment used 131 visible frames. Comparing the old 100 ms baseline against the implemented 33 ms flat cadence, sampled pointer-to-tooltip p95 was about 71 ms versus 26 ms. These are local sweep measurements, not a guaranteed latency.

**Status:** P0 is implemented for polylines. The state-only upload portion of P1 now covers all interactive vector pipelines: roads and lines, flat polygon fills and borders, 3D building meshes, and point sprites. Click selection and hover only update visible interaction buffers. Hide/unhide updates visible masks and picking state without uploading geometry, normals, or thematic data; point layers now support `setSkipped` and hidden points do not block picking. WebGPU tests check buffer uploads and visible or picking results, including picking before the visible pass. CPU mask diffs, partial state-buffer writes, and plot optimizations are not implemented. The timing figures above are for the Roads fixture, not performance guarantees for large datasets of every layer type.
