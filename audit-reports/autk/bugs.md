# `@urban-toolkit/autk` bug audit

## Summary

No umbrella-source functional defect was observed: the package consists of five namespace exports and five flat subpath re-exports, and package validation passed. The following packaging hazards can still produce consumer-visible failures.

## Findings

### 1. Exact component pins can create duplicate package runtimes — Medium

**Evidence:** `autk/package.json:61-65` pins every component to an exact version. The umbrella currently depends on `autk-core@3.0.1`; an application that also installs a newer compatible core can receive two copies.

**Impact:** Duplicate runtimes are more than a size issue because some packages contain process-wide mutable state (for example triangulator defaults). A value changed through one copy is not seen by classes using the other copy. Cross-copy `instanceof` checks can also fail.

**Recommendation:** Publish all umbrella components in lockstep, or use a deliberate peer/compatible-range policy with one resolved runtime. Detect duplicate Autark package versions and issue a clear diagnostic.

### 2. CommonJS migration from a component to an umbrella subpath fails — Medium

**Evidence:** `autk/vite.config.ts:27` builds ESM only and `autk/package.json` has no `require` condition, whereas core, compute, map, and plot expose UMD/CommonJS entries.

**Impact:** Code that works as `require('@urban-toolkit/autk-map')` fails when changed to the advertised aggregate equivalent `require('@urban-toolkit/autk/map')`.

**Recommendation:** Add CommonJS builds/conditions or state that umbrella imports require ESM and should not be treated as drop-in replacements in CommonJS projects.

### 3. Root imports eagerly establish dependencies on all modules — Low

**Evidence:** `autk/src/index.ts:1-5` statically imports all five package namespaces. The package does not declare `sideEffects: false`.

**Impact:** A consumer importing only `{ core }` from the root may still make a bundler retain or resolve DB, map, compute, and plot. This increases bundle/install exposure and can make one environment-specific dependency break an otherwise unrelated root import in conservative bundlers.

**Recommendation:** Recommend subpaths for selective use, declare accurate side-effect metadata, and consider lazy module access if a single runtime root remains a goal.

### 4. There is no runtime compatibility assertion across the pinned modules — Low

**Evidence:** The wrapper performs only re-exports; it exposes no build/version metadata and runs no compatibility check.

**Impact:** A partially published or overridden dependency set can load successfully and fail later at shared API boundaries.

**Recommendation:** Generate a small compatibility manifest containing the expected package versions and expose it for diagnostics.

## Verification context

- Repository lint, typecheck, and builds passed through `make verify`.
- Publish-artifact validation passed through `npm run validate:packages`.
- These results confirm the current artifacts, not compatibility with arbitrary dependency overrides or CommonJS consumers.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
