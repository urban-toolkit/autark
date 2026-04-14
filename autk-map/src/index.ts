// ─── Map entry point ─────────────────────────────────────────────────────────

export { AutkMap } from './map';

// ─── Color mapping (re-exported from autk-core) ──────────────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy } from './types-core';
/** Interpolator identifiers for d3-scale-chromatic color schemes. */
export { ColorMapInterpolator } from './types-core';
/** Colormap engine: domain resolution, label generation, color sampling. */
export { ColorMap } from './types-core';

export type {
    /** Resolved (computed) domain: `number[]` for numeric scales, `string[]` for categorical. */
    ResolvedDomain,
    /** Input specification describing how to build a domain (USER / MIN_MAX / PERCENTILE). */
    ColorMapDomainSpec,
    /** Full colormap configuration: interpolator + domain spec. */
    ColorMapConfig,
} from './types-core';

// ─── Color primitives (re-exported from autk-core) ───────────────────────────

export type { ColorHEX, ColorRGB, ColorTEX } from './types-core';

// ─── Camera (re-exported from autk-core) ─────────────────────────────────────

export { Camera } from './types-core';
export type { CameraData } from './types-core';

// ─── Geometry / mesh (re-exported from autk-core) ────────────────────────────

export type {
    LayerGeometry,
    LayerComponent,
    LayerBorder,
    LayerBorderComponent,
} from './types-core';

// ─── Triangulators (re-exported from autk-core) ──────────────────────────────

export {
    TriangulatorBuildings,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorRaster,
} from './types-core';

// ─── Shared types (re-exported from autk-core) ───────────────────────────────

export type {
    /** Geographic bounding box with named coordinate fields. */
    BoundingBox,
    /** Layer geometry kind identifier. */
    LayerType,
} from './types-core';

// ─── API / params ─────────────────────────────────────────────────────────────

export type {
    ThematicValueAccessor,
    LoadCollectionParams,
    UpdateRasterParams,
    UpdateThematicParams,
    UpdateColorMapParams,
} from './api';

// ─── Layer types ─────────────────────────────────────────────────────────────

export type {
    LayerInfo,
    LayerColormap,
    LayerRenderInfo,
    LayerData,
    LayerThematic,
} from './types-layers';

// ─── Map style ───────────────────────────────────────────────────────────────

export { MapStyle } from './map-style';
export type { MapStylePresetId, MapStyleShape } from './map-style';

// ─── Map UI ──────────────────────────────────────────────────────────────────

export { AutkMapUi } from './map-ui';

// ─── Events ──────────────────────────────────────────────────────────────────

export { MapEvent, MouseStatus } from './types-events';
export type { MapEventData, MapEventRecord } from './types-events';

export { KeyEvents } from './events-key';
export { MouseEvents } from './events-mouse';
export { ResizeEvents } from './events-resize';

// ─── Layers ──────────────────────────────────────────────────────────────────

export { Layer } from './layer';
export { VectorLayer } from './layer-vector';
export { Triangles2DLayer } from './layer-triangles2D';
export { Triangles3DLayer } from './layer-triangles3D';
export { RasterLayer } from './layer-raster';
export { LayerBbox } from './layer-bbox';
export { LayerManager } from './layer-manager';

// ─── Render pipelines ────────────────────────────────────────────────────────

export { Pipeline } from './pipeline';
export { PipelineTriangleBorder } from './pipeline-triangle-border';
export { PipelineTriangleFlat } from './pipeline-triangle-flat';
export { PipelineTrianglePicking } from './pipeline-triangle-picking';
export { PipelineTriangleRaster } from './pipeline-triangle-raster';
export { PipelineBuildingSSAO } from './pipeline-triangle-ssao';

// ─── Renderer ────────────────────────────────────────────────────────────────

export { Renderer } from './renderer';