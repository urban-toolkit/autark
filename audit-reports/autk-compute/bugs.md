# `@urban-toolkit/autk-compute` bug audit

## Summary

Confirmed defects affect object aggregation geometry, numeric parameter validation, descriptor handling, and result namespace safety.

## Findings

### 1. Object aggregation misreads many 2D meshes as 3D — Critical

**Evidence:** `uploadLayerToGpu()` infers 2D only when position length is divisible by 2 **and not** divisible by 3 (`compute-render.ts:492,504`). A valid 2D buffer with 3, 6, 9, … vertices has a length divisible by 6 and is treated as 3D. The class-aggregation path correctly derives dimension from layer type (`compute-render.ts:563`).

**Impact:** Vertex counts and index offsets become wrong; indices may reference nonexistent vertices, producing missing/corrupt geometry or GPU validation errors specifically in object visibility aggregation.

**Fix:** Carry `positionSize: 2 | 3` in mesh metadata or derive it from the supported layer type in both upload paths. Never infer vertex dimension from divisibility.

### 2. `tileSize = 0` passes validation — High

**Evidence:** validation only checks `tileSize % 8 !== 0` (`compute-render.ts:102`). Zero is a multiple under that expression. Negative, non-finite, and non-integer inputs are also not explicitly rejected.

**Impact:** Zero reaches texture/grid calculations and eventually attempts zero-sized render resources; failures are late and device-specific.

**Fix:** Require a finite positive integer, a multiple of 8, and a value within device dimensions before allocating resources.

### 3. Non-finite viewpoint direction counts can suppress or hang sampling — High

**Evidence:** `expandCameraSamples()` computes `Math.max(1, Math.floor(directions))` without checking finiteness (`viewpoint.ts:97`). `NaN` yields no samples; `Infinity` creates a non-terminating loop (`viewpoint.ts:103`). The same pattern in building-window floor resolution can silently generate no windows.

**Impact:** User-controlled numeric input can return empty results or block the main thread indefinitely.

**Fix:** Validate finite positive integer counts at the API boundary and impose documented upper bounds.

### 4. GPGPU array/matrix dimensions are not validated — High

**Evidence:** public descriptors accept arbitrary numbers (`api.ts:140-152`); allocation and WGSL aliases directly use lengths/rows/cols (`compute-gpgpu.ts:474-480,654-690`). Auto matrices can resolve to zero rows.

**Impact:** Zero, negative, fractional, or huge dimensions cause `RangeError`, invalid zero-length WGSL aliases, buffer over-allocation, or opaque GPU errors.

**Fix:** Validate positive integers, ensure descriptor keys exist in `variableMapping`, reject array/matrix overlap, handle all-empty auto matrices explicitly, and preflight byte sizes against device limits.

### 5. Camera clipping and FOV parameters are unchecked — Medium

**Evidence:** `compute-render.ts:95-97` forwards values directly to `buildCameraMatrices()`; no check enforces finite FOV, `near > 0`, or `far > near`.

**Impact:** Invalid projection matrices can make every metric zero/undefined without an actionable request error.

**Fix:** Validate a documented FOV interval and clipping-plane ordering before resolving viewpoints.

### 6. Unsupported typed layers are silently counted as empty classes — Medium

**Evidence:** metadata is built before triangulation (`compute-render.ts:108-119`), then unsupported types are warned and skipped (`compute-render.ts:458`).

**Impact:** Results contain a class key that looks successfully computed but is always zero, masking configuration errors.

**Fix:** Validate all layer types before metadata creation and throw with the layer ID/type.

### 7. Existing non-object `properties.compute` values are unsafely spread — Medium

**Evidence:** GPGPU and render result writers assume `properties.compute` and `.render` are object-like (`compute-gpgpu.ts:599`; `compute-render.ts:1029` uses `as any`).

**Impact:** Existing strings can spread character keys; other values are silently replaced, corrupting application properties.

**Fix:** Validate collision shape and use an explicit overwrite/merge/error policy.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
