# `@urban-toolkit/autk` API consistency audit

## Summary

The umbrella package is intentionally thin and its namespace root plus flat subpath exports are internally coherent. The main inconsistencies are packaging-level rather than implementation-level.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| Medium | The root entry and subpaths are ESM-only, while four component packages advertise a `require`/UMD entry. | `autk/vite.config.ts:27` emits only `es`; `autk/package.json` has no `require` export. Component manifests expose `require`. | A consumer can `require('@urban-toolkit/autk-map')` but cannot switch to `require('@urban-toolkit/autk/map')` or the umbrella root. | Either add supported CommonJS conditions for all umbrella entries or explicitly declare the umbrella package ESM-only and explain the difference. |
| Medium | The root and subpath APIs have different shapes. | `autk/src/index.ts:1-5` exposes `core`, `map`, `db`, `compute`, and `plot` namespaces; `autk/src/*.ts` uses flat `export *`. | Moving an import between root and subpath requires changing both the path and member access. This is documented, but it is still a migration cost. | Keep the distinction deliberate and show equivalent examples for every module. Avoid adding selected flat exports at the root, which would create collisions. |
| Medium | The umbrella version is not lockstep with all exposed namespace versions. | `autk/package.json:3,61-65` is `3.0.2`, while core/map/compute/plot are pinned to `3.0.1` and DB to `3.0.2`. | Users cannot infer component API versions from the umbrella version, and release notes can become ambiguous. | Publish a compatibility table or adopt a lockstep release policy for packages exposed by the umbrella. |
| Low | Runtime and type parity is delegated entirely to component entry points. | Every subpath is a one-line `export *`; the root is namespace-only. | This is simple, but an accidental missing export in a component is reproduced by the umbrella with no package-level contract. | Generate and compare an export manifest during package validation so root namespaces and subpaths are known to match their component entry points. |
| Low | Environment support is described as browser-only even though the DB dependency has a Node conditional export. | `autk/README.md:18-29`; `autk-db/package.json:23-26`. | Node consumers may overlook supported DB functionality, while the root also exposes browser-oriented map/plot/compute namespaces. | Document environment support per namespace and recommend subpath imports for environment-specific usage. |

## Recommended order

1. Decide and document the ESM/CommonJS policy.
2. Define a release/version compatibility policy.
3. Add generated export-surface documentation.
4. Clarify browser versus Node support by namespace.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
