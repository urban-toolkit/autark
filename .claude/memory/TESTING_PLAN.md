# Testing Strategy for Autark Colormap Refactor

**Date**: April 3, 2026  
**Context**: Validate impacts of GPU-side domain normalization changes across colormap engine, layer rendering, and shader pipeline.

---

## Current State

- **No automated tests exist** (zero `.test.ts` / `.spec.ts` files)
- **Only manual validation path**: `make dev APP=gallery` or `make dev APP=usecases`
- **Refactor scope**: Core logic, GPU uniforms, fragment shaders, UI rendering
- **Validation challenge**: Requires both logic checks AND visual/interface validation

---

## Testing Options

### Option A — Pure-logic unit tests ⭐ Highest ROI

**Coverage**: Core colormap engine logic without needing WebGPU or browser.

**What to test**:
- `ColorMap.resolveDomainFromData()` — minmax, percentile, categorical, diverging center policies
- `ColorMap.computeLabels()` — formatting edge cases, d3-format magnitude handling
- `valueAtPath()`, `isNumericLike()` — utility correctness
- Domain cache hit/miss behaviour
- `computeDataFingerprint()` — fingerprint stability

**Tooling**: [Vitest](https://vitest.dev/)
- Zero-config for TypeScript
- Native ESM support
- Extremely fast
- No browser required

**Installation**: Add to `autk-core/package.json`

**Effort**: Low. Functions are pure and deterministic.

**Pros**:
- Catches the bulk of correctness risk
- Runs in seconds
- No CI/environment concerns
- Perfect for TDD during refactor iterations

**Cons**: Does not validate GPU shader normalization or visual rendering output.

---

### Option B — Visual regression with Playwright 📸 Medium Effort

**Approach**: Automated browser screenshots compared against baseline images.

**How it works**:
1. Playwright launches real Chromium (WebGPU-enabled on macOS)
2. Navigate to gallery page (e.g., `colormap-categorical`, `heatmap-vis`)
3. Wait for map render + legend DOM stability
4. Capture screenshot
5. Compare pixel diff against stored baseline

**Reuses existing** gallery pages as test fixtures — no new UI needed.

**Tooling**: [Playwright](https://playwright.dev/)

**Installation**: Workspace root

**Effort**: Medium. Setup ~2–4 hours; maintaining baselines requires intentional updates.

**Pros**:
- Catches GPU pipeline regressions (shader bugs, wrong normalization, missing uniforms)
- Catches UI layer bugs (legend rendering, label truncation)
- Validates the exact visual output users see
- WebGPU works reliably on macOS locally

**Cons**:
- WebGPU adoption in CI (GitHub Actions) is incomplete — may require special setup
- Screenshot baselines need discipline (update only when visual changes are intentional)
- Slower than unit tests (~5–10s per test)

---

### Option C — Headless canvas snapshot tests (Lighter)

**Approach**: Extract colorization logic (scalar → RGBA) and test it in isolation without GPU.

**Coverage**: CPU-side color mapping computation, not shader execution.

**Tooling**: Manual assertion + Node.js

**Effort**: Low to medium.

**Pros**: No browser, no WebGPU, fast, pure logic.

**Cons**: Does not validate GPU normalization or visual output — only confirms the colormap computes correct RGBA values if they were applied.

---

### Option D — Interactive checklist gallery page (Minimal)

**Approach**: Add a dedicated `colormap-validation.ts` gallery page that:
1. Programmatically exercises known inputs (min/max, percentile, categorical)
2. Renders assertions via DOM indicators (e.g., `<div id="test-min-max-0.00">PASS</div>`)
3. Playwright can scrape those assertions

**Benefit**: Checks live in rendering code, always visually inspectable by hand.

**Effort**: Low. Reuses gallery infrastructure.

---

## Recommended Implementation Path

| Phase | Action | Effort | ROI |
|-------|--------|--------|-----|
| **1** (this week) | Add **Vitest** to `autk-core`. Write unit tests for `colormap.ts` and `utils.ts` covering domain resolution, label formatting, caching. | Low | High |
| **2** (next week) | Add **Playwright** at workspace root. Write 4–5 screenshot tests for: `colormap-categorical`, `colormap-diverging`, `heatmap-vis`, `raster-example`. | Medium | High |
| **3** (optional) | Wire both into `make verify` so they run alongside `typecheck` and `build`. | Low | High |
| **4** (optional) | Add interactive validation gallery page for edge cases (empty data, single value, etc.). | Low | Medium |

---

## Phase 1 — Unit Tests (Vitest)

### Setup

```bash
cd autk-core
npm install --save-dev vitest @vitest/ui
```

### Test files to create

- `src/colormap.test.ts` — domain resolution, label formatting, cache
- `src/utils.test.ts` — valueAtPath, isNumericLike
- `src/types.test.ts` — type contracts (optional)

### Example test structure

```typescript
import { describe, it, expect } from 'vitest';
import { ColorMap } from './colormap';
import { ColorMapDomainMode } from './types';

describe('ColorMap.resolveDomainFromData', () => {
  it('computes minmax domain from sequential interpolator', () => {
    const values = [10, 20, 30, 40];
    const config = { 
      interpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
      domain: { type: ColorMapDomainMode.MIN_MAX }
    };
    const result = ColorMap.resolveDomainFromData(values, config);
    expect(result).toEqual([10, 40]);
  });

  it('computes percentile bounds with diverging center', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const config = {
      interpolator: ColorMapInterpolator.DIVERGING_RED_BLUE,
      domain: { type: ColorMapDomainMode.PERCENTILE, params: [0.25, 0.75] }
    };
    const result = ColorMap.resolveDomainFromData(values, config);
    // result[1] should be median (5.5)
    expect(result[1]).toBe(5.5);
  });

  it('converts numeric categorical to strings', () => {
    const values = [0, 1, 2, 0, 1];
    const config = {
      interpolator: ColorMapInterpolator.OBSERVABLE10,
      domain: { type: ColorMapDomainMode.USER, params: [0, 1, 2] }
    };
    const result = ColorMap.resolveDomainFromData(values, config);
    expect(result).toEqual(['0', '1', '2']);
  });
});

describe('ColorMap.computeLabels', () => {
  it('formats sequential domain with magnitude-aware precision', () => {
    const domain: SequentialDomain = [0, 1_000_000];
    const labels = ColorMap.computeLabels(domain);
    // Should use .3s format (k suffix)
    expect(labels).toContain('0');
    expect(labels[labels.length - 1]).toMatch(/M|k/);
  });
});
```

### Run tests

```bash
npm run test          # run once
npm run test -- --ui  # watch mode with UI
```

---

## Phase 2 — Visual Regression (Playwright)

### Setup

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Test file structure

Create: `/Users/mlage/Code/autark/tests/e2e/gallery.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Gallery colormap examples', () => {
  test('colormap-categorical renders with correct legend labels', async ({ page }) => {
    await page.goto('http://localhost:5173/autk-map/colormap-categorical.html');
    await page.waitForLoadState('networkidle');
    
    // Wait for map to render
    await page.waitForSelector('canvas');
    
    // Verify legend DOM
    const legend = page.locator('[role="legend"]');
    await expect(legend).toBeVisible();
    
    // Snapshot test
    await expect(page).toHaveScreenshot('colormap-categorical.png');
  });

  test('colormap-diverging renders with center indicator', async ({ page }) => {
    await page.goto('http://localhost:5173/autk-map/colormap-diverging.html');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    
    await expect(page).toHaveScreenshot('colormap-diverging.png');
  });

  test('heatmap-vis renders raster with correct domain', async ({ page }) => {
    await page.goto('http://localhost:5173/autk-map/heatmap-vis.html');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas');
    
    await expect(page).toHaveScreenshot('heatmap-vis.png');
  });
});
```

### Run tests

```bash
# First start dev server in another terminal
make dev APP=gallery

# Then in another terminal
npx playwright test

# Update baselines (after visually confirming changes are intentional)
npx playwright test --update-snapshots
```

---

## Phase 3 — Integration into Makefile

```makefile
test:
	cd autk-core && npm run test

test-ui:
	cd autk-core && npm run test -- --ui

e2e:
	npx playwright test

e2e-update:
	npx playwright test --update-snapshots

verify: lint typecheck build-all docs test
```

---

## Key assertions to validate by hand (alongside automation)

1. **Domain recomputation**
   - Change colormap interpolator → legend updates immediately
   - Load new thematic data → domain recalculates
   - Load new raster data → domain recalculates

2. **GPU normalization**
   - Sequential domain: values span full color gradient
   - Diverging domain: center color is at center value
   - Categorical: each category maps to distinct color

3. **Label formatting**
   - Large numbers (~1M) → use `k` or `M` suffix (`.3s` format)
   - Regular numbers → 2 decimal places (`.2f` format)
   - Small decimals → `~g` format

4. **Edge cases**
   - Empty dataset → no error, legend empty or default
   - Single-value dataset → domain computes (often min=max or treated as range)
   - Non-numeric string in numeric interpolator → handled gracefully
   - USER domain with wrong type → caught or coerced

---

## Success criteria

✅ **Phase 1 complete**: All colormap + utils unit tests pass, >90% coverage  
✅ **Phase 2 complete**: All gallery screenshot tests pass, baselines stored  
✅ **Phase 3 complete**: `make verify` includes test and e2e targets  
✅ **Manual spot-checks**: All 4 assertions above confirmed working  

---

## Files to create/modify

| File | Action |
|------|--------|
| `autk-core/package.json` | Add vitest dev dependency |
| `autk-core/src/colormap.test.ts` | New — unit tests |
| `autk-core/src/utils.test.ts` | New — unit tests |
| `autk-core/vitest.config.ts` | New — vitest config |
| `playwright.config.ts` | New — playwright config (workspace root) |
| `tests/e2e/gallery.spec.ts` | New — visual regression tests |
| `Makefile` | Update `verify` target to include `test` and `e2e` |
| `package.json` | Add playwright dev dependency |

---

## Next steps

1. Review this plan with team
2. Decide: Phase 1 only? Phases 1+2? All phases?
3. If approved, I can set up vitest and write the first batch of tests
4. Once Phase 1 passes, assess if Phase 2 is needed based on how confident you feel

