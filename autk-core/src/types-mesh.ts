/**
 * @module MeshTypes
 * Shared mesh buffer types used by triangulators and rendering layers.
 *
 * These interfaces describe the geometry payloads emitted by `autk-core`
 * triangulators and consumed by map and compute rendering pipelines.
 */

/**
 * Vertex data for one triangulated geometry piece.
 */
export interface LayerGeometry {
    /** Flat vertex position buffer. Components are packed sequentially per vertex. */
    position: Float32Array;
    /** Optional flat vertex normal buffer aligned with `position`. */
    normal?: Float32Array;
    /** Optional triangle index buffer referencing vertices in `position`. */
    indices?: Uint32Array;
    /** Optional flat texture-coordinate buffer aligned with `position`. */
    texCoord?: Float32Array;
    /** Optional source feature index associated with this geometry chunk. */
    featureIndex?: number;
}

/**
 * Per-feature point and triangle counts for a triangulated layer component.
 */
export interface LayerComponent {
    /** Number of vertices contributed by the component. */
    nPoints: number;
    /** Number of triangles contributed by the component. */
    nTriangles: number;
    /** Index of the source feature represented by this component. */
    featureIndex: number;
    /** Optional stable feature identifier copied from the source data. */
    featureId?: string | number;
}

/**
 * Border or outline geometry buffers for line-based rendering.
 */
export interface LayerBorder {
    /** Flat vertex position buffer for the outline geometry. */
    position: Float32Array;
    /** Line index buffer referencing vertices in `position`. */
    indices: Uint32Array;
}

/**
 * Per-feature point and line counts for a border-rendering component.
 */
export interface LayerBorderComponent {
    /** Number of vertices contributed by the border component. */
    nPoints: number;
    /** Number of lines contributed by the border component. */
    nLines: number;
}
