/**
 * @module MeshTypes
 * Shared mesh buffer types for triangulator output and mesh renderers.
 *
 * These interfaces define the buffer layout and per-feature metadata emitted by
 * `autk-core` triangulators. Renderers consume them to upload vertex data,
 * index buffers, normals, texture coordinates, and feature-level counts for
 * fill, outline, and border passes.
 */

/**
 * Triangulated vertex buffers for one renderable geometry piece.
 *
 * The buffers are emitted in the same vertex order expected by renderers.
 * Optional arrays are present only when the triangulation pipeline produces
 * them for the target material or pass.
 */
export interface LayerGeometry {
    /** Flat vertex position buffer packed sequentially per vertex. */
    position: Float32Array;
    /** Optional vertex normal buffer aligned with `position`. */
    normal?: Float32Array;
    /** Optional triangle index buffer referencing vertices in `position`. */
    indices?: Uint32Array;
    /** Optional texture-coordinate buffer aligned with `position`. */
    texCoord?: Float32Array;
    /** Optional source feature index associated with this geometry chunk. */
    featureIndex?: number;
}

/**
 * Per-feature counts for a triangulated mesh component.
 *
 * The counts let renderers relate emitted geometry back to the source feature
 * and determine how many vertices and triangles belong to each component.
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
 * Border or outline buffers for line-based rendering.
 *
 * This structure carries the vertex positions and line indices for a border
 * pass separate from the filled mesh geometry.
 */
export interface LayerBorder {
    /** Flat vertex position buffer for the outline geometry. */
    position: Float32Array;
    /** Line index buffer referencing vertices in `position`. */
    indices: Uint32Array;
}

/**
 * Per-feature counts for a border or outline component.
 *
 * These counts describe the line-oriented geometry emitted for a source
 * feature.
 */
export interface LayerBorderComponent {
    /** Number of vertices contributed by the border component. */
    nPoints: number;
    /** Number of lines contributed by the border component. */
    nLines: number;
}
