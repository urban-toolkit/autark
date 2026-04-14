/** Vertex data for one triangulated geometry piece. */
export interface LayerGeometry {
    position: Float32Array;
    normal?: Float32Array;
    indices?: Uint32Array;
    texCoord?: Float32Array;
}

/** Per-feature triangle/point counts used for GPU picking. */
export interface LayerComponent {
    nPoints: number;
    nTriangles: number;
}

/** Border (outline) vertex data. */
export interface LayerBorder {
    position: Float32Array;
    indices: Uint32Array;
}

/** Per-feature line counts for border rendering. */
export interface LayerBorderComponent {
    nPoints: number;
    nLines: number;
}
