/** Vertex data for one triangulated geometry piece. */
export interface LayerGeometry {
    position: number[];
    normal?: number[];
    indices?: number[];
    texCoord?: number[];
}

/** Per-feature triangle/point counts used for GPU picking. */
export interface LayerComponent {
    nPoints: number;
    nTriangles: number;
}

/** Border (outline) vertex data. */
export interface LayerBorder {
    position: number[];
    indices: number[];
}

/** Per-feature line counts for border rendering. */
export interface LayerBorderComponent {
    nPoints: number;
    nLines: number;
}
