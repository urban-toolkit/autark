# Streaming terrain tiles: review status

Temporary agent handoff, updated 2026-11-08. Read with [TILE-TERRAIN.md](TILE-TERRAIN.md), [TILE-BASEMAP.md](TILE-BASEMAP.md), and [AGENTS.md](../AGENTS.md). Findings refer to the current working tree, including uncommitted implementation work. Revalidate against current code, preserve other work, and do not commit without explicit instruction. Delete this file once the items below are closed or moved to an issue tracker.

The architecture (height-source abstraction, shared shader lookup, reusable tile store, CPU composition) held up. The first review's findings on level blending, mixed-resolution sampling, resource bounds, and quadtree coverage are addressed in code and covered by unit tests. Revalidation on 2026-11-08 reproduced two correctness errors on the CPU, the stale-nodata invalidation gap and wrong seam morphing at large LOD gaps; both are fixed with regression tests. The follow-up the same day closed seam normals, Float32 precision, the resource accounting, imagery sharpness and provider terms; the two remaining items need a browser or CI.

## Resolved since the first review

Details are in [TILE-TERRAIN.md](TILE-TERRAIN.md). The earlier items have unit tests; the later ones say how they were checked.

- **Level blending and mesh seams.** The shader lookup and `heightAt` blend each level into the next coarser one; patch edges beside coarser neighbours are morphed onto the neighbour's vertex grid for any level gap (the review's large-gap failure is fixed and tested). Blending and small-gap seams were seen working in a browser; the large-gap shader change was recompiled offline only.
- **Stale nodata after coarse arrivals.** A level now counts as complete only when its own tiles are ready and its last composition left no sample depending on fallback, so a loaded tile with nodata keeps following coarser arrivals (arrival-order regression test added).
- **Timing-dependent test.** The render-statistics test installs the fake clock before the setup frames render; stable over repeated runs.
- **Mixed-resolution continuity.** A missing pixel takes the coarser zoom's height at its own centre, so the surface cannot jump where fine data ends.
- **Tile demand and memory.** `maxTilesPerWindow` bounds tiles per window, the cache is raised to the bound, window size is capped at 2048.
- **Quadtree coverage.** Patch resolution uses the finest data anywhere under a block, and the traversal keeps coarse coverage when the instance budget is tight.
- **Coordinate systems.** EPSG:4326 is rejected; the vertical datum is documented, not reconciled.
- **Design document.** Rewritten to describe what is built. The 40° N example now says 23.4 % smaller; the detail claim above zoom 12 is replaced by the provider's per-region resolutions; the AWS `maxZoom` of 15 is confirmed (zoom 15 served, zoom 16 returns 404 on the Terrarium path).
- **Composition speed.** One window with all tiles ready went from about 51 ms to about 2 ms in Node (see Performance in the design).

- **Normals at morphed seam vertices.** A morphed edge vertex now takes the interpolation of the neighbour's vertex normals (each at the neighbour's spacing), which is what the neighbour's patch interpolates along the shared edge, so both sides shade it identically. Checked on a GPU against the CPU twins (see Verification evidence), and in a browser in the `terrain-tiles` example: no seams visible, rendering looks right.
- **Float32 precision.** Measured numerically with the camera's Float32 matrices against Float64: under 0.2 px out to 1,000 km from the map origin even with the camera 300 m up. The limit is distance from the origin, not the 156 km window width (design, Decisions and limits). Not seen in a browser.
- **Joint resource budget.** `TerrainTileStats.memory` accounts decoded tiles, CPU windows, the GPU texture and in-flight decodes (about 50 MB at the defaults, 134 MB per window set at most). The imagery overlay dominates at roughly 740 MB at 4096² (inherited from terrain mode) and is documented, not capped (design, Memory).
- **Imagery sharpness.** Computed with the real camera: at worst an overlay texel covers about 1.8 screen pixels on the bottom row and is finer elsewhere. Accepted (design, Imagery on terrain).
- **Provider terms.** The preset now credits "Mapzen" and links to the provider's sources list; area-specific statements are added by the caller (README shows how, with examples taken from the provider's page). The Mapbox recipe carries the three links from Mapbox's attribution guide and notes the required logo; the guide does not name terrain-RGB, so confirmation with Mapbox is advised. Decision: the preset stays on the provider's documented S3 endpoint, with the production CDN advice kept.
- **Shared stylesheet.** Only `tiles-basemap.html` shares it, and nothing there sets `aria-pressed`, so the pressed-button rule changes nothing there.

## Open items

Both remaining items need a browser, CI or a group decision, and the measurements choose the performance work. Dirty regions, buffer reuse, strip refills, budgeted scheduling or workers, and adaptive levels stay measurement-driven.

1. **Composition has no browser measurement, though the instrumentation is in.** The `terrain-tiles` example now shows p50, p95, p99 and max for the terrain update, composition and upload, beside the frame CPU time, with Reset and Copy buttons (procedure in the design, Measurement still to do); someone has to run it and send the numbers. Node timings are 2 ms (all ready), 22 to 44 ms (partial data) and under 1 ms (empty) per 512² window, excluding decode, upload and quadtree. The provisional budget is 4 ms of main-thread work per frame. Measure the six-level workload in a browser, including startup, tile-arrival bursts and one-sample scrolling, with p50, p95 and p99 on named hardware. Then decide about items 1 to 5 of the optimization list in the design. A frame in which several partially loaded windows recompose can still exceed the budget.

2. **GPU coverage is optional, not part of the default run or CI.** `autk-map/test/terrain-shader-gpu.test.ts` runs the height lookup and the seam morph (heights and normals, gaps of 1, 2, 3 and 6 levels) on a GPU through Dawn and compares them with the CPU twins, but it skips unless the `webgpu` npm package (native binary, 131 MB installed) is installed with `npm install --no-save webgpu` and an adapter exists. For the group to decide: whether GPU tests justify that as a dev dependency, and whether CI has a GPU or software-Vulkan runner (untested). The [CI workflow](../.github/workflows/ci.yml) runs no browser GPU tests, and the existing map HTML test covers render sizing, not terrain. Not covered anywhere: a streaming `update` on a GPU, instance-cap exhaustion in a real frame, and the complete vertex-to-fragment path.

## Verification evidence

Last full run, after the seam-normal, memory-accounting and attribution changes (2026-11-08):

- `npx vitest run`: 61 test files, 899 tests passing. Typecheck for `autk-core`, `autk-map`, `gallery` and `usecases`, and `npm run lint`: clean. `npm run build` for `autk-map`: succeeds.
- WGSL compiled offline with wgpu-native for the terrain, picking and buildings shaders with `#include` expanded: all five compile.
- GPU run through Dawn (Tint, Metal) from Node, `terrain-shader-gpu.test.ts` (skips without the optional `webgpu` package; passes 3 of 3 with it): height and normal from `patchVertex` match the CPU twins away from seams and at seam vertices for gaps of 1, 2, 3 and 6 levels, and a fine patch's edge matches the coarse patch's edge in height and normal at every vertex. With the old unmorphed normal restored, two of the three checks fail, so the test does discriminate.
- Float32 precision: numeric projection of 400 random vertices per case with Float32 against Float64 matrices (table in the design); imagery sharpness: computed with the real `Camera` (table in the design). Neither is a browser rendering test.
- Earlier evidence still stands: the two reproduced errors are regression tests (stale nodata, large-gap seam morph on the CPU), and composition timings are Node-only (one 512×512 EPSG:3395 window, zoom 14, constant-height tiles), which establish relative cost and not a browser target. The seam-normal change was checked in a browser by the owner (no seams visible); other browser checks were not repeated.
