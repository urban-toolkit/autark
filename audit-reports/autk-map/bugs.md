# `@urban-toolkit/autk-map` bug audit

## Summary

Confirmed defects affect render order, origin lifecycle, raster updates, categorical/numeric domains, global width state, and initialization reporting.

## Findings

### 1. Buildings are not “always last” and can render below dynamic layers — High

**Evidence:** core `OSM_BASE_LAYER_ORDER` includes buildings. `_recomputeZIndices()` checks the base order before its buildings branch, making the buildings branch unreachable (`layer-manager.ts:158-169`). Dynamic layers start at `OSM_BASE_LAYER_ORDER.length`, above building index 4.

**Impact:** user-loaded polygon/raster/point layers can cover buildings contrary to class documentation and intended 3D ordering.

**Fix:** remove buildings from the fixed 2D base slots or check buildings first, then assign `baseCount + dynamicCount` as documented. Sort after every recomputation.

### 2. A failed first load permanently initializes the origin — High

**Evidence:** `loadCollection()` calls `initializeOrigin()` before type inference, raster property validation, or successful triangulation (`map.ts:253-258`). `computeOrigin()` falls back to `[0,0]` for geometry-less collections. Layer removal never clears/recomputes origin.

**Impact:** an empty/invalid first collection or a raster with null geometries fixes the map origin at `[0,0]`; later valid layers inherit poor local coordinates and precision. Removing all layers and loading an unrelated dataset retains the stale origin.

**Fix:** compute a candidate origin only after request validation, commit it when the first layer is successfully added, use collection `bbox` for geometry-less rasters, and reset/rebase explicitly when the map becomes empty.

### 3. Raster value length is not validated — High

**Evidence:** `updateRaster()` accepts any non-empty band (`map.ts:522-575`). `RasterLayer.loadRaster()` allocates `resX * resY * 4` but loops over the supplied scalar length (`layer-raster.ts:289-345`).

**Impact:** short input leaves trailing transparent/zero pixels; long input writes beyond the typed array and silently drops values. A length exactly four times the cells is implicitly treated as RGBA with no explicit mode.

**Fix:** require exactly `width * height` scalar values or explicitly selected `width * height * 4` RGBA values. Reject mismatch before changing domain/render state.

### 4. Raster updates ignore new dimensions and bounds — High

**Evidence:** dimensions/quad are set only during layer creation (`map.ts:1252-1280`, `layer-raster.ts:167-177`). `updateRaster()` reads values but does not update resolution, geometry, or recreate the GPU texture.

**Impact:** updating with another raster collection can upload data using stale dimensions/bounds, corrupting appearance or causing WebGPU copy errors.

**Fix:** either enforce same size/bounds or rebuild geometry, texture, and buffers atomically when metadata changes.

### 5. Categorical colormap domain patches are ignored — High

**Evidence:** vector `updateColorMap()` preserves any existing string domain instead of resolving the new config (`map.ts:619-625`).

**Impact:** changing to a user categorical domain or changing category order does not take effect; legend and shader indices retain the old domain.

**Fix:** recompute categorical domain from canonical component/source values under the new `domainSpec`, preserving the old domain only when the patch does not affect domain resolution.

### 6. Numeric percentile domains are weighted by vertex count — Medium

**Evidence:** `updateColorMap()` recomputes from `vectorLayer.thematic` (`map.ts:617-625`), which repeats each component value for every vertex (`layer-vector.ts:265-283`).

**Impact:** geometrically complex features influence percentiles more than simple features, producing a domain different from the feature-level thematic data.

**Fix:** store canonical per-component thematic values and compute domains from them, not expanded GPU buffers.

### 7. Triangle shaders discard every configured alpha channel — Medium

**Evidence:** the fragment shader reads alpha from the base, highlight, invalid-value, or sampled thematic color (`triangle-01.frag.wgsl:17,31-36`), but its final return replaces that alpha with `opacity` (`triangle-01.frag.wgsl:37`).

**Impact:** base-color, highlight, invalid-value, and colormap alpha have no effect; only layer opacity controls transparency, producing unexpected compositing.

**Fix:** combine `color.a * opacity` and align RGB premultiplication with the pipeline's declared blend convention.

### 8. Loading a polyline mutates core-global width state — Medium

**Evidence:** `createPolylinesLayer()` assigns `TriangulatorPolylines.offset` before building (`map.ts:1107`).

**Impact:** one map changes defaults for other maps and direct core users. Later loads inherit the most recent width.

**Fix:** pass an explicit resolver/offset option without mutating the static default.

### 9. `init()` resolves successfully when WebGPU initialization fails — Medium

**Evidence:** `Renderer.init()` catches/logs and leaves `_isInitialized = false` (`renderer.ts:260-307`); `AutkMap.init()` then binds events, renders, and resolves (`map.ts:212-226`) despite documenting failure throws.

**Impact:** callers proceed as if the map is ready and only see console output/blank rendering.

**Fix:** reject initialization with a typed capability error, or return a readiness result and skip all subsequent setup.

### 10. Vector selection setters retain invalid IDs — Low

**Evidence:** `setHighlightedIds()` uses `new Set(ids)` before range-filtered vertex traversal (`layer-vector.ts:384-393`); vector skip toggling similarly updates the set before range checks. Sprite implementation filters IDs.

**Impact:** selection snapshots can report IDs that never map to components.

**Fix:** normalize finite integer IDs into range before storing or applying them.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
