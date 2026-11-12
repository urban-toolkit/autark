# Tile basemaps for autk-map

Tile imagery is integrated with the current renderer and gallery. Supported map modes are flat, perspective views; terrain draping and globe rendering are outside this implementation.

## Usage

```ts
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

map.loadTiles('imagery', {
    source: TILE_SOURCES.esriWorldImagery,
    center: { latitude: 40.7831, longitude: -73.9712 },
    zoom: 12,
    crs: 'EPSG:3395',
    opacity: 1,
    maxCachedTiles: 256,
    maxTiles: 64,
    zoomBias: 0,
});
map.updateRenderInfo('imagery', { opacity: 0.6 });
map.updateRenderInfo('imagery', { isSkip: true });
map.getTileStats('imagery');
map.renderStats;
map.removeLayer('imagery');
```

Custom sources accept `{z}`, `{x}`, `{y}` or `{reverseY}`, and optional `{s}` subdomains. Attribution is required and may contain HTTP(S) links. Credits are built from DOM text/anchors and merged across visible tile layers. Source requests need CORS support; provider access and usage terms still apply.

Sources use the Web Mercator tile grid. The creation parameter `crs` selects EPSG:3395, EPSG:3857, or EPSG:4326. When omitted, it uses `DEFAULT_WORKSPACE_COORDINATE_FORMAT` from `autk-core`, the same constant re-exported and used by `autk-db` (EPSG:3395). This is the workspace/output CRS, not an imported file's source CRS. It must match the data's actual coordinates. The optional `center` is always geographic WGS84 latitude/longitude and is projected into that CRS. `zoom` sets the initial Web Mercator horizontal scale in CSS pixels (source tile size applies); fractional values are supported. Zoom defaults to 12 when a center is supplied. Existing scene origins are preserved; only an explicit center positions the camera. Unsupported CRS values and invalid numeric options are rejected before GPU allocation. Cache and tile limits must be positive safe integers; zoom bias must be finite; initial opacity must be finite and between zero and one. Loading errors are reported through the existing console-based API convention.

## Rendering and camera integration

The layer manager controls tile placement through CPU drawing order. Tile vertices have physical height zero and use main's raster shader and premultiplied blending. There is no z-index shader uniform, artificial layer height, per-layer depth bias, or call to the removed `Pipeline.updateZIndex` API. Buildings and terrain retain their physical-depth and compositing paths.

Projection is computed on the CPU. Tiles use additional mesh rows where needed to approximate projection curvature. Shared edges use the same coordinate arithmetic; geometry is stored relative to the shared origin before conversion to float32.

Selection reads the camera's ground-plane footprint. Tile resolution uses the renderer's backing-store dimensions, so DPR 2 can request a finer zoom than DPR 1 at the same CSS size. This does not change camera or pointer-coordinate semantics. The tile cap is applied separately and can deliberately lower resolution. Selection is inactive for an unconfigured orthographic terrain-overlay camera.

Main's opt-in fitting, raster-only bounds, and automatic far-plane expansion are retained. The camera ground helpers include a ray-basis correction checked against inverse rendering matrices, including nonunit and nonorthogonal up vectors. The new explicit geographic view can choose a smaller near plane for degree-based coordinates or extreme zoom; ordinary camera resets retain their previous near-plane default. Existing rendering/picking GPU regressions exercise the integrated camera.

## Loading, fallback, and ownership

- Up to eight requests run concurrently per tile layer.
- The default selection cap is 64 tiles. Ancestor preloads add requests; the cap is not a lifetime request count or cache limit.
- The default cache limit is 256 entries. It is soft: currently used tiles remain protected to avoid evicting a frame's own imagery.
- One ancestor level is preloaded. A missing child uses its nearest loaded ancestor with cropped UVs. A cold cache can still show blank areas until an image arrives.
- Requests that leave the view are cancelled. Timeouts and transient errors retry with backoff; permanent HTTP failures do not retry while their failure entry is retained.
- Hiding a layer cancels outstanding work and retains ready textures. Showing it reuses the cache. Removal/destruction cancels timers and requests and releases textures and buffers.
- Initialization is transactional. If pipeline setup fails, the new layer is removed and its partial resources are destroyed; retrying the same ID is permitted.
- A texture whose upload/bind-group creation throws is destroyed before propagating the failure.

Requests and arrivals schedule only the frames needed. Reading statistics does not schedule rendering. CPU frame statistics measure preparing/submitting a frame, not GPU execution.

## Gallery

`gallery/src/autk-map/tiles-basemap.html` uses the shared gallery layout, compact header/footer, statistics side panel, and map-anchored opacity control. It loads only a tile layer, using a geographic Manhattan center and initial zoom. Its source choices are Esri imagery, OpenStreetMap (Light), OpenStreetMap (Dark), OpenStreetMap, and local synthetic tiles, in that order. OpenStreetMap (Light) is selected initially in both tile examples. All OSM options use the same standard raster endpoint and preserve OSM attribution. The themes remap image luminance to muted palettes once per decoded tile; they do not remove baked-in labels or roads. No external style service, API key, or generated regional tile set is required. The public OSM tile usage policy still applies. CARTO is not included in the library presets or gallery. Overview and Tilt are the only view buttons. No neighborhood or other data collection is loaded.

`tiles-categorical.html` adds roads loaded through `autk-db`, using the same numeric category helper as `colormap-categorical-numeric`. The road legend keeps the category order 3, 1, 2. This combined example has no statistics panel or imagery-opacity control.

Run:

```sh
make dev APP=gallery OPEN=/src/autk-map/tiles-basemap.html
```

Exercise Overview → Tilt, source selection, visibility, and resize; standalone tiles also retain opacity and statistics. Cache reuse should rise on a return visit, requests should stop while hidden, and frame count should stop when idle. Live-provider failures should be distinguished from local rendering failures.

## Validation

CPU tests cover grid addressing, projection fixtures, mesh approximation and shared edges, zoom/cap selection, cache policy, request priority, retries/cancellation, fallback, attribution, and statistics. Integration regressions add DPR resolution, invalid options, partial GPU setup cleanup, rollback/retry, and preservation of existing layers.

`autk-map/test/tiles.webgpu.ts` uses real fetch/decode/texture upload and the production pipeline with synthetic PNGs. It checks all three CRSs, orientation and colors, ancestor UV cropping, alpha/opacity, drawing order without physical z-index, building composition, cache reuse, idle rendering, and removal. The real gallery smoke test exercises local loading, view controls, visibility, statistics, and opacity. Existing render-order, camera/terrain/building, RGB raster, and gallery status regressions are retained.

```sh
node autk-compute/test/run-webgpu.mjs /autk-map/test/tiles.webgpu.ts
node autk-compute/test/run-webgpu.mjs /gallery/test/tiles-basemap.webgpu.ts
node autk-compute/test/run-webgpu.mjs /autk-map/test/render-order.webgpu.ts
node autk-compute/test/run-webgpu.mjs /autk-map/test/raster-rgb.webgpu.ts
```

## Remaining limits

Terrain imagery draping, vector tiles, WMS/WMTS discovery, offline prefetching, arbitrary tile grids, and antimeridian wrapping are not implemented. Without an explicit center, a tile layer still needs a data-established origin; center and zoom allow standalone maps. Near-horizontal views have a finite selection reach. Source zoom limits and tile caps can soften imagery or truncate coverage.

Geometry is rebuilt/uploaded per rendered frame, and texture uploads have no per-frame budget. These are profiling targets rather than reasons to add speculative scheduler changes. Memory statistics count pixel storage only: 256 RGBA textures of 256×256 pixels are approximately 64 MiB, excluding driver overhead. Planet-scale views are not an acceptance target.

## Map credits

Autark and visible imagery providers share one translucent credit strip at the bottom left. “Made with Autark” links to https://www.autarkjs.org; linked credits have matching font, size, color, and decoration. Provider text and links are preserved, repeated credits are merged, and hiding imagery removes its provider credits while retaining Autark. Narrow maps wrap the strip; the bottom-right thematic legend moves above the strip when their horizontal space would overlap.
