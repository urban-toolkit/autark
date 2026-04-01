import { Feature, FeatureCollection, Geometry } from 'geojson';


import {
    ColorMapInterpolator,
    LayerType,
    NormalizationConfig,
} from './constants';

// Mesh types and camera params are defined in autk-core and re-exported here
// so that autk-map consumers don't need to import from autk-core directly.
export type {
    LayerGeometry,
    LayerComponent,
    LayerBorder,
    LayerBorderComponent,
    CameraData,
} from 'autk-core';

export interface LayerInfo {
    id: string;
    zIndex: number;
    typeLayer: LayerType;
}

export interface LayerRenderInfo {
    opacity: number;
    isColorMap?: boolean;
    colorMapInterpolator: ColorMapInterpolator;
    colorMapLabels: string[];
    pickedComps?: number[];
    isSkip?: boolean;
    isPick?: boolean;
}

export interface LayerData {
    geometry: import('autk-core').LayerGeometry[];
    components: import('autk-core').LayerComponent[];
    border?: import('autk-core').LayerBorder[];
    borderComponents?: import('autk-core').LayerBorderComponent[];
    raster?: RasterData[];
    thematic?: LayerThematic[];
    highlighted?: number[];
}

export interface LayerThematic {
    values: number[];
}

export interface RasterData {
    rasterResX: number;
    rasterResY: number;
    rasterValues: number[];
}

/** Parameters for loading a GeoJSON feature collection as a map layer. */
export interface LoadCollectionParams {
    id: string;
    collection: FeatureCollection;
    type?: LayerType | null;
}

/** Parameters for loading a raster (GeoTIFF-derived) collection as a map layer. */
export interface LoadRasterCollectionParams {
    id: string;
    collection: FeatureCollection<Geometry | null>;
    getFnv: (cell: unknown) => number;
}

/** Parameters for updating a raster layer's values in place. */
export interface UpdateRasterCollectionParams {
    id: string;
    collection: FeatureCollection;
    getFnv: (cell: unknown) => number;
}

/** Parameters for updating a layer's thematic (color-mapped) values. */
export interface UpdateThematicParams {
    id: string;
    collection: FeatureCollection;
    getFnv: (feature: Feature) => number | string;
    normalization?: NormalizationConfig;
}
