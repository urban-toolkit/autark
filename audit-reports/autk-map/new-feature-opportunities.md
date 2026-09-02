# `@urban-toolkit/autk-map` new-feature opportunities

## Summary

Map’s next features should make layer lifecycle, camera framing, styling, and large-data rendering explicit while preserving the current high-level loading API.

## Evidence basis

Load/update calls largely return `void` and mix logs, silent ignores, and throws (`map.ts:253-301,522-575,643-646`). Layer order is internal and fixed in `_recomputeZIndices()` (`layer-manager.ts:147-171`); line width is process-global (`map.ts:1107`); raster updates do not rebuild geometry or resolution (`map.ts:522-575`); and device initialization can fail without rejecting (`renderer.ts:260-307`). These limitations motivate handles, explicit ordering/origin/raster/style contracts, LOD, and lifecycle events.

## Opportunities

### 1. Layer handles and load/update results — High

Return a typed `LayerHandle` from load calls with:

- readiness and diagnostics;
- remove/reorder/update methods;
- canonical source/component metadata;
- bounds and resolved origin;
- `dispose()` and optional load cancellation.

This removes repeated string lookup and makes failures observable.

### 2. Explicit layer ordering — High

Add `before`, `after`, `moveLayer`, or numeric order APIs with documented handling for 2D overlays and 3D buildings. Preserve semantic defaults but allow applications to control dynamic overlays safely.

### 3. Origin and camera framing lifecycle — High

Provide `fitBounds`, `fitLayer`, `setOrigin`, `rebase`, and `clear({ resetOrigin: true })`. Handle raster `bbox` when geometry is null and report coordinate-space expectations for prebuilt meshes.

### 4. Validated raster modes — High

Support explicit scalar, RGBA, and elevation raster payloads with dimensions, nodata masks, bounds, resampling policy, and a texture-rebuild path. Add partial/window/tile updates for large rasters.

### 5. Per-layer geometry style — Medium

Expose point size/symbol, line width/cap/join, polygon stroke width, building fallback height, and zoom-dependent style expressions as per-layer options rather than global triangulator defaults.

### 6. Shared theme and legend API — Medium

Define an instance-owned theme that can be shared with plot, including categorical palettes, invalid/nodata colors, highlight colors, and legend models. Emit events when computed domains/labels change.

### 7. Mixed-geometry collection splitting — Medium

Optionally split a mixed FeatureCollection into point, line, and polygon child layers while preserving source IDs and a parent handle. Default strict mode can continue requiring explicit intent.

### 8. Level of detail and spatial culling — Medium

Add simplification/mesh LOD, viewport culling, and optional worker-based triangulation. Preserve component IDs across LOD levels so picking and thematic updates remain stable.

### 9. Device-loss recovery and capability events — Medium

Emit readiness/loss/recovery events, rebuild pipelines after a replacement device, and expose negotiated limits/features. Allow a caller-provided device service shared with compute.

### 10. Accessibility and interaction modes — Low

Add keyboard-selectable features, configurable pick gesture, hover events, tooltips, and reduced-motion/on-demand rendering options without requiring the built-in UI.

## Design constraints

- Layer creation/update must be atomic from the caller’s perspective.
- Origin and coordinate space must be explicit for every load path.
- Style configuration must be instance-owned.
- Source provenance and selection IDs must survive LOD and mixed-layer splitting.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
