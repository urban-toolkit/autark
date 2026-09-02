# `@urban-toolkit/autk-map` code-improvement audit

## Summary

Map would be easier to maintain with validated command boundaries, canonical layer data separate from expanded GPU buffers, immutable manager views, and less duplicated buffer/pipeline logic.

## Opportunities

### High priority

1. **Centralize request validation and diagnostics.**
   Validate IDs, initialization state, layer type, homogeneous geometry, raster metadata/lengths, mesh dimensions/components, opacity, selection IDs, and colormap config before mutating origin or layer state. Return structured outcomes instead of scattered console messages.

2. **Separate canonical layer data from GPU-expanded data.**
   Keep per-component thematic values, raster source values, and component provenance as canonical state. Derive per-vertex masks/values only for uploads. This fixes percentile weighting and simplifies reconfiguration.

3. **Make `LayerManager` ownership safe.**
   `layers` returns the live array (`layer-manager.ts:48`). Return a readonly snapshot/iterator and expose explicit reorder/add/remove methods that always update dynamic order, z-index, and GPU lifecycle.

4. **Replace global triangulator configuration with load options.**
   Pass line width and point size to core calls. Avoid state shared between map instances.

### Medium priority

5. **Break up `map.ts`.**
   The controller combines public commands, type inference, six loader paths, thematic/domain logic, terrain, rendering, and UI refresh. Extract collection/mesh loaders, thematic/raster updater, and command validation while preserving a small facade.

6. **Deduplicate geometry/component flattening.**
   `VectorLayer`, `RasterLayer`, and sprite/triangle subclasses repeat cumulative component and packed-buffer handling. A layout-aware buffer builder can validate dimensions and return aligned arrays.

7. **Make dirty flags resource-specific.**
   `_dataIsDirty` causes multiple buffers to upload even when only highlight/thematic/raster state changed. Track geometry, thematic, interaction, raster texture, and render uniform dirtiness separately.

8. **Validate before GPU allocation.**
   Raster geometry currently relies on `console.assert` (`layer-raster.ts:237-239`), which does not prevent invalid buffers. Throw before creating buffers/textures and include expected/actual sizes.

9. **Use type-only imports consistently.**
   `map.ts`, `api.ts`, and layer files import many GeoJSON/core interfaces as values. Convert type-only contracts to `import type` to clarify runtime dependencies.

10. **Unify device acquisition/loss recovery with compute.**
    Renderer has a static shared device promise but does not clear it on device loss; compute has a separate manager and loss hook. Move device lifecycle behind an injectable shared service.

11. **Make render scheduling state-driven.**
    The map continuously renders once `draw()` starts. Add invalidation/on-demand mode for static views, with animation opt-in and validated FPS bounds.

12. **Standardize UI refresh ownership.**
    Public operations manually call various UI refresh methods. Emit layer/style/legend state changes and let UI subscribe, reducing missed or duplicate refresh paths.

## Suggested sequence

1. Validation/outcome contract and canonical data model.
2. Manager/device ownership and global-state removal.
3. Split controller and deduplicate buffers.
4. Improve dirty flags, scheduling, imports, and UI events.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
