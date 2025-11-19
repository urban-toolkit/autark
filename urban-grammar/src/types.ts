
import { DbAdapter } from "./adapters";
import { MapAdapter } from "./adapters";

export type LayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings' | 'points' | 'polygons' | 'polylines' | 'raster';

export type DataSourceType = 'osm' | 'csv' | 'json';

export type Column = {
  name: string,
  type: string
}

export type Table = {
    name: string,
    columns: Column[],
    source: DataSourceType | 'user',
    type: 'pointset' | LayerType
}

export type DataSourceSpec = {
    type: DataSourceType,
    outputTableName: string
}

export type OsmDataSourceSpec = DataSourceSpec & {
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

export type CsvDataSourceSpec = DataSourceSpec & {
    csvFileUrl?: string;
    csvObject?: unknown[][];
    delimiter?: string;
    geometryColumns?: {
        latColumnName: string;
        longColumnName: string;
        coordinateFormat?: string;
    };
}

export type JsonDataSourceSpec = DataSourceSpec & {
    jsonFileUrl?: string;
    jsonObject?: unknown[];
    geometryColumns?: {
        latColumnName: string;
        longColumnName: string;
        coordinateFormat?: string;
    };
}

export type DbSourceSpec = OsmDataSourceSpec | CsvDataSourceSpec | JsonDataSourceSpec;

export enum ColorMapInterpolator {
  SEQUENTIAL_REDS = 'interpolateReds',
  SEQUENTIAL_BLUES = 'interpolateBlues',
  DIVERGING_RED_BLUE = 'interpolateRdBu',
  OBSERVABLE10 = 'schemeObservable10',
}

/**
 * Type for map.
 * @property {number} opacity - Opacity of the layer.
 * @property {boolean} [isColorMap] - Indicates if the layer is a color map.
 * @property {ColorMapInterpolator} colorMapInterpolator - Interpolator for color mapping.
 * @property {number[]} [pickedComps] - Components that are picked, if any.
 * @property {boolean} [isSkip] - Indicates if the layer should be skipped in rendering.
 * @property {boolean} [isPick] - Indicates if the layer is for picking
 * @property {string} getFnv Column to extract thematic numeric values from
 */
export type MapSpec = {
    style?: 'light' | 'dark',
    layerRef: {
        outputTableName: string,
        opacity?: number,
        isColorMap?: boolean,
        colorMapInterpolator?: ColorMapInterpolator,
        colorMapLabels?: string[],
        pickedComps?: number[],
        isSkip?: boolean,
        isPick?: boolean,
        getFnv?: string
    }[]
}

export type UrbanSpec = {
    data?: DbSourceSpec[],
    map?: MapSpec
}

export type EngineOptions = {
    spec: UrbanSpec,
    adapters: {
        db: DbAdapter,
        map: MapAdapter
        // TODO: include computer, plot, etc.
    }
}
