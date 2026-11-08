# Streaming terrain tiles: open items

Temporary handoff, 2026-11-08. Read with [TILE-TERRAIN.md](TILE-TERRAIN.md). Delete this file once the items below are closed or moved to an issue tracker.

Review findings on level blending, seams (heights and normals), continuity, tile and memory bounds, quadtree coverage, Float32 precision, attribution and compose speed are fixed or measured; see the design.

## Open

1. **Other hardware.** Timings come from one machine (Chrome 156, macOS). Re-measure on a slower laptop and another browser with the `terrain-tiles` example (Reset timings, pan, Copy timings). Also unexplained: a 30 fps reading once during panning that was not CPU time (the 4096² overlay is the first suspect).
2. **GPU tests in CI.** `terrain-shader-gpu.test.ts` works but skips without the `webgpu` package (131 MB, native binary). Decide as a group whether GPU tests justify that dev dependency, and whether CI has a GPU or software-Vulkan runner (untested). Alternative: a `*.webgpu.html` page.
3. **Not covered anywhere:** a streaming `update` on a GPU, instance-cap exhaustion in a real frame, the full vertex-to-fragment path.

Further performance work (dirty regions, strip refill, a worker) only if item 1 shows a need.

## Verification (2026-11-08)

Tests pass (909, 3 optional GPU tests skipped), typecheck, lint and build clean. Seams checked in a browser; none visible.
