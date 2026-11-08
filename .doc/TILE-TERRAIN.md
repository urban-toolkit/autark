# Streaming terrain tiles for `autk-map`

Terrain mode can take its elevation from a web tile service (Terrarium or Mapbox terrain-RGB PNG tiles) that streams in as the camera moves, and image tiles drape over it. This document describes what is built, why, and what is not done. Read it with [TILE-BASEMAP.md](TILE-BASEMAP.md), which describes the tile layer this builds on, and [TILE-TERRAIN-CRITIQUE-TEMP.md](TILE-TERRAIN-CRITIQUE-TEMP.md), the open review items.

## Status

| Part | State |
|---|---|
| Imagery on terrain | Done, checked in a browser (TILE-BASEMAP.md, Remaining work A) |
| Height-source seam and shared shader lookup | Done, unit tested, checked in a browser on GeoTIFF and streamed terrain |
| DEM decode, sampling, window composition | Done, unit tested (CPU only) |
| Streaming source, API, gallery example | Done, unit tested, checked in a browser (`terrain-tiles`) |
| Level blending and patch selection under a budget | Implemented and unit tested; blending seen working in a browser |
| Mesh seams | Done for any level gap, heights and normals (world-coordinate morph); unit tested including six-level gaps under the instance budget; heights and normals also checked against the CPU twins on a GPU (Dawn, Node), small gaps seen working in a browser |
| Resource bounds, continuity, composition speed-ups | Done, unit tested; composition timed in Node only |
| Nodata invalidation after coarse arrivals | Fixed: a level follows coarser arrivals while any of its samples depends on fallback; regression test added |
| Float32 precision, memory accounting, imagery sharpness, attribution | Measured or finalized (see Decisions and limits, Memory); not yet checked in a browser |
| Browser frame-time measurement, incremental or worker composition | Not done |

Nothing here is committed yet.

## Goal and scope

Keep the existing terrain renderer: its quadtree of 32×32-cell patches, its LOD, its overlay-texture draping, and the GeoTIFF path. Do not copy deck.gl's one-mesh-per-tile design.

Out of scope: vector tiles, quantized-mesh or Cesium terrain, a globe, providers that need request signing, and offline use.

## Design

### A height clipmap

A small stack of fixed-size height windows around the view, each covering twice the extent of the one before at half the detail, fed by the DEM tiles those windows need. It is a geometry clipmap whose data comes from a tile pyramid, and it fits this renderer because every consumer already samples one texture by world position.

- **Levels.** Up to 8 (default 6) windows of `N×N` samples (default 512, even, at most 2048). Level `k` reads tile zoom `finest − k`. The finest zoom is `min(source.maxZoom, 14) + zoomBias`, and fewer levels are used when the source has too few zooms.
- **Storage.** One `texture_2d_array<r32float>`, one layer per level. Six 512² levels are 6 MB.
- **Placement.** A sample is one DEM pixel of its level's zoom, with spacing taken from the pixel size at the map origin. A window's origin snaps to a whole sample of its own level, so a moving view shifts it by whole samples and heights do not swim. The outermost window is the terrain.
- **Scale at zoom 14** (about 9.5 m per sample): level 0 covers about 4.9 km and level 5 about 156 km, in map units. Map units on EPSG:3395 are stretched by about `1/cos(latitude)` against ground metres: at 40° N a ground metre is 23.4 % smaller than a map unit under a spherical approximation.
- **Detail depends on the provider.** The Terrain Tiles documentation lists the source data by region: 30 m for SRTM and EU-DEM, 10 m for US 3DEP outside Alaska (3 m in places), 8 m in New Zealand, about 2 m in the UK, 5 m for ArcticDEM, and 250 m to 2.5 km for global fallbacks. Its ground-resolution table runs through zoom 15 (about 9.6 m per pixel at zoom 14 and 4.8 m at zoom 15 at the equator). Where the data is 30 m, zooms above about 12 add smoothness, not detail; `zoomBias` lowers the cost there.

### Why composition is on the CPU

Each tile is decoded to a `Float32Array`, each window is composed on the CPU and uploaded with `writeTexture`.

- **Reprojection is a row table.** The map plane is EPSG:3395 (or 3857) minus the origin and tiles are EPSG:3857, so x agrees and y differs by row. Longitude is computed per column and latitude per row, not per sample. This is exact and testable without a GPU.
- **CPU facts come for free:** per-window min and max for culling, `heightAt` for camera fit and queries, and picking of the height that was drawn.
- **No GPU decode path.** It avoids rendering into `r32float` and the colour-space and premultiplied-alpha hazards of decoding in a shader.

### Decoding

| Encoding | Height in metres |
|---|---|
| `terrarium` | `R·256 + G + B/256 − 32768` |
| `mapbox` | `−10000 + (R·65536 + G·256 + B) · 0.1` |

Tiles are read with `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`, drawn to an `OffscreenCanvas` and read with `getImageData`; otherwise the browser may convert colour or premultiply and corrupt heights. Fully transparent pixels become `NaN` (no data). A tile of the wrong size is a permanent failure. A decoded tile is a `DemTile { size, heights, min, max }`, 256 KB at 256².

### Sampling and continuity

`DemSampler` samples bilinearly in global pixel coordinates at a zoom, reading across tile edges (tiles need no apron) and wrapping the world in x. A pixel that is missing, because its tile has not loaded or it has no data, takes the next coarser zoom's height **at its own centre**. The four pixels of a bilinear read are therefore one fixed field and the surface cannot jump where fine data ends; a sample whose four pixels are all missing reads the coarser zoom directly. Where no coarser data exists, the nearest present pixel stands in, and if the nearest pixel is itself missing the sample has no value (drawn at 0, counted as missing).

`composeWindow` fills a window. It first checks which zooms have any ready tile under the window and skips the rest (an empty window is filled without sampling), then takes a direct bilinear path for samples whose four pixels lie in one ready tile of the window's own zoom, and falls back to the sampler for tile edges, missing tiles and nodata. It applies `verticalScale` and reports min, max and the `missing` count.

### Request flow

1. Each frame the terrain path calls `update(centre)` with the ground point under the view centre, and each window re-snaps.
2. A window's tiles are the padded tile range of its bounds. `maxTilesPerWindow(size, tileSize)` bounds this (16 at 512 samples and 256-pixel tiles; the measured worst case is 12).
3. Tiles are requested through a `TileStore<DemTile>` coarsest level first, then toward the window middle. The coarse level supplies the fallback for the finer ones, so a complete low-detail surface exists after one round trip.
4. A level recomposes only when its snapped position moves, or when its signature changes. The signature is the ready flags of its own tiles, followed by the coarser levels' signature while the level is incomplete. A level is complete when every own tile is ready and its last composition left no sample depending on fallback (`ComposedWindow.fallback`): a loaded tile with nodata still wants coarser data, so such a level keeps following coarser arrivals. Once complete, coarser arrivals are ignored.
5. A tile arrival asks the map for a frame. The renderer uploads only the levels that changed and rewrites the level table.
6. Removal (`disableTerrainMode`, or replacing the source) cancels loading.

### Height source and shaders

`HeightSource` has `levels` (each with its own data and placement), `bounds`, `minHeight`, `maxHeight`, `version` and per-level `levelVersions`. `StaticHeightSource` wraps a `Heightfield` as one level, so the GeoTIFF path is unchanged. `StreamingHeightSource` adds `update` and `destroy`; `TileHeightSource` implements it. `packHeightUniform` writes the level table (binding 4, 272 bytes) and `heightAt` is the CPU twin of the shader lookup.

One WGSL chunk, `shaders/height-lookup.wgsl`, is included by `terrain.vert`, `buildings-01.vert` and `picking-3d-terrain.vert` through `vite-plugin-glsl`'s `#include`, so terrain, buildings, picking and normals agree by construction. The lookup takes the finest level with a non-zero weight and mixes it with the next coarser one. The weight is 0 on the window edge and rises by smoothstep to 1 across the outer 1/8 of the window (`HEIGHT_BLEND_BAND`), so levels meet without a step. A level's edge lies well inside the next level's full-weight region because windows nest at half the extent. Inherited quirk, kept so terrain looks the same: the sample position clamps to `size − 2`, so the last row and column of a window are never read.

### Quadtree

- **Dynamic bounds.** `bounds` follows the outermost window. With several levels the roots sit on a fixed world grid, so patches keep their place as windows shift. `MAX_LOD_LEVEL` is 10 (finest patch cell about 8 m at the default outer window). A one-level source behaves as before.
- **Split rule.** A block splits when the camera wants finer patches and its vertex spacing is still coarser than the finest data anywhere under it (`finestCellOver`), not only at its centre.
- **Budget.** `traverseQuadtree` splits a block only if the leaves chosen, the blocks waiting and three more fit `MAX_INSTANCES` (4096). Under a tight budget the coarser block stays, so the visible area remains covered.
- **Seams.** `assignSeams` records, per patch edge, how many levels coarser the neighbour is, for any size difference. `seamHeight` in `terrain.vert.wgsl` moves that edge's vertices onto the neighbour's vertex grid: the neighbour's vertices sit at whole multiples of its spacing (`cell × 2^levels`) in world coordinates, because every block is aligned to its own size, so the vertex takes the interpolated height of the two edge points found from its world position alone. This holds for any gap; when the neighbour is more than 32 cells coarser (six levels or more, which the instance budget can produce) the two points lie outside the patch. `morphEdge` is the CPU twin. The normal is morphed the same way: an edge vertex takes the interpolation of the two neighbour vertices' normals, each computed at the neighbour's spacing, which is exactly what the neighbour's own patch interpolates along that edge, so both sides shade the shared edge identically (`patchVertex` returns height and normal together). Only normals at morphed edge vertices change; interior vertices are untouched.
- **Height range for culling** is the min and max over all windows, widened to include 0 while any sample is missing, so culling never rejects visible terrain.

### Imagery on terrain

Non-3D layers render into one offscreen overlay texture (≤ 4096²) with an orthographic camera over the visible bounds, and that texture is draped over the mesh; tile layers use this path. The overlay rectangle comes from the GPU visible-bounds pass over the terrain mesh, so it follows a moving, streaming terrain. Elevation and imagery share `TileSource`, URL building, projection, tile ranges, `TileStore` and the attribution mechanism, but not a texture, a pipeline or a layer class.

Sharpness. The overlay's texel is the visible extent divided by 4096, so a tilted view spreads it thinner than a top-down one. Computed with the real `Camera` for the fallback extent (rays capped at 8 × altitude, which the GPU visible-bounds pass only tightens), at 1600×1000:

| Tilt from nadir | Extent | Overlay texel | Screen pixel at the bottom edge | Texel ÷ pixel |
|---|---|---|---|---|
| 0° | 1.3 km at 1 km altitude | 0.32 m | 0.83 m | 0.4 |
| 45° | 3.2 km | 0.78 m | 0.83 m | 0.9 |
| 60° | 8.4 km | 2.0 m | 1.1 m | 1.8 |
| 70° | 8.4 km | 2.0 m | 1.6 m | 1.3 |

Everything scales with altitude, so the ratios hold at 5 km and 20 km altitude. In the worst case an overlay texel covers about 1.8 screen pixels on the very bottom row; it is finer than a pixel at 45° or less, and above that row the screen pixel grows faster than the texel (at 60° the centre pixel is 3.3 m). Imagery is therefore at most slightly soft at the nearest edge. Accepted; a finer overlay near the camera, or imagery per clipmap level, would only matter if that edge looks soft in practice, and the source imagery's own zoom limit usually matters more. The GPU cost of the overlay is a separate matter (see Memory).

## Public API

```ts
map.enableTerrainTiles({
    source: TERRAIN_TILE_SOURCES.awsTerrarium,  // a TileSource plus { encoding }
    crs: 'EPSG:3395',                           // 'EPSG:3395' or 'EPSG:3857'; default 'EPSG:3395'
    levels: 6,                                  // optional, 1 to 8
    windowSize: 512,                            // optional, even, at most 2048
    zoomBias: 0,                                // optional
    maxCachedTiles: 128,                        // optional; raised to what the windows can need at once
    verticalScale: 1,                           // optional: multiplies every height
});
map.disableTerrainMode();                       // unchanged
map.getTerrainTileStats();                      // read-only; null when terrain tiles are not active
```

- `enableTerrainTiles` needs the map origin, like `enableTerrainMode` and `loadTiles`. Calling it again replaces the terrain, which is how the example changes `verticalScale`; the value is fixed per source.
- A `TerrainTileSource` is a `TileSource` with `encoding: 'terrarium' | 'mapbox'`. The only preset is `awsTerrarium` (public Terrain Tiles on AWS, zooms 0 to 15; zoom 15 is served and zoom 16 returns 404). A Mapbox source needs the user's token in the URL. A source-shape sketch exists in the API comments, but a complete recipe is still pending.
- **Attribution** is shown while terrain tiles are active. The [provider's attribution page](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) asks for "Mapzen" plus a statement for each data source used where you are (for example "3DEP data courtesy of the U.S. Geological Survey", "© Kartverket", the EU-DEM and Copernicus credit). The preset shows "Mapzen" and a link to that list; it cannot know your area, so callers add the statements that apply, by extending the preset's attribution list (see the README). Mapbox's [attribution guide](https://docs.mapbox.com/help/dive-deeper/attribution/) asks for links to Mapbox, OpenStreetMap and "Improve this map" and for the Mapbox logo; the README recipe carries the three links, the logo is the caller's to draw, and the guide does not name terrain-RGB, so confirm with Mapbox. Following each provider's terms is the caller's responsibility.
- `getTerrainTileStats()` reports levels, zoom per level, window size, wanted and ready tiles, `tileBound`, `cacheLimit`, `memory` (byte bounds, see Memory), missing samples per level, `idle`, and the tile store's request, queue and cache counters.
- EPSG:4326 is rejected: heights and `verticalScale` assume a horizontal plane in metres.

## Defaults and bounds

| Setting | Value |
|---|---|
| Levels | 6 |
| Window | 512×512 samples (at most 2048) |
| Height texture | `r32float` array, 6 MB at the defaults |
| Cached DEM tiles | 128, raised to `levels × maxTilesPerWindow` |
| Decoded elevation memory | at most `cacheLimit × tileSize² × 4` bytes, because tiles in use are never evicted (see Memory) |
| Concurrent requests | 8 (loader default) |
| Level blend band | 1/8 of the window |
| Patch budget | 4096 instances, `MAX_LOD_LEVEL` 10 |

## Memory

`TerrainTileStats.memory` reports upper bounds in bytes that follow from the configuration alone, so they hold however tiles arrive:

| Part | Bound | Default (6 levels, 512², 256-pixel tiles) |
|---|---|---|
| Decoded tiles | `cacheLimit × tileSize² × 4` | 128 tiles (the default; raised to `levels × 16` only when that is more), 33.5 MB |
| CPU windows | `levels × windowSize² × 4` | 6.3 MB |
| GPU height texture | the same as the CPU windows | 6.3 MB |
| In-flight decodes | 8 concurrent × `tileSize² × 4 × 2` (bitmap and floats) | 4.2 MB |
| Total | | about 50 MB |

At the most the configuration allows (8 levels, 2048²) the CPU windows and the GPU texture are 134 MB each. The height side is small next to the imagery overlay, which the map owns and which exists with or without terrain tiles: at 4096², it holds a color texture, a multisampled color texture, a multisampled depth texture, a picking texture and a picking depth texture, about 44 bytes per pixel with 4× MSAA, roughly 740 MB of GPU memory as an upper estimate (drivers may use less). That cost is inherited from terrain mode, not added by streaming; lowering `TERRAIN_OVERLAY_TEXTURE_SIZE` is the lever, and a quarter of the area costs a quarter of the memory. The bounds are not enforced against each other: the caller picks `levels` and `windowSize`.

## Decisions and limits

- **Vertical units.** `verticalScale` defaults to 1. Horizontal units are map units (stretched by `1/cos(latitude)`), DEM heights are ground metres, and GeoTIFF terrain and 3D buildings already use unscaled heights, so 1 keeps them consistent. It is applied once, when a tile is composed, so shaders, culling, `heightAt` and picking all see scaled heights. It does not apply to the GeoTIFF path.
- **Vertical datum.** Tiles are used as given. Scaling does not reconcile elevation offsets between datasets or buildings (see [Mapbox's note on vertical datums](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/#elevation-data)).
- **Float32 positions.** Windows and patch vertices are in local space, relative to the map origin, and the view-projection matrix is Float32 as the shader multiplies it. Measured by projecting terrain vertices with the camera's Float32 matrices against a Float64 reference (400 random vertices in front of the camera, 1600×1000, worst error in screen pixels):

  | Distance from the map origin | Camera 300 m up | Camera 3 km up |
  |---|---|---|
  | 10 km | 0.002 px | 0 px |
  | 100 km | 0.02 px | 0.002 px |
  | 1,000 km | 0.2 px | 0.02 px |
  | 3,000 km | 0.5 px | 0.05 px |
  | 10,000 km | 2.4 px | 0.26 px |

  The outer window being 156 km wide does not matter on its own: the error follows the distance from the origin, not the distance from the camera, and it stays below a quarter of a pixel out to 1,000 km even for a low camera. The height lookup converts positions to texels in Float32 too: at 1,000 km the position error is about 0.06 m, under a hundredth of the finest texel (about 10 m), so heights are unaffected. Seam edges stay closed because both sides compute the shared point from the same world position. Practical limit: stay within about 1,000 km of the map origin; a map that pans across a continent should re-centre its origin (not supported today). This is a numeric check of the matrix path, not a browser rendering test.
- **Provider limits.** Public tile servers have usage terms. The [provider's service documentation](https://github.com/tilezen/joerd/blob/master/docs/use-service.md#additional-amazon-s3-endpoints) says the S3 endpoints are meant for efficient networking with EC2 and are not cached by CloudFront, and it states no rate limits (it is silent on CORS and browser use, though the preset works from a browser). For anything beyond development, put your own CDN in front. The earlier "light use" wording was not in the provider's pages and has been removed.
- **`r32float` filtering.** The lookup uses `textureLoad` and blends by hand, so no float-filtering feature is needed.

## Performance

Timings are Node, one 512×512 EPSG:3395 window at zoom 14 with constant tiles, on a developer laptop. They exclude network, decoding, GPU upload and the quadtree. They show cost relative to the earlier path, not a target for any browser.

| Ready data | Before optimizing | Now |
|---|---:|---:|
| All tiles ready | 51 ms | 2.2 ms |
| Only zoom 9 ready | 75 ms | 22 ms |
| Zoom 9 plus one fine tile | not measured | 44 ms |
| Zoom 9 to 13 plus half the fine tiles | not measured | 23 ms |
| No tiles | 128 ms | under 1 ms |

What produced this: numeric tile keys instead of string keys per pixel read, a direct in-tile bilinear path, skipping zooms with no ready tile, and not recomposing complete levels on coarser arrivals. The main-thread budget for terrain streaming work is provisionally 4 ms per frame (60 Hz leaves about 16.7 ms for everything), a scheduling target, not a measured capability.

### Measurement still to do

Instrumentation exists; the measurements themselves are still to be taken. `getTerrainTileStats().timing` reports p50, p95, p99 and max over the last 2,000 frames for the whole `update` call (every frame), for composition (frames that composed), for upload submission (frames that uploaded) and for windows composed per composing frame; `resetTerrainTileTiming()` clears them between scenarios. The `terrain-tiles` example shows them beside the map's own per-frame CPU time, with Reset and Copy buttons (Copy puts the statistics, view, canvas size and user agent on the clipboard as JSON). Not instrumented: decoding (it runs on the browser's image decoder), the quadtree selection (inside the frame CPU time) and GPU time.

Procedure: pick a place, press Reset timings once the first load settles for the warm cases (or reload for the cold case), perform one scenario (startup, a burst of arrivals right after a teleport, slow panning, fast panning, zoom in and out), then Copy timings. Record the machine and browser with it.

Record planning, decoding, composition and upload submission separately, plus frame time, recomposed samples, uploaded bytes and time to first coarse coverage. Report p50, p95 and p99 on named browser and hardware configurations, cold and warm, for empty startup, coarse-only fallback, full data, tile-arrival bursts, one-sample scrolling, rapid pans and teleports. CPU time around `writeTexture` measures submission, not completed GPU work.

### Remaining optimizations, in order

Do these only as the measurements justify them. Height continuity, seams, conservative culling and agreement between terrain, buildings, picking and CPU queries stay correctness requirements.

1. **Invalidate only affected regions.** Replace the concatenated ready-flag strings with tile identities and revisions, spatial overlap and fallback dependencies, tracking dirty rectangles including the bilinear border. A coarse tile arriving outside a fine window, or under samples that already have full support, should not recompose it. Today an incomplete level, or one with any fallback sample, recomposes entirely on any coarser arrival.
2. **Reuse work in the sampling loop.** Reusable output buffers and per-axis tables, and spans that share a tile neighbourhood, keeping a general path for edges, nodata and fallback. Buffers published to the CPU height source must not be mutated or transferred while in use.
3. **Refill exposed strips and upload changed regions.** For an unchanged data snapshot and a move of `dx`, `dy` samples below `N`, only `N² − (N − |dx|)(N − |dy|)` samples are new: a one-sample move of a 512² window exposes 512 samples instead of 262,144. Reuse the overlap in CPU buffers first; toroidal storage with a per-level offset avoids moving it on either side but every CPU and GPU consumer must understand the offset. Use region uploads with [`GPUQueue.writeTexture`](https://www.w3.org/TR/webgpu/#dom-gpuqueue-writetexture). Maintain per-block min and max so removing an old extremum stays correct. Teleports need full refills. See [geometry clipmaps](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry).
4. **Schedule within a budget; move sustained work to a worker.** Prioritize coarse coverage for newly exposed areas, then visible fine detail; coalesce and discard superseded jobs. If that is still not enough, a worker owns decoding, the DEM cache and composition, with explicit buffer ownership (transferring an `ArrayBuffer` detaches it from the sender) and results tagged with source, placement and data generations. Publish samples, origin, range, CPU lookup state and GPU updates together; while work is pending keep old coverage at its original coordinates and use coarse coverage elsewhere.
5. **Adapt detail and budget jointly.** Use projected sample spacing and camera height to decide which fine levels need requests, with hysteresis; exclude inactive levels from CPU and GPU lookup. Budgets are accounted today (see Memory) but not enforced against each other; if a worker is added, include its buffers, and measure imagery and elevation together, since both use network, CPU and GPU.

Later, if profiling points at them: per-block height bounds for tighter culling, reusing quadtree selection while camera and source are unchanged, cached gradients or normal textures, GPU composition, and an imagery clipmap.

## Tests

Unit tests, all without a GPU:

- **Decoders:** known RGB triples to heights for both encodings, nodata, the size check.
- **Sampling and composition:** a synthetic DEM that is linear in spherical Mercator position, so bilinear sampling is exact, reproduced at every sample in EPSG:3857, 3395 and 4326, across tile boundaries and with ancestor fallback; partial and ancestor-only data; nodata; continuity across a fine tile's edge with different fine and coarse surfaces.
- **Windows and bounds:** snapping, padded tile ranges, `maxTilesPerWindow` against many sizes, zooms, systems and positions.
- **Height source:** uniform packing, the CPU lookup including blend weights and a curved-surface sweep with no step, and that all three vertex shaders include the shared chunk.
- **Streaming source:** priority, no work on idle frames, only moved levels recompose, complete levels ignore coarse arrivals, a complete-looking level with nodata follows coarser arrivals (arrival-order regression), cache and bounds, rejected configurations.
- **Quadtree:** traversal under the tested budgets keeps the whole area covered; footprint-based finest cell; seam assignment and the CPU twin of the edge morph, including a six-level gap under the real 4096-leaf budget checked on every edge of every patch against a linear field.
- **Map level:** terrain tiles with stubbed `fetch` and a mocked terrain path (frame requests, attribution, cleanup).

The shaders are covered outside the unit suite. They were compiled offline with wgpu-native with `#include` expanded, and exercised in a browser. In addition, `autk-map/test/terrain-shader-gpu.test.ts` runs the real `patchVertex` and height lookup on a GPU through Dawn (the engine under Chrome, with the Tint compiler; run from Node, on Metal when written). It compares height and normal with the CPU twins away from seams and at seam vertices for gaps of 1, 2, 3 and 6 levels, and checks that a fine patch's edge matches the coarse patch's edge, heights and normals, at every vertex. It fails if the seam normal is put back to the unmorphed one. It is optional: it needs the `webgpu` npm package (a native binary of about 20 MB per platform, 131 MB installed), which is not a project dependency, so the tests skip when the package or a GPU adapter is missing. Run it with `npm install --no-save webgpu` and `npx vitest run test/terrain-shader-gpu.test.ts`. Whether GPU tests are worth that dependency in CI is a team decision. A `*.webgpu.html` page is the alternative that adds no dependency.

The 2026-11-08 review reproduced two errors on the CPU (stale nodata after coarse arrivals, and seam morphing at gaps above five levels); both are fixed and covered by regression tests. The seam-normal change was checked in a browser afterwards (no seams visible); other browser checks were not repeated after these fixes.

## Prior art

Geometry clipmaps (Losasso and Hoppe, 2004) for the nested windows and level blending; Cesium's terrain providers and deck.gl's `TerrainLayer` for the tile services and the Terrarium and Mapbox encodings. Ideas only; no code is taken from them.
