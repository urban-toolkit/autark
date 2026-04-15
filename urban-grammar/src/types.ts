
import { DataAdapter, PlotAdapter, MapAdapter, ComputeAdapter } from "./adapters";
import { FeatureCollection } from 'geojson';
import { DataSourceType, LayerType, ColorMapInterpolator, PlotMark, PlotEvent, AggregateFunction, NormalizationMode } from "./constants";

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

export type JoinSourceSpec = Omit<TableSourceSpec, 'outputTableName'> & { 
    tableRootName: string;
    tableJoinName: string;
    output: {
        type: 'MODIFY_ROOT' | 'CREATE_NEW';
        tableName?: string; // Required if type is 'CREATE_NEW'
    };
    spatialPredicate?: 'INTERSECT' | 'NEAR';
    joinType?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    nearDistance?: number;
    groupBy?: {
        selectColumns: Array<{
        tableName: string;
        column: string;
        aggregateFn?: AggregateFunction;
        aggregateFnResultColumnName?: string; // Optional custom name for the aggregation result
        }>;
    };
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

export type DataSourceSpec = OsmDataSourceSpec | CsvDataSourceSpec | JsonDataSourceSpec | CustomDataSourceSpec | HeatmapSourceSpec | JoinSourceSpec;

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
    * @property {string} getFnv Field path to extract thematic values from. Supports dot notation for nested properties (e.g. "tags.highway" resolves to feature.properties.tags.highway).
    * @property {'categorical' | 'quantitative'} getFnvType How to interpret the extracted value. 'categorical' coerces to string (for discrete color palettes); 'quantitative' coerces to number (for continuous/diverging scales). When omitted the raw value is used as-is.
    * @property {string[]} colorMapDomain Explicit set of allowed category values. Values not in this list are collapsed to 'other'. Only meaningful when getFnvType is 'categorical'.
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
        normalization?: { mode: NormalizationMode; lowerPercentile?: number; upperPercentile?: number },
        isSkip?: boolean,
        isPick?: boolean,
        getFnv?: string,
        getFnvType?: 'categorical' | 'quantitative',
        colorMapDomain?: string[],
        defaultFnv?: string | number
    }[]
}

export type PlotSpec = {
    dataRef: string,
    mark: PlotMark,
    axis: string[],
    title?: string,
    events?: PlotEvent[],
    width?: number,
    height?: number,
    margins?: { left: number; right: number; top: number; bottom: number },
    mapRef?: string,
}

export type ComputeSpec = {
    dataRef: string,
    attributes: Record<string, string>,
    attributeArrays?: Record<string, number>,
    attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>,
    uniforms?: Record<string, number>,
    uniformArrays?: Record<string, number[]>,
    uniformMatrices?: Record<string, { data: number[][]; cols: number }>,
    outputColumnName?: string,
    outputColumns?: string[],
    wglsFunction: string
}

export type UrbanSpec = {
    data?: DataSourceSpec[],
    compute?: ComputeSpec[],
    map?: MapSpec[] | MapSpec,
    plot?: PlotSpec[] | PlotSpec
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
