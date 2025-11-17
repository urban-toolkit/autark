
import { DbAdapter } from "./adapters";

// GetLayerParams

// {
//     osmInputTableName: string;
//     outputTableName?: string;
//     layer: LayerType;
//     coordinateFormat?: string;
//     boundingBox?: BoundingBox;
// }

// LoadCustomLayerParams

// {
//     geojsonFileUrl?: string;
//     geojsonObject?: FeatureCollection;
//     outputTableName: string;
//     coordinateFormat?: string;
//     boundingBox?: BoundingBox;
// }

// LoadGridLayerParams

// {
//     boundingBox?: BoundingBox;
//     rows: number;
//     columns: number;
//     outputTableName: string;
// }

export type LayerType = 'surface' | 'water' | 'parks' | 'roads' | 'buildings' | 'points' | 'polygons' | 'polylines' | 'raster';

export type DataSourceType = 'osm' | 'csv' | 'json';

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

export type UrbanSpec = {
    data: DbSourceSpec[]
}

export type EngineOptions = {
    spec: UrbanSpec,
    adapters: {
        db: DbAdapter
        // TODO: include computer, map, plot, etc.
    }
}
