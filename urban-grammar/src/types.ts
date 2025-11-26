
import { DataAdapter, PlotAdapter, MapAdapter, ComputeAdapter } from "./adapters";
import { FeatureCollection } from 'geojson';
import { DataSourceType, LayerType, ColorMapInterpolator, PlotMark, PlotEvent, AggregateFunction } from "./constants";

// export type Column = {
//   name: string,
//   type: string
// }

// export type Table = {
//     name: string,
//     columns: Column[],
//     source: DataSourceType | 'user' | 'geojson',
//     type: 'pointset' | LayerType
// }

export type TableSourceSpec = {
    type: DataSourceType,
    outputTableName: string
}

export type HeatmapSourceSpec = TableSourceSpec & { 
    tableJoinName: string;
    nearDistance: number;
    groupBy?: {
        selectColumns: Array<{
            tableName: string;
            column: string;
            aggregateFn?: AggregateFunction;
            aggregateFnResultColumnName?: string;
        }>;
    };
    grid: {
        rows: number;
        columns: number;
    };
}

export type OsmDataSourceSpec = TableSourceSpec & {
    autoLoadLayers?: {
        coordinateFormat: string;
        dropOsmTable: boolean;
        layers: Array<LayerType>;
    };
    queryArea: {
        geocodeArea: string;
        areas: string[];
    };
}

export type CsvDataSourceSpec = TableSourceSpec & {
    csvFileUrl?: string;
    csvObject?: unknown[][];
    delimiter?: string;
    geometryColumns?: {
        latColumnName: string;
        longColumnName: string;
        coordinateFormat?: string;
    };
}

export type JsonDataSourceSpec = TableSourceSpec & {
    jsonFileUrl?: string;
    jsonObject?: unknown[];
    geometryColumns?: {
        latColumnName: string;
        longColumnName: string;
        coordinateFormat?: string;
    };
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export type CustomDataSourceSpec = TableSourceSpec & {
    geojsonFileUrl?: string;
    geojsonObject?: FeatureCollection;
    coordinateFormat?: string;
    boundingBox?: BoundingBox;
}

export type DataSourceSpec = OsmDataSourceSpec | CsvDataSourceSpec | JsonDataSourceSpec | CustomDataSourceSpec | HeatmapSourceSpec;

/**
 * Type for map.
 * @property {string} style Map style.
 * @property {...} layerRef Reference to layer in data specification.
    * @property {number} opacity Opacity of the layer.
    * @property {boolean} [isColorMap] Indicates if the layer is a color map.
    * @property {ColorMapInterpolator} colorMapInterpolator Interpolator for color mapping.
    * @property {number[]} [pickedComps] Components that are picked, if any.
    * @property {boolean} [isSkip] Indicates if the layer should be skipped in rendering.
    * @property {boolean} [isPick] Indicates if the layer is for picking
    * @property {string} getFnv Column to extract thematic numeric values from
 */
export type MapSpec = {
    style?: 'light' | 'dark',
    layerRefs: {
        dataRef: string,
        opacity?: number,
        isColorMap?: boolean,
        colorMapInterpolator?: ColorMapInterpolator,
        colorMapLabels?: string[],
        pickedComps?: number[],
        groupById?: boolean,
        isSkip?: boolean,
        isPick?: boolean,
        getFnv?: string
    }[]
}

export type PlotSpec = {
    dataRef: string,
    x: string,
    y: string,
    mark: PlotMark,
    event: PlotEvent
}

export type ComputeSpec = {
    dataRef: string,
    variableMapping: Record<string, string>,
    arrayVariables?: Record<string, number>,
    matrixVariables?: Record<string, { rows: number; cols: number }>,
    outputColumnName: string,
    wglsFunction: string
}

export type UrbanSpec = {
    data?: DataSourceSpec[],
    compute?: ComputeSpec[],
    map?: MapSpec,
    plot?: PlotSpec
}

export type EngineOptions = {
    spec: UrbanSpec,
    adapters: {
        db: DataAdapter,
        map: MapAdapter,
        plot: PlotAdapter,
        compute: ComputeAdapter
    }
}
