# Streaming terrain tiles for `autk-map`

Terrain mode can take its elevation from a web tile service (Terrarium or Mapbox terrain-RGB PNG tiles) that streams in as the camera moves, and image tiles drape over it. Read with [TILE-BASEMAP.md](TILE-BASEMAP.md), which describes the tile layer this builds on.

The existing terrain renderer stays: its quadtree of 32×32-cell patches, its LOD, its overlay-texture draping and the GeoTIFF path. We do not copy deck.gl's one-mesh-per-tile design. Out of scope: vector tiles, quantized-mesh, a globe, signed requests, offline use.

## Design

### Height clipmap

A stack of fixed-size height windows around the view, each covering twice the extent of the one before at half the detail, fed by the DEM tiles they need. Every consumer (terrain, buildings, picking) already samples one texture by world position, so this fits.

- **Levels.** Up to 8 (default 6) windows of `N×N` samples (default 512, even, at most 2048). Level `k` reads tile zoom `finest − k`, where the finest is `min(source.maxZoom, 14) + zoomBias`.
- **Storage.** One `r32float` texture array, a layer per level (6 MB at the defaults).
- **Placement.** A sample is one DEM pixel of its zoom. A window's origin snaps to whole samples, so heights do not swim while the view moves. The outermost window is the terrain: about 156 km wide at the defaults.
- **Detail depends on the provider.** Its source data is 30 m in most of the world, 10 m in the US and finer in a few countries, so where it is 30 m, zooms above about 12 add smoothness, not detail. `zoomBias` lowers the cost.

### Composition

Tiles are decoded to `Float32Array`s, and each window is composed on the CPU and uploaded with `writeTexture`. This keeps reprojection exact and testable (a per-row table, since x agrees between EPSG:3395 and 3857), gives culling bounds and `heightAt` for free, and avoids decoding in a shader.

- **Decoding.** Terrarium is `R·256 + G + B/256 − 32768`; Mapbox is `−10000 + (R·65536 + G·256 + B)·0.1`. Tiles are read with colour conversion and premultiplication off. Transparent pixels are no data.
- **Sampling.** Bilinear in global pixel coordinates, across tile edges. A missing pixel takes the next coarser zoom's height at its own centre, so the surface cannot jump where fine data ends.
- **Request flow.** Tiles load coarsest level first, so a complete low-detail surface exists after one round trip. A level recomposes only when its snapped position moves or a tile it depends on arrives. A level with no-data pixels keeps following coarser arrivals until none depend on fallback.
- **Compose budget.** Each frame composes out-of-date windows, longest-waiting first (coarsest among equals), until `composeBudgetMs` (default 4) is spent. The rest wait for the next frame, which the source requests. A window is never split, and one never composed before is always composed. `pendingLevels` in the stats counts the waiting ones.

### Shaders and quadtree

- **One lookup.** `height-lookup.wgsl` is included by the terrain, buildings and picking vertex shaders; `heightAt` is its CPU twin. It takes the finest level with weight > 0 and mixes it with the next coarser one; the weight rises by smoothstep across the outer 1/8 of a window, so levels meet without a step.
- **Patch budget.** `traverseQuadtree` splits a block only if the result fits `MAX_INSTANCES` (4096), so coarse coverage is kept under a tight budget. Patch resolution follows the finest data anywhere under a block.
- **Seams.** `assignSeams` records how many levels coarser each edge's neighbour is. `patchVertex` moves edge vertices onto the neighbour's vertex grid in world coordinates (any gap, including six levels or more), for heights and normals, so both sides draw and shade the shared edge the same. `morphEdge` is the CPU twin.

### Imagery on terrain

Non-3D layers render into one offscreen overlay texture (at most 4096²) through an orthographic camera over the visible bounds, and that texture drapes over the mesh. Computed with the real camera, an overlay texel covers at most about 1.8 screen pixels on the bottom row of a steeply tilted view and is finer than a pixel at 45° or less, so imagery can look slightly soft at the nearest edge. Accepted.

## API and limits

```ts
map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, crs: 'EPSG:3395', levels: 6,
    windowSize: 512, zoomBias: 0, maxCachedTiles: 128, verticalScale: 1, composeBudgetMs: 4 });
map.getTerrainTileStats();      // levels, tiles, memory, timing (p50/p95/p99), pendingLevels, idle
map.resetTerrainTileTiming();
map.disableTerrainMode();
```

- **Origin.** Like `enableTerrainMode`, it needs the map origin (any loaded layer sets it). Calling it again replaces the terrain.
- **Sources.** A `TerrainTileSource` is a `TileSource` plus `encoding: 'terrarium' | 'mapbox'`. The only preset is `awsTerrarium` (zooms 0 to 15). A Mapbox source needs your token in the URL (README has a recipe).
- **Attribution** is shown while terrain tiles are active. The provider asks for "Mapzen" plus a statement per data source used in your area; the preset shows "Mapzen" with a link to the list, and callers add the area's statements. Mapbox also requires its logo, which the library does not draw. Following provider terms is the caller's job.
- **Provider.** The AWS S3 endpoints are meant for EC2 networking, are not cached by CloudFront and state no rate limits: use your own CDN beyond development.
- **Coordinates.** Only metre-based systems (EPSG:3395, 3857); EPSG:4326 is rejected. `verticalScale` (default 1) multiplies heights; DEM heights are ground metres while the plane is stretched by about `1/cos(latitude)`. Vertical datums are not reconciled.
- **Float32.** Vertices are relative to the map origin. Projection error stays under 0.2 px out to 1,000 km from the origin even for a camera 300 m up (0.5 px at 3,000 km, 2.4 px at 10,000 km). Stay within about 1,000 km; re-centring the origin is not supported. This is a numeric check, not a browser test.

## Memory and performance

At the defaults the height side holds at most about 50 MB: decoded tiles 33.5 MB (128 tiles), CPU windows 6.3 MB, the GPU texture 6.3 MB and in-flight decodes 4.2 MB (`stats.memory`; tile demand is bounded by `maxTilesPerWindow`, and tiles in use are never evicted). The imagery overlay dominates: at 4096² with 4× MSAA it is roughly 740 MB, inherited from terrain mode.

Browser measurements (Chrome 156, macOS, 1568×1024 at devicePixelRatio 1.6, six levels, 512² windows; compose time in ms):

| Case | Compose p50 / p95 / max | Notes |
|---|---|---|
| Cold start, before the budget | 75 / 143 / 143 | 5 to 6 windows per frame |
| Cold start, with the budget | 27 / 32 / 36 | one window per frame |
| Panning, with the budget (1,070 frames) | 5.1 / 13.3 / 23.9 | two windows per frame; frame CPU averages 4.9 |

A window costs about 2.5 ms with all tiles ready and about 27 ms with partial data. The p95 tail while panning is probably windows composed while tiles arrive. Upload submission stays under 1 ms at p95. Not measured: other hardware, GPU time, decoding and quadtree selection (inside the frame time). The `terrain-tiles` example shows these timings with Reset and Copy buttons.

## Possible next steps

Only if measurements on other hardware call for them:

- **Dirty-region invalidation:** recompose only the samples a tile arrival affects (today a level with fallback samples recomposes entirely).
- **Strip refill:** on a move of `dx, dy` samples, reuse the overlap and compose only the exposed strips (a one-sample move exposes 512 of 262,144 samples).
- **A worker** for decoding and composition, or adaptive levels by camera height.

## Tests

- **Unit tests (no GPU):** decoding, sampling and composition against a synthetic DEM, window snapping and tile bounds, the CPU lookup and blend, streaming-source invalidation and the compose budget, quadtree coverage under the budget, seam assignment and morph (including a six-level gap), and map-level behavior with stubbed `fetch`.
- **Optional GPU test:** `autk-map/test/terrain-shader-gpu.test.ts` runs the real shader code on a GPU through Dawn (Chrome's engine, with the Tint compiler) and compares height and normal with the CPU twins, including seam vertices. It skips unless the `webgpu` npm package (131 MB installed, a native binary) is installed: `npm install --no-save webgpu`, then `npx vitest run test/terrain-shader-gpu.test.ts`. Whether that justifies a CI dependency is open.
- **Browser:** terrain, buildings and picking on GeoTIFF terrain; streamed terrain with imagery, level blending and seams (none visible).

## Prior art

Geometry clipmaps (Losasso and Hoppe, 2004) for the nested windows and level blending; Cesium's terrain providers and deck.gl's `TerrainLayer` for tile services and the Terrarium and Mapbox encodings. Ideas only; no code is taken.
