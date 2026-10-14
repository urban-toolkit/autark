# Autark 4.1.1 — migration notes

Status: **release candidate; not yet published**. This coordinated release updates `@urban-toolkit/autk-core`, `autk-map`, `autk-db`, `autk-plot`, `autk-compute` and the `autk` umbrella package to 4.1.1. Internal dependencies are pinned to 4.1.1.

```bash
npm install @urban-toolkit/autk@4.1.1
```

The requested patch version includes changes to OSM surface filtering and raster handling. Review the behavior changes below before upgrading from 4.1.0, especially for coastal datasets and reproducible analyses.

## OSM buildings and coastal surfaces

- Building relations can include multipolygon outlines/parts and tagged roof/column members. Untagged members with non-building roles do not become building parts. Invalid relations retain all member ownership information so omitted parts cannot reappear as independent buildings, including conflicting role orders.
- Building parts are never cut into new footprints. Parts must be fully covered by the surface; parts extending outside it are discarded, and retained geometry/property indices are updated together. Counts and meshes near boundaries can therefore change.
- Named-area coastline classification uses the full geocode bounding box, including neighboring coastlines, rather than only the selected administrative areas. PBF extracts need the complete geocode boundary and coastline coverage; the loader does not fetch missing data from the network.
- When coastline classification succeeds, requested water layers can include sea context within the selected areas' bounding box, marked with `properties.generated = 'coastline'`. Missing or invalid coastline data never implies sea.
- **Change from 4.1.0:** bbox roads now use the mandatory surface crop too. Bridge and other over-water segments outside that surface may be removed; do not assume the previous bbox-only road filtering behavior.

See the [OSM import guide](OSM-IMPORT.md) for supported membership and surface rules.

## Raster joins and value resolution

- `db.spatialQuery()` accepts compact rasters as `tableJoinName`, with a vector root. Each decoded cell contributes its center transformed to the workspace CRS; these are not pixel-area intersections. Numeric aggregates ignore NoData values. Reload a raster before joining if its in-memory payload is unavailable.
- GeoTIFF loading preserves valid zero values when no NoData value is declared and handles negative grid-axis directions. Rotated/sheared grids are rejected rather than silently misread.
- Heatmap raster metadata and joins respect the workspace CRS instead of assuming the default CRS. NEAR distances remain in workspace CRS units, normally meters in the default EPSG:3395.
- Property-path resolution supports literal dotted aggregate keys such as `sjoin.avg.shadows.jun`, while fully traversable nested paths retain precedence. Normalization reads dotted aggregate keys correctly.
- `TerrainDebugOptions` is exported from `@urban-toolkit/autk-map` for typed terrain debugging configuration.

## Use-case fixes

The Urbane, Shadows, and Niteroi examples use modular application code and restored spatial workflows. Bundled PBF regression tests cover real-city imports, with bounded ten-minute timeouts for large imports.

- **Urbane:** neighborhood drill-down reads `properties.sjoin.matches[].properties.ntaname` and retains each building once, even when it matches several selected neighborhoods. This fixes the example's selection logic; it does not introduce a new spatial-join output format.
- **Shadows:** temporary measurement points are removed only after all monthly joins succeed. Joined road values remain available, and failed joins leave the measurements intact.
- **Shadows:** the existing `buildingsZeroHeight` loading flag is enabled only for buildings. Missing height metadata uses the renderer's random visual fallback; explicit zero/invalid height tags remain excluded. This visual fallback is not the computation's existing 20-meter analytical fallback and should not be interpreted as measured height.

Example changes are source-level use-case updates, not new npm APIs. Application rendering still requires browser/WebGPU verification; CPU mesh and unit tests do not establish visual correctness.

## Development toolchain

Workspace development and CI use Node 26.11.1 and npm 12.2.0. Tooling and dependency resolutions have been refreshed. This is separate from the runtime capabilities required by individual library consumers.

## Release verification

- [x] Coordinated 4.1.1 manifests, internal dependencies and root lockfile prepared.
- [x] Clean `npm ci` and `make verify` passed with Node 26.11.1 / npm 12.2.0: 455 tests across 40 files, lint, builds, typechecks and package validation. The clean snapshot excludes untracked macOS metadata files, not tests. npm audit reported zero known vulnerabilities.
- [x] All six 4.1.1 tarballs passed isolated consumer declaration checks, Node imports and browser bundling.
- [x] Eleven hardware WebGPU compute cases passed in Chrome 155.0.8059.41 on Apple Metal 3.
- [ ] Browser/GPU visual inspection of the updated examples completed.
- [ ] Release commit's main-push CI succeeded and its exact artifacts were staged.
- [ ] Maintainer approved all six npm stages with 2FA.
- [ ] Public integrity/provenance and `latest` tags verified; all six Git tags finalized.
- [ ] Clean public-registry installation and GitHub Release marked Latest verified.
- [ ] `NPM_RELEASE_ENABLED` restored to `false`.

Publication follows the [staged release procedure](NPM-RELEASE.md). No public release should be announced until all six npm packages and matching Git tags are verified.
