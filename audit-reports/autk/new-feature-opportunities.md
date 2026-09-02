# `@urban-toolkit/autk` new-feature opportunities

## Summary

The umbrella package currently aggregates names but adds no cross-module workflow. Its strongest feature opportunities are opt-in integration APIs that preserve the existing module boundaries.

## Evidence basis

The root only creates five namespace exports (`autk/src/index.ts:1-5`), and every subpath is a one-line `export *` facade. The package mixes browser-oriented components with DB's Node conditional build (`autk-db/package.json:23-26`), while component versions are not lockstep (`autk/package.json:3,61-65`). These constraints motivate optional integration, capability, and compatibility features rather than more root-level flattening.

## Opportunities

### 1. Toolkit context with coordinated lifecycle — High

Provide an optional `createAutkContext()` that owns shared resources and exposes `dispose()`:

- one WebGPU device policy for map and compute;
- one DB lifecycle;
- shared style/selection state;
- capability and version information.

Keep direct component construction available so the aggregate does not become mandatory infrastructure.

### 2. Typed DB → map/plot adapters — High

Add explicit adapters for common flows:

- table metadata plus `getLayer()` to map load parameters;
- compact raster output to raster/terrain load parameters;
- query output to plot configuration;
- map/plot selections to a common source-ID representation.

These adapters should validate alignment, CRS, raster dimensions, and reserved property names instead of merely copying objects.

### 3. Runtime capability report — Medium

Expose a side-effect-free helper returning availability and constraints for:

- WebGPU/map/compute;
- browser or Node DB runtime;
- workers, WebAssembly, Cache API, and relevant limits;
- installed Autark component versions.

This would let applications disable unavailable workflows before constructing a subsystem.

### 4. Lazy module loader — Medium

Offer an optional asynchronous API such as `loadAutkModule('db')` for applications that want one aggregate dependency without eagerly resolving every component from the root namespace entry.

### 5. Shared application state bridge — Medium

Provide an opt-in selection and provenance coordinator that can translate stable feature IDs between DB results, map components, compute outputs, and aggregated plot marks. It should not assume that array position is always the durable identity.

### 6. Reproducibility manifest — Low

Expose a serializable manifest containing component versions, active CRS/style settings, compute parameters, and data-source descriptors. This would make analytical sessions easier to reproduce and diagnose.

## Design constraints

- Keep integration features under a distinct export such as `@urban-toolkit/autk/integration`.
- Do not flatten component symbols into the root.
- Avoid making browser-only modules mandatory for Node DB consumers.
- Preserve direct use of each individual package.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
