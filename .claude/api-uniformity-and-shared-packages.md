# API Uniformity & Shared Packages — Design Notes & Execution Plan

> Discussion date: 2026-03-31

---

## Context

The four Autark packages (`autk-db`, `autk-map`, `autk-compute`, `autk-plot`) have grown with inconsistent API conventions. This document records a design review of those inconsistencies and a plan for two new shared packages (`autk-types` and `autk-core`), along with alignment to the feature-centric public API described in the paper.

---

## All 30 Changes

| # | Change | Effort | Breakage | Phase |
|---|---|---|---|---|
| 1 | `autk-map`: positional → object params | High | Breaking | 3 |
| 2 | Redundant enum prefixes (`AUTK_`, `AGGREGATION_`, `MOUSE_`) | Low | Breaking | 2 |
| 3 | Duplicate `NormalizationMode` + color types → `autk-types` | Medium | Breaking | 1 |
| 4 | `ColorMapInterpolator` out of sync → unified 4-value enum in `autk-types` | Low | Breaking | 1 |
| 5 | `GeoJSON` casing (`GeoJson`/`Geojson` → `GeoJSON`) | Low | Breaking | 2 |
| 6 | `wglsFunction` typo → `wgslFunction`; update all callers in `gallery/` and `usecases/` | Trivial | Breaking | 2 |
| 7 | `autk-compute`: `GeojsonCompute` + `RenderCompute` → single `AutkComputeEngine` facade | Low | Breaking | 6 |
| 8 | `updateRenderInfoProperty(name, key, value: unknown)` → `updateLayerRenderInfo(name, info: Partial<LayerRenderInfo>)` | Low | Breaking | 3 |
| 9 | Inline `normalization` shape → `NormalizationConfig` in `autk-types`; use in all 3 packages | Low | Breaking | 1 |
| 10 | Asymmetric event listener signatures → single event object in both modules | Low | Breaking | 3/4 |
| 11 | Remove `I`-prefix from all `autk-map` interfaces | Low | Breaking | 2 |
| 12 | `LayerType`: reconcile enum (`autk-map`) vs string union (`autk-db`) → string union in `autk-types` | Low | Breaking | 1 |
| 13 | `BoundingBox` vs `BBox`: canonical named-field type in `autk-types`; replace GeoJSON tuple usage | Low | Breaking | 1 |
| 14 | `ColorRGB.opacity` → `.alpha`; `RenderLayer.color` tuple → `ColorRGB` in `autk-compute` | Trivial | Breaking | 1/6 |
| 15 | `MapEvents.addEventListener` event param `string` → `MapEvent` (resolved by EventEmitter generic) | Trivial | Breaking | 7 |
| 16 | `PlotHistogramConfig` → `HistogramConfig` (drop redundant `Plot` prefix) | Trivial | Breaking | 4 |
| 17 | Align event registration: `PlotConfig.events[]` opt-in vs `AutkMap` hardcoded → consistent opt-in at construction | Low | Breaking | 3 |
| 18 | Unify `CameraData` (autk-map) and `ViewProjectionParams` (autk-compute) with shared base in `autk-core` | Low | Non-breaking | 8 |
| 19 | Add `getColorArray()` to merged `ColorMap` in `autk-core` (currently missing from `autk-plot`) | Trivial | — | 7 |
| 20 | `loadOsmFromOverpassApi` → `loadOsm` (source belongs in params, not method name) | Trivial | Breaking | 5 |
| 21 | `SpatialDb` → `AutkSpatialDb` | Trivial | Breaking | 5 |
| 22 | `AutkChart` facade for plot module (`type` discriminator replaces individual class exports) | Low | Breaking | 4 |
| 23 | `map.loadGeoJsonLayer` → `map.loadCollection` (feature-centric naming) | Low | Breaking | 3 |
| 24 | `map.updateGeoJsonLayerThematic` → `map.updateThematic` | Trivial | Breaking | 3 |
| 25 | `db.spatialJoin` → `db.spatialQuery` with `spatialPredicate: 'JOIN' \| 'NEAREST'` inside params | Low | Breaking | 5 |
| 26 | `computeFunctionIntoProperties` → `analytical`; `geojson`→`collection`, `attributes`→`variableMapping`, `outputColumnName`→`resultField`, `wgslFunction`→`wgslBody` | Low | Breaking | 6 |
| 27 | `mapEvents` / `plotEvents` property → `events` (both modules) | Trivial | Breaking | 3/4 |
| 28 | `addEventListener` → `addListener` (both event classes) | Trivial | Breaking | 3/4 |
| 29 | `MapEvent.PICK` → `MapEvent.PICKING` | Trivial | Breaking | 2 |
| 30 | `PlotConfig.data` → `PlotConfig.collection` | Trivial | Breaking | 4 |

---

## Execution Plan

All phases are breaking. Update `gallery/` and `usecases/` last — they act as integration tests once all package APIs stabilize.

---

### Phase 1 — Create `autk-types`

Zero-runtime package. No dependencies. Pure TypeScript enums, type aliases, and interfaces.

**Items: 3, 4, 9, 12, 13, 14 (partial)**

```
LayerType              — string union, reconciles autk-map enum + autk-db string union
                         'surface' | 'water' | 'parks' | 'roads' | 'buildings' |
                         'points' | 'polygons' | 'polylines' | 'raster'

NormalizationMode      — moved from autk-map + autk-plot (were identical)

NormalizationConfig    — extracted from 3 packages:
                         { mode: NormalizationMode; lowerPercentile?: number; upperPercentile?: number }

ColorMapInterpolator   — unified 4-value enum:
                         SEQUENTIAL_REDS, SEQUENTIAL_BLUES, DIVERGING_RED_BLUE, OBSERVABLE10

ColorHEX               — type alias, moved from autk-map + autk-plot
ColorTEX               — type alias, moved from autk-map + autk-plot
ColorRGB               — type alias, moved + field renamed: .opacity → .alpha

BoundingBox            — named-field interface { minLon, minLat, maxLon, maxLat }
                         replaces both autk-db's BoundingBox and autk-map/plot's GeoJSON BBox tuple
```

Re-export all of the above from `autk-map`, `autk-plot`, `autk-db`, and `autk-compute` so callers importing from those packages don't break at the usage site — only at the type-definition site.

---

### Phase 2 — Naming fixes (mechanical, across all packages)

**Items: 2, 5, 6, 11, 29**

**Enum member prefixes (item 2):**
```typescript
// autk-map — before → after
LayerType.AUTK_OSM_SURFACE    → LayerType.OSM_SURFACE
LayerType.AUTK_OSM_PARKS      → LayerType.OSM_PARKS
LayerType.AUTK_OSM_WATER      → LayerType.OSM_WATER
LayerType.AUTK_OSM_ROADS      → LayerType.OSM_ROADS
LayerType.AUTK_OSM_BUILDINGS  → LayerType.OSM_BUILDINGS
LayerType.AUTK_GEO_POINTS     → LayerType.GEO_POINTS
LayerType.AUTK_GEO_POLYLINES  → LayerType.GEO_POLYLINES
LayerType.AUTK_GEO_POLYGONS   → LayerType.GEO_POLYGONS
LayerType.AUTK_RASTER         → LayerType.RASTER

ThematicAggregationLevel.AGGREGATION_POINT      → POINT
ThematicAggregationLevel.AGGREGATION_PRIMITIVE  → PRIMITIVE
ThematicAggregationLevel.AGGREGATION_COMPONENT  → COMPONENT

MouseStatus.MOUSE_IDLE  → IDLE
MouseStatus.MOUSE_DRAG  → DRAG
```

**Interface I-prefix removal (item 11) — autk-map only:**
```typescript
ILayerInfo           → LayerInfo
ILayerRenderInfo     → LayerRenderInfo
ILayerData           → LayerData
ILayerGeometry       → LayerGeometry
ILayerThematic       → LayerThematic
IRasterData          → RasterData
ILayerComponent      → LayerComponent
ILayerBorder         → LayerBorder
ILayerBorderComponent → LayerBorderComponent
ICameraData          → CameraData
IMapStyle            → MapStyle
```

**GeoJSON casing (item 5):**
```typescript
loadGeoJsonLayer            → (will become loadCollection in phase 3)
updateGeoJsonLayerThematic  → (will become updateThematic in phase 3)
GeojsonCompute              → GeoJSONCompute (intermediate name before phase 6 facade)
```

**Typo + enum (items 6, 29):**
```typescript
wglsFunction   → wgslFunction  // update all callers in gallery/ and usecases/
MapEvent.PICK  → MapEvent.PICKING
```

---

### Phase 3 — `autk-map` API overhaul

**Items: 1, 8, 10 (map side), 17, 23, 24, 27, 28**

**Object params — all public methods (item 1):**
```typescript
// before (positional)
loadGeoJsonLayer(name: string, geojson: FeatureCollection, type?: LayerType): void

// after (object params)
loadCollection(params: LoadCollectionParams): void
// LoadCollectionParams: { layerName: string; collection: FeatureCollection; layerType?: LayerType }
```

Apply same pattern to: `loadRasterCollection` (was `loadGeoTiffLayer`), `updateThematic` (was `updateGeoJsonLayerThematic`), `updateLayerRenderInfo` (was `updateRenderInfoProperty`).

**Feature-centric renames (items 23, 24):**
```typescript
loadGeoJsonLayer           → loadCollection
loadGeoTiffLayer           → loadRasterCollection
updateGeoJsonLayerThematic → updateThematic
updateGeoTiffLayerData     → updateRasterData
```

**Typed render info update (item 8):**
```typescript
// before
updateRenderInfoProperty(layerName: string, property: keyof ILayerRenderInfo, value: unknown): void

// after
updateLayerRenderInfo(layerName: string, info: Partial<LayerRenderInfo>): void
```

**Event API (items 17, 27, 28):**
```typescript
// before
map.mapEvents.addEventListener(MapEvent.PICKING, (selection: number[], layerId: string) => void)

// after — opt-in at construction, consistent property name and method name
const map = new AutkMap(canvas, { events: [MapEvent.PICKING] })
map.events.addListener(MapEvent.PICKING, (event: { selection: number[]; layerId: string }) => void)
```

**Event listener shape (item 10 — map side):**
```typescript
// before
type MapEventListener = (selection: number[], layerId: string) => void

// after — single event object
type MapEventListener = (event: { selection: number[]; layerId: string }) => void
```

---

### Phase 4 — `autk-plot` API overhaul

**Items: 10 (plot side), 16, 22, 27, 28, 30**

**`AutkChart` factory (item 22):**
```typescript
// before — individual class exports
const plot = new Scatterplot(config)

// after — single entry point
const plot = new AutkChart(div, {
  type: 'scatterplot' | 'barchart' | 'linechart' | 'parallel-coordinates' | 'table',
  collection,
  events: [PlotEvent.CLICK],
  ...
})
```

**Param rename (item 30):**
```typescript
PlotConfig.data: FeatureCollection  →  PlotConfig.collection: FeatureCollection
```

**Histogram config rename (item 16):**
```typescript
PlotHistogramConfig  →  HistogramConfig   // drop redundant Plot prefix
```

**Event API (items 27, 28):**
```typescript
// before
plot.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[]) => void)

// after
plot.events.addListener(PlotEvent.CLICK, (event: { selection: number[] }) => void)
```

**Event listener shape (item 10 — plot side):**
```typescript
// before
type PlotEventListener = (selection: number[]) => void

// after
type PlotEventListener = (event: { selection: number[] }) => void
```

---

### Phase 5 — `autk-db` API overhaul

**Items: 20, 21, 25**

```typescript
// Class rename (item 21)
SpatialDb  →  AutkSpatialDb

// Method rename (item 20)
loadOsmFromOverpassApi(params: LoadOsmFromOverpassApiParams)
  → loadOsm(params: LoadOsmParams)
// endpoint/API url details move inside params

// Query unification (item 25)
spatialJoin(params: SpatialJoinParams)
  → spatialQuery(params: SpatialQueryParams)
// SpatialQueryParams adds: spatialPredicate: 'JOIN' | 'NEAREST'
// previous spatialJoin params become the body of spatialPredicate: 'JOIN'
```

---

### Phase 6 — `autk-compute` API overhaul

**Items: 7, 14 (partial), 26**

**Single facade (item 7):**
```typescript
// before — two classes
const geoCompute = new GeojsonCompute()
const renderComp = new RenderCompute()

// after — one class
const cp = new AutkComputeEngine()
await cp.analytical(...)         // was computeFunctionIntoProperties on GeojsonCompute
await cp.renderIntoMetrics(...)  // was renderIntoMetrics on RenderCompute
```

**`analytical` param simplification (item 26):**
```typescript
// before
computeFunctionIntoProperties({
  geojson: FeatureCollection,
  attributes: Record<string, string>,      // variable name → feature property
  outputColumnName: string,
  wglsFunction: string,                    // full WGSL function (+ typo)
  ...
})

// after
analytical({
  collection: FeatureCollection,
  variableMapping: Record<string, string>, // same concept, clearer name
  resultField: string,
  wgslBody: string,                        // body only — engine wraps it
  ...
})
```

**Color representation (item 14 — partial):**
```typescript
// before — raw RGBA tuple
interface RenderLayer { color: [number, number, number, number] }

// after — use shared ColorRGB from autk-types
interface RenderLayer { color: ColorRGB }
```

---

### Phase 7 — Create `autk-core`

Shared runtime code. Depends on `autk-types`.

**Items: 15, 18 (partial), 19**

**`ColorMap` — merged superset (item 19):**
```typescript
class ColorMap {
  static getColor(value: number, color: ColorMapInterpolator): ColorRGB
  static getColorMap(color: ColorMapInterpolator, res?: number): ColorTEX
  static getColorArray(color: ColorMapInterpolator, res?: number): ColorRGB[]  // autk-plot gains this
  static computeNormalizationRange(values: number[], config?: NormalizationConfig): [number, number]
  static rgbToHex(color: ColorRGB): ColorHEX
  static hexToRgb(color: ColorHEX): ColorRGB
}
```

Drop local `ColorMap` from `autk-map` and `autk-plot`. Both import from `autk-core`.

**`EventEmitter<TEvent, TListener>` — generic base (item 15):**

Replaces both `MapEvents` and `PlotEvents`, which are structurally identical:
```typescript
class EventEmitter<TEvent extends string, TListener extends (...args: any[]) => void> {
  constructor(events: TEvent[])
  addListener(event: TEvent, listener: TListener): void
  removeListener(event: TEvent, listener: TListener): void
  emit(event: TEvent, ...args: Parameters<TListener>): void
}
```

This also resolves item 15 — `MapEvents.addListener` event param will be typed as `MapEvent`, not `string`, because `TEvent` is constrained.

**Triangulators + mesh types:**
```
TriangulatorPoints
TriangulatorPolylines
TriangulatorPolygons
TriangulatorBuildings
TriangulatorRaster

LayerGeometry        (moved from autk-map, I-prefix already removed in phase 2)
LayerComponent
LayerBorder
LayerBorderComponent
```

---

### Phase 8 — Camera unification in `autk-core`

**Item: 18**

`CameraData` (autk-map, renamed in phase 2) and `ViewProjectionParams` (autk-compute) share three fields. Extract a base:

```typescript
// autk-core
interface CameraOrientation {
  eye:    [number, number, number]
  lookAt: [number, number, number]
  up:     [number, number, number]
}

interface ViewProjectionParams extends CameraOrientation {
  fovDeg:  number
  aspect:  number
  near:    number
  far:     number
}

// autk-map CameraData becomes an alias for CameraOrientation
type CameraData = CameraOrientation
```

---

### Phase 9 — Update `gallery/` and `usecases/`

Update all callers to the new APIs. This phase is intentionally last — it verifies that every change in phases 1–8 composes correctly end-to-end.

Search and replace checklist:
- `wglsFunction` → `wgslBody`
- `new SpatialDb()` → `new AutkSpatialDb()`
- `new GeojsonCompute()` / `new RenderCompute()` → `new AutkComputeEngine()`
- `new Scatterplot(...)` / `new Barchart(...)` / etc → `new AutkChart(...)`
- `mapEvents.addEventListener` → `events.addListener`
- `plotEvents.addEventListener` → `events.addListener`
- `loadGeoJsonLayer` → `loadCollection`
- `updateGeoJsonLayerThematic` → `updateThematic`
- `spatialJoin` → `spatialQuery`
- `computeFunctionIntoProperties` → `analytical`
- All `AUTK_`, `AGGREGATION_`, `MOUSE_` enum prefixes
- All `I`-prefixed interface names
- `MapEvent.PICK` → `MapEvent.PICKING`
- `PlotConfig.data` → `PlotConfig.collection`
- `PlotHistogramConfig` → `HistogramConfig`
- `.opacity` → `.alpha` on ColorRGB usage

---

## Dependency Graph

```
Phase 1 (autk-types)
     ↓
Phase 2 (naming — mechanical, all packages)
     ↓
Phase 3        Phase 4        Phase 5        Phase 6
(autk-map)     (autk-plot)    (autk-db)      (autk-compute)
     └──────────────┴──────────────┴──────────────┘
                              ↓
                    Phase 7 (autk-core)
                              ↓
                    Phase 8 (camera unification)
                              ↓
                    Phase 9 (gallery + usecases)
```

Phases 3–6 are independent of each other and can be done in any order after phase 2.

---

## Package Infrastructure

### `autk-types` and `autk-core` are private — not independently released

Both new packages are internal to the monorepo. They are never published to npm. Each is marked `"private": true`. Consumers (`autk-map`, `autk-plot`, etc.) reference them via workspace protocol so the build system resolves them locally without publishing.

### Monorepo workspace setup (new root `package.json`)

The project currently has no root `package.json`. One must be created to enable workspaces:

```json
// /package.json  (new file)
{
  "name": "autark",
  "private": true,
  "workspaces": [
    "autk-types",
    "autk-core",
    "autk-db",
    "autk-map",
    "autk-compute",
    "autk-plot"
  ]
}
```

Run `npm install` (or `pnpm install`) from the root once to link the workspace packages.

### New `autk-types/package.json`

```json
{
  "name": "autk-types",
  "version": "1.3.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

No build step required — consuming packages import the `.ts` source directly (TypeScript resolves it) and each package's own Vite build bundles the types inline.

### New `autk-core/package.json`

```json
{
  "name": "autk-core",
  "version": "1.3.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/earcut": "^3.0.0",
    "@types/geojson": "^7946.0.16",
    "@webgpu/types": "^0.1.69",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "autk-types": "workspace:*",
    "d3": "^7.9.0",
    "earcut": "^3.0.2",
    "poly-extrude": "^0.22.2"
  }
}
```

### Updated dependencies per consuming package

Since `autk-types` and `autk-core` are private and get **bundled into each consuming package's output**, they are listed as regular `dependencies` (not `devDependencies`). Vite must NOT externalize them.

| Package | Add to `dependencies` | Remove from `dependencies` (moved to autk-core) |
|---|---|---|
| `autk-db` | `"autk-types": "workspace:*"` | — |
| `autk-map` | `"autk-types": "workspace:*"`, `"autk-core": "workspace:*"` | `earcut`, `poly-extrude`, `d3` |
| `autk-plot` | `"autk-types": "workspace:*"`, `"autk-core": "workspace:*"` | `d3` |
| `autk-compute` | `"autk-types": "workspace:*"`, `"autk-core": "workspace:*"` | — |

`d3` and `earcut` move to `autk-core` as the single owner. The consuming packages drop them from their own `dependencies` because they reach `d3` transitively through `autk-core`, which gets bundled in.

### Vite configuration — do not externalize private packages

Each package's `vite.config.ts` must ensure `autk-types` and `autk-core` are **not** in the `external` list (so they get bundled into the dist output, since they are never published independently):

```typescript
// vite.config.ts in autk-map, autk-plot, autk-compute, autk-db
build: {
  lib: { ... },
  rollupOptions: {
    // autk-types and autk-core are intentionally absent here — they get bundled
    external: ['@duckdb/duckdb-wasm', '@turf/turf', ...]
  }
}
```

### New packages need `tsconfig.json`

`autk-types` and `autk-core` each need a `tsconfig.json`. They can copy the pattern from any existing package and simplify (no `outDir` needed since there is no build step — `tsc` is only used for type-checking via `npm run build`).

### Vite `external` list — no changes needed for most packages

`autk-map` and `autk-plot` currently have no `external` list in their Vite configs, meaning all dependencies are bundled into the dist output. This is the correct behavior for `autk-core` and `autk-types` — they will bundle naturally without any config change.

`autk-db` externalizes `@duckdb/duckdb-wasm` (WASM must stay external). No change needed there.

### `@types/d3` and `@types/earcut` move to `autk-core`

These type packages are only needed during the build of `autk-core`. The consuming packages no longer need them in their own `devDependencies` once the types are encapsulated inside `autk-core`.

---

## Makefile

### Folder renames (already applied)

```
case-studies  →  usecases
examples      →  gallery
```

The Makefile `clean` target and the `APP ?= examples` default have already been updated to reflect these names.

### App folders in the monorepo

There are three consumer app folders: `gallery/`, `usecases/`, and `performance/`. All three:
- Have `"name": "demo"` in their `package.json` — should be renamed to `"gallery"`, `"usecases"`, `"performance"` respectively
- Reference packages via `"file:../autk-*"` — should change to `"workspace:*"` once the root workspace is set up
- Have `d3` as a direct dependency — review per app whether this is still needed after `d3` moves to `autk-core`

`performance/` was missing from the Makefile `clean` target — already fixed. It is not in the `dev` workflow since `APP ?= gallery`; run `make dev APP=performance` to target it explicitly.

The root `package.json` workspaces array should include the app folders too so a single `npm install` at root handles everything:

```json
"workspaces": [
  "autk-types",
  "autk-core",
  "autk-db",
  "autk-map",
  "autk-compute",
  "autk-plot",
  "gallery",
  "usecases",
  "performance"
]
```

### Changes needed when workspace setup is adopted (Phase 1 prerequisite)

Once a root `package.json` with workspaces is in place, the `install` target simplifies — a single `npm install` at the root links and installs everything:

```makefile
# current — installs each package independently
install:
    $(CONCURRENTLY) "cd autk-map && npm install" ...

# after workspace setup — one command handles all packages including autk-types and autk-core
install:
    npm install
```

The `build` target stays the same — `autk-types` and `autk-core` have no build step (TypeScript source is bundled inline by each consumer's Vite build). The four public packages still each run `npm run build` individually.

The `publish` target stays unchanged — it only allows publishing the four public packages (`autk-map`, `autk-db`, `autk-plot`, `autk-compute`). `autk-types` and `autk-core` are excluded by design since they are `private: true`.
