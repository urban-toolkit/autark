# Autark 4.0.0 — draft migration notes

Status: **unreleased**. Versions have not been bumped. Integrate the remaining PR, review its compatibility impact and complete these notes before preparing the release.

The six packages will use 4.0.0 together: `@urban-toolkit/autk-core`, `autk-db`, `autk-map`, `autk-compute`, `autk-plot` and the `autk` umbrella package. The major increase is required by incompatible core/DB/compute contracts; map/plot also move to the coordinated major, not because every package introduced a separate breaking API change.

## Building features and joins

- Reload legacy per-part OSM building tables. Buildings use one canonical GeometryCollection per feature and retain original components rather than an aggregate footprint.
- Part metadata is associated through `geometryIndex`, with building attributes inherited by each part.
- Feature-level spatial matches no longer duplicate root features. Nonaggregated joins expose `sjoin.matches` and named-field arrays.
- GeoJSON updates require `Feature.id`; its string/number type is preserved independently of internal row IDs.
- Window/viewpoint geometry follows original building parts rather than convex hulls. Explicit zero/invalid heights do not receive random fallback heights.

## Spatial normalization and OSM constraints

- Managed vectors use a workspace coordinate precision grid. The default is EPSG:3395 with 0.01 metre spacing.
- Byte-identical geometry round-trips and unchanged polygon ring order are no longer guaranteed.
- Alternative workspace CRSs require an explicit precision grid in their units. Populated workspace spatial settings cannot change.
- OSM surface masks are built and applied even when `surface` is omitted from requested public layers. Coastal masks may exclude sea.
- Load/update/crop operations preserve their documented transactional boundaries; OSM tag sets are transactional per set, not for the entire import.

## Compute global arrays and matrices

- `uniformArrays` and `uniformMatrices` are read-only global storage buffers, not mutable function-local copies.
- WGSL that modified a local copy must allocate separate local working data.
- Each global array/matrix consumes a storage binding, including unused globals. Dispatches exceeding device limits fail before resource creation.
- Scalar uniforms retain their existing behavior.

## New features and rendering defaults

- OSM `tagSets` explicitly select `points`, `polylines` or `polygons`. Filters use OR, key presence or exact values; each set produces at most its specified geometry family.
- Tag sets follow normal workspace CRS, precision, provenance and surface clipping. They do not perform implicit centroid conversion or multi-layer splitting, and are unsupported with PBF input.
- `getLayer` can export individual OSM elements on request.
- Polygon borders can be toggled at runtime with `updateRenderInfo(layerName, { showBorders: false })` without hiding the fill.
- Generic layer colors harmonize with the base styles; generic point radius is 10 and polyline full width is 3 local planar units. Highway-specific widths are unchanged.
- Default map UI can be disabled.

## Packaging and release process

- Internal published dependencies are pinned to the matching coordinated versions.
- Packages include type dependencies needed by external consumers (`@types/d3` for plot and `@types/emscripten` for DB).
- CI validates real tarballs outside the workspace, including declarations, Node imports and browser bundling.
- Release artifacts are submitted through stage-only npm Trusted Publishing. npm approval requires maintainer 2FA; Git tags are finalized only after public package integrity is verified.

## Before release

- [ ] Integrate and document the remaining PR.
- [ ] Prepare coordinated 4.0.0 versions and root lockfile.
- [ ] Pass CI and isolated tarball checks.
- [ ] Record local hardware WebGPU results and visually inspect the gallery.
- [ ] Review all six npm stages and approve in dependency order.
- [ ] Verify npm versions/provenance, finalize Git tags and test registry installation.
