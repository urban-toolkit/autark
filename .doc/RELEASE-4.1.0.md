# Autark 4.1.0 — migration notes

Status: **release candidate; not yet published**. The coordinated packages are `@urban-toolkit/autk-core`, `autk-map`, `autk-db`, `autk-plot`, `autk-compute` and the `autk` umbrella package. Internal dependencies are pinned to 4.1.0.

Although this release uses the requested 4.1.0 version, it includes breaking API and rendering changes. Review the following migrations before upgrading from 4.0.0.

## On-demand rendering by default

`map.draw()` and `map.draw({})` now render only when invalidated. Camera navigation, supported layer/style setters, picking, resize and terrain updates request frames automatically. Requests coalesce, including follow-up frames for changes during rendering. Removed layers and destroyed maps detach their invalidation listeners.

For applications that perform unobserved updates every frame, use `map.draw({ onDemand: false })`. Numeric `map.draw(30)` and `map.draw({ fps: 30 })` retain continuous rendering.

Subsystem getters and shared input references remain available. Direct mutations are not observed: call `map.requestRender()` after writing GPU resources, or mark cached render state/CPU geometry dirty with `layer.makeLayerRenderInfoDirty()` / `layer.makeLayerDataDirty()`. These dirty marks already request rendering; `requestRender()` alone does not upload geometry or invalidate cached uniforms.

## Per-layer point radius and line width

Replace `loadConfig.polylinesWidth` and global `TriangulatorPoints.setPointSize()` / `getPointSize()` calls with layer render state:

```ts
map.updateRenderInfo('lines', { renderInfo: { polylinesWidth: 12 } });
map.updateRenderInfo('points', { renderInfo: { pointSize: 120 } });
```

Flat render patches are also supported. `LayerData.pointSize` has been removed; use `LayerRenderInfo.pointSize`. There is no `lineWidth` field.

- Point radius defaults to 64 and generic full line width to 12 local planar units, exported as `DEFAULT_POINT_SIZE` and `DEFAULT_LINE_WIDTH` from `autk-map`.
- Sizes are not pixels. Camera transforms provide zoom scaling; the additional point zoom multiplier has been removed, changing point appearance at some zoom levels.
- Collection-based polylines and roads use width-independent `PolylineBuilder` centerlines expanded in shared visible/picking shaders, without rebuilding geometry for size changes.
- OSM highway-specific widths are retained unless explicitly overridden. Prebuilt triangle meshes loaded with `loadMesh()` cannot be resized this way.
- Lines use butt caps, a miter limit of four half-widths and bevel fallback. Sizes must be finite positive float32 values; invalid sizes preserve the previous setting.

## Styles, posters and branding

Generic polygon/line/point colors in the general-purpose presets are approximately 10%/20%/30% darker than each preset's surface. The new `poster` preset uses white land, graphite roads and pale-blue water/background.

The gallery's `map-poster` example automatically loads a Rio/Guanabara/Niterói crop. It accepts an editable WGS84 bbox JSON array, title/subtitle and road-width controls, interactive framing, regeneration and native-resolution 2400-pixel-wide PNG export.

Every `autk-map` instance includes the text-only bottom-right “made with autark” watermark, including `showUi: false`. The overlay follows canvas resizing, does not intercept input and is removed on destruction. Poster PNG exports include it too. The poster UI omits OpenStreetMap credit text; published uses still require appropriate attribution.

## OSM bbox roads over water

Standard roads loaded by bbox retain geometry intersecting that bbox instead of clipping against the coastal surface mask, preserving bridges and roads over water. This is intersection filtering, not endpoint clipping. Named-area roads, other layers and tag sets retain their surface-clipping behavior.

## Dependencies

External dependencies and compatible transitive resolutions have been refreshed, including Vite 8.3.4 and concurrently 10.0.6. The local npm audit reports zero known vulnerabilities. TypeScript remains at 6.0.3 because the latest TypeDoc and `typescript-eslint` do not yet declare support for TypeScript 7.

## Release verification

- [x] Coordinated 4.1.0 manifests and root lockfile prepared.
- [x] Clean `npm ci` and `make verify` passed with the CI versions, Node 22.23.3 / npm 11.15.0: 352 tests, lint, builds, typechecks and package validation.
- [x] All six tarballs passed isolated consumer declaration checks, Node imports and browser bundling.
- [x] Eleven compute WebGPU cases passed in Chrome 154.0.8037.98 on Apple Metal 3.
- [x] Real Chrome/WebGPU map checks passed for dynamic sizing/picking, on-demand invalidation/teardown and poster generation/export. Poster checks used synthetic Overpass fixtures, not a live Rio download.
- [x] Local npm audit reported zero known vulnerabilities.
- [ ] Release commit's main-push CI succeeded and its exact artifacts were staged.
- [ ] Maintainer approved all six npm stages with 2FA.
- [ ] Public integrity/provenance and `latest` tags verified; Git tags finalized.
- [ ] `NPM_RELEASE_ENABLED` restored to `false`.

Publication uses the existing stage-only Trusted Publishing workflow; npm approval requires maintainer 2FA. Git tags must only be finalized after all six public versions match the original CI artifacts. See [the release procedure](NPM-RELEASE.md).
