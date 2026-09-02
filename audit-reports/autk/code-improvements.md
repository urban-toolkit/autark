# `@urban-toolkit/autk` code-improvement audit

## Summary

The wrapper code is appropriately small. Improvements should focus on release automation, package metadata, and preventing drift rather than adding abstraction to the six source files.

## Opportunities

| Priority | Improvement | Evidence | Suggested change |
|---|---|---|---|
| High | Generate component versions and export entries from one workspace manifest. | Versions and five exports are manually repeated in `autk/package.json`; five source files repeat one-line re-exports. | Maintain one package map and generate dependency pins, `exports`, Vite entries, and re-export files. |
| High | Adopt an explicit dependency ownership policy. | All five components are exact runtime dependencies (`autk/package.json:61-65`). | Choose lockstep exact releases or peer dependencies plus compatible ranges; document why and validate it during packaging. |
| Medium | Mark side effects accurately. | `autk/package.json` has no `sideEffects` field; wrapper modules are pure re-exports. | Add `sideEffects: false` if the published dependency graph is safe for tree shaking, or list the exact modules with side effects. |
| Medium | Add package environment metadata. | No `engines` or capability metadata is present; the root combines DOM, WebGPU, and Node-capable code. | Document supported Node versions, browser/WebGPU requirements, and per-subpath environments in the manifest/README. |
| Medium | Generate an API inventory for release review. | Root namespace exports and subpath star exports are not summarized in this package. | Produce a machine-readable export/version inventory as part of package validation and include it in release artifacts or docs. |
| Low | Remove redundant `main`/`module` ambiguity for ESM. | Both fields point to `./dist/index.js`, while `exports` is authoritative. | Keep a single clearly documented legacy fallback or provide format-specific files if CommonJS is added. |
| Low | Keep wrapper source free of selected convenience exports. | The root currently avoids symbol collisions through namespaces. | Preserve this property; new integration helpers should live under a distinct namespace/module rather than flattening component APIs. |

## Recommended order

1. Set the dependency/release policy.
2. Generate package metadata from the workspace package map.
3. Add side-effect and environment metadata.
4. Generate an export/version inventory.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
