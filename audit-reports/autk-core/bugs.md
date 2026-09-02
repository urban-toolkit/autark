# `@urban-toolkit/autk-core` bug audit

## Summary

The most direct defects are a broken type guard, incorrect mixed-geometry classification, non-finite numeric propagation, nondeterministic geometry, and inconsistent duplicate-listener removal.

## Findings

### 1. `isLayerType('background')` incorrectly returns `false` — High

**Evidence:** `background` is in both `LayerType` and `LAYER_TYPE_VALUES` (`types-layer.ts:18,31`), but not in the comparisons in `utils-layer.ts:25-35`.

**Impact:** A value accepted at compile time and used by renderer styling is rejected by the public runtime guard.

**Fix:** Implement the guard with `LAYER_TYPE_VALUES.includes(value as LayerType)`.

### 2. Geometry collections are misclassified as polygon layers — High

**Evidence:** `mapGeometryTypeToLayerType()` returns `polygons` for every `GeometryCollection` (`utils-layer.ts:55-60`). Point and polyline triangulators explicitly support point/line children.

**Impact:** A point-only collection can be sent to polygon triangulation; mixed collections receive a misleading single type and lose unsupported children.

**Fix:** Inspect children recursively and return one family only when homogeneous. Make mixed/empty collections explicit failures or explicit multi-family results.

### 3. Transfer-function helpers allow non-finite values to poison all output — High

**Evidence:** `buildTransferContext()` reduces the supplied array without filtering (`transfer-function.ts:91-132`), and `computeAlphaByte()` rejects only `NaN`, not infinities (`transfer-function.ts:147`). Configuration fields are also merged without finite/range validation.

**Impact:** One `NaN` can make min/max/range `NaN`; infinities can produce invalid distances. Invalid gamma/opacity values can return `NaN` despite the documented byte-range result.

**Fix:** Filter or reject non-finite source values; validate mode, gamma, opacity bounds, and zero center; use `Number.isFinite()` at evaluation.

### 4. Bounding boxes can return infinite bounds — High

**Evidence:** coordinate expansion accepts any numeric values (`utils-geojson.ts:82-88`), while the final check validates only `minLon` (`utils-geojson.ts:99`).

**Impact:** A collection containing a valid minimum and an infinite maximum returns a non-finite `BoundingBox`, which then corrupts origins, cameras, clipping, and raster bounds.

**Fix:** Ignore malformed positions or reject them, and verify all four output bounds are finite and ordered.

### 5. Building fallback heights are nondeterministic — Medium

**Evidence:** missing metadata with `allowZeroHeightBuildings` uses `Math.random()` (`triangulator-buildings.ts:90`).

**Impact:** The same input generates different geometry, bounds, visibility results, and screenshots between runs. The flag name also suggests zero height, not a random 10.2–23.8-unit extrusion.

**Fix:** Accept an explicit fallback height or deterministic callback/seed. Rename the option to describe fallback extrusion.

### 6. Duplicate event registrations are all removed at once — Medium

**Evidence:** `on()` explicitly permits duplicate callbacks as separate entries (`event-emitter.ts:45`), but `off()` uses `filter(l => l !== listener)` (`event-emitter.ts:74`).

**Impact:** One unsubscribe removes every duplicate registration rather than one separately registered entry.

**Fix:** Either prevent duplicates, remove one matching occurrence, or return an unsubscribe function for each registration and document the selected behavior.

### 7. Duplicate IDs collapse intersection-cluster results — Medium

**Evidence:** `computeIntersectingClusterIds()` stores results in `Map<string, number>` using `String(item.id)` (`utils-geojson.ts:451-452`).

**Impact:** Numeric/string-equivalent or repeated IDs overwrite earlier entries and silently lose mappings.

**Fix:** Require and validate unique IDs, retain item index in the result, or return a list rather than a string-keyed map.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
