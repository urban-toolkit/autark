# Testing AutarkRuntime

**Status:** Local runtime tests pass. OSM/HAR and interaction coverage remain.

This document describes the **repeatable, tiered testing strategy** for the runtime. Tests are split into **CI-safe automated tests** and **manual network/browser tests**.

---

## Quick Start

```bash
# From repository root:

# 0. One-time setup: Create symlinks for Vite dev server access
#    (Playwright webServer runs from gallery/, needs access to tests/, autk-runtime/, etc.)
cd gallery/public
ln -s ../../tests tests
ln -s ../../autk-runtime autk-runtime
ln -s ../../examples examples
ln -s ../../schema schema
cd ../..

# 1. Validate all spec examples (positive cases)
npm run validate:specs

# 2. Build runtime
cd autk-runtime && npm run build && cd ..

# 3. Run automated runtime tests (local fixtures, no network)
npm run test:runtime

# 4. Run all tests (including gallery)
npm test
```

**Note:** The symlinks in `gallery/public/` allow the Vite dev server (started by Playwright) to serve test fixtures and runtime build files. Without these symlinks, browser tests will get 404 errors.

---

## Current Status

### CI-Safe Automated Tests
- ✅ **Schema validation** - Positive and negative fixtures
- ✅ **Build** - TypeScript compilation
- ✅ **Runtime fixtures** - Local GeoJSON/CSV with Playwright
- ✅ **Local example spec** - Spatial join example executes end-to-end
- ✅ **OSM with HAR** - Recorded Overpass playback runs in CI without network

### Manual Tests (Not CI-Safe)
- ⏸️ **Real Overpass** - Network-dependent, for development only
- ⏸️ **Visual inspection** - Manual browser testing

### Known Gaps

1. **OSM examples** - HAR-backed OSM runtime coverage is automated; live Overpass execution remains network-dependent manual validation.
2. **Selection/highlight interactions** - Event-level histogram-to-map highlight propagation is covered; full pointer-level brushing can be added later if needed.
3. **Style coverage** - Constant fill color, stroke color, line width, opacity, and point size are covered; polygon stroke width still requires a mesh-based outline path.

---

## Test Tiers

### Tier 1: Schema Validation

**Command:**
```bash
npm run validate:specs
```

**What it does:**
- Validates `examples/specs/*.json` against `schema/autark-spec-v0.1.json`
- Runs positive test cases (all 3 examples should validate)

**Negative test cases:**
```bash
npx playwright test tests/runtime/schema-validation.test.ts
```

**What negative tests cover:**
- Misspelled top-level keys (`metadta` instead of `metadata`)
- Unsafe identifiers (`my-name!` instead of `my_name`)
- PBF source without `url`
- Empty `near: {}` in spatial join
- Unknown link targets
- CSV without `geometry` field

**Success criteria:**
- All positive examples validate
- All negative cases are rejected with errors

---

### Tier 2: Build

**Command:**
```bash
cd autk-runtime && npm run build
```

**Success criteria:**
- TypeScript compiles without errors
- `autk-runtime/dist/` directory created
- `dist/index.js` and `dist/index.d.ts` exist

---

### Tier 3: Runtime with Local Fixtures (CI-Safe)

**Command:**
```bash
npm run test:runtime
```

**What it tests:**
- Runtime initialization (`AutarkRuntime.fromSpec()`)
- Local GeoJSON loading
- Local CSV loading with geometry
- Map rendering (canvas visible, non-blank pixels)
- Plot creation
- Metadata APIs: `getDb().getTablesMetadata()`, `getMaps()`, `getPlots()`

**Fixtures:**
- `tests/fixtures/runtime/simple-points.geojson`
- `tests/fixtures/runtime/simple-polygons.geojson`
- `tests/fixtures/runtime/simple-points.csv`
- `tests/fixtures/runtime/fixture-01-geojson-map.json`
- `tests/fixtures/runtime/fixture-02-csv-histogram.json`

**Success criteria:**
- ✅ Status shows "Runtime loaded successfully"
- ✅ Tables have correct names and types
- ✅ Maps and plots are created
- ✅ Canvas is visible with non-blank pixels
- ✅ No console errors
- ✅ `getTablesMetadata()` returns correct metadata

**Current status:** ✅ Passing in `npm run test:runtime`

---

### Tier 4: Runtime with OSM HAR Fixtures (CI-Safe)

**Command:**
```bash
npx playwright test tests/runtime/runtime-osm-har.test.ts
```

**What it tests:**
- OSM data loading with HAR-backed Overpass responses
- OSM layer table naming (`${name}_${layer}`)
- Multi-layer maps

**HAR fixtures:**
- Uses existing `tests/data/*.har` files from gallery tests
- Or create new `tests/data/runtime-*.har` files

**Success criteria:**
- ✅ OSM tables created with correct naming
- ✅ Multiple layers rendered on map
- ✅ No network calls (all routed through HAR)

**Current status:** ⏸️ Skipped - OSM strategy still needs deterministic HAR-backed validation or manual-network documentation

**To re-record HAR:**
```bash
HAR_UPDATE=1 npx playwright test tests/runtime/runtime-osm-har.test.ts
```

---

### Tier 5: Visual Regression (Future)

**Command:** (Future)
```bash
npx playwright test tests/runtime/ --update-snapshots
```

**What it would test:**
- Screenshot comparison for fixture-based specs
- Canvas pixel checks for expected rendering
- Expected number of DOM elements (maps, plots, status)

**Success criteria:**
- Canvas screenshots match baseline
- No visual regressions

---

### Tier 6: Manual Network Tests (Not CI-Safe)

**Purpose:** Development and real-world validation only.

**How to run:**
1. Start Vite dev server:
   ```bash
   cd gallery && npm run dev
   ```

2. Open test harness:
   ```
   http://localhost:5173/tests/fixtures/runtime/runtime-test-harness.html?spec=/examples/specs/01-basic-osm-map.json
   ```

3. Inspect:
   - Browser console for logs
   - Network tab for Overpass calls
   - Canvas rendering
   - Status messages

**Manual checklist:**
- [ ] All 3 examples load without errors
- [ ] OSM data loads from Overpass (network tab shows requests)
- [ ] Maps render with visible features
- [ ] Plots render with expected marks
- [ ] Linked selections work (brush histogram → highlight map)
- [ ] No console errors

---

## Test Structure

```
tests/
├── runtime/
│   ├── schema-validation.test.ts       # Positive and negative schema tests
│   ├── runtime-fixtures.test.ts        # Local GeoJSON/CSV tests (CI-safe)
│   └── runtime-osm-har.test.ts         # OSM with HAR (CI-safe)
├── fixtures/
│   └── runtime/
│       ├── runtime-test-harness.html   # Browser test page
│       ├── simple-points.geojson       # Local fixture
│       ├── simple-polygons.geojson     # Local fixture
│       ├── simple-points.csv           # Local fixture
│       ├── fixture-01-geojson-map.json # Test spec
│       └── fixture-02-csv-histogram.json # Test spec
├── data/
│   └── *.har                           # HAR recordings for Overpass
└── helpers/
    └── route-overpass-har.ts           # HAR routing utility

autk-runtime/
├── src/                                # Runtime implementation
├── dist/                               # Build output
├── package.json                        # Runtime package with test scripts
└── TESTING.md                          # This file

examples/specs/                         # Example specs (not for automated tests)
├── 01-basic-osm-map.json               # Requires network
├── 02-linked-map-histogram.json        # Requires network
└── 03-spatial-join.json                # Requires missing fixtures
```

---

## Package Scripts

### Root `package.json`
```json
{
  "scripts": {
    "validate:specs": "ajv validate -s schema/autark-spec-v0.1.json -d \"examples/specs/*.json\" --strict=false",
    "test:runtime": "playwright test tests/runtime"
  }
}
```

### Runtime `autk-runtime/package.json`
```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "clean": "rm -rf dist",
    "test": "cd .. && npm run test:runtime",
    "validate": "cd .. && npm run validate:specs"
  }
}
```

---

## Debugging Runtime Issues

### 1. Check Database Tables

In browser console (when using test harness):

```javascript
const runtime = window.__autarkRuntime;
const db = runtime.getDb();
const tables = db.getTablesMetadata();
console.table(tables.map(t => ({ name: t.name, type: t.type, source: t.source })));
```

### 2. Check Maps and Plots

```javascript
const maps = runtime.getMaps();
console.log('Maps:', maps.map(m => m.name));

const plots = runtime.getPlots();
console.log('Plots:', plots.map(p => p.name));
```

### 3. Check Spec Parsing

```javascript
const spec = window.__autarkSpec;
console.log('Loaded spec:', spec);
```

### 4. Common Errors

**"Table X not found"**
- Check data loader completed
- Verify table naming (OSM uses `${name}_${layer}`)

**"Cannot read property 'addEventListener' of undefined"**
- Plot not initialized correctly
- Check plot event name mismatch (`brush` vs `brushend`)

**"updateStyle is not a function"**
- AutkMap doesn't support constant style updates
- Workaround: Use encoding with constant values

---

## Success Criteria Summary

### Measurable Assertions

Instead of "visually inspect map," tests check:

- ✅ Status element has class `success`
- ✅ Status text is "Runtime loaded successfully"
- ✅ `window.__autarkRuntime` is defined
- ✅ `getTablesMetadata()` returns expected table names
- ✅ Table count matches expected (e.g., 1 for single-source spec)
- ✅ Maps array has expected length
- ✅ Plots array has expected length
- ✅ Canvas element is visible
- ✅ Canvas has non-transparent pixels (basic rendering check)
- ✅ No `pageerror` events fired
- ✅ Metadata display shows correct table/map/plot counts

### For Interactive Tests (Manual)

- [ ] Brush on histogram triggers map highlight
- [ ] Map layers are visible
- [ ] Plot marks are visible
- [ ] Expected plot interactions work (click, brush, brushX, brushY)

---

## Next Steps

### Immediate (Phase A)
1. ✅ Add `validate:specs` and `test:runtime` scripts
2. ✅ Create negative schema validation tests
3. ✅ Create local fixture tests

### Short-term (Phase B)
1. ✅ Fix plot event names in runtime (`brushX`)
2. ✅ Fix database API calls (`getTablesMetadata()` not `listTables()`)
3. ✅ Unskip OSM HAR tests
4. Add visual regression snapshots

### Long-term (Phase C)
1. Add unit tests for runtime modules (layout, validation, data loaders)
2. Add interaction tests (selection propagation)
3. Add performance benchmarks (load time, render time)
4. Add more negative fixtures (all validation failure modes)

---

## Design Notes

### Why Not `autk-runtime/test/`?

The repo's Playwright config (`playwright.config.ts`) only discovers tests in `./tests/`. Moving runtime tests to `autk-runtime/test/` would require changing the config and potentially breaking existing gallery tests.

### Why Not `npx http-server`?

The repo is Vite-heavy. Adding another dev server tool increases dependencies and cognitive load. The existing Vite server (`npm run dev` in gallery) can serve test files.

### Why Local Fixtures for Tier 3?

Real Overpass data is fragile for CI:
- Rate limits
- Network timeouts
- Response variability

Local fixtures guarantee:
- No network calls
- Instant execution
- Repeatable results

Real Overpass tests are Tier 6 (manual only) or Tier 4 (HAR-backed).

### Why HAR Instead of Mocks?

HAR files:
- Capture real Overpass responses
- Work with existing `routeFromHAR()` helper
- Can be updated when APIs change
- Are portable across test frameworks

---

## References

- **Plot events:** [autk-plot/src/types-events.ts](../../autk-plot/src/types-events.ts)
- **Database API:** [autk-db/src/db.ts](../../autk-db/src/db.ts) (line 143: `getTablesMetadata()`)
- **Playwright config:** [playwright.config.ts](../../playwright.config.ts)
- **HAR routing helper:** [tests/helpers/route-overpass-har.ts](../../tests/helpers/route-overpass-har.ts)
- **Example specs:** [examples/specs/](../../examples/specs/)
- **Schema:** [schema/autark-spec-v0.1.json](../../schema/autark-spec-v0.1.json)
