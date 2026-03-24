import { LayerType } from '../load-layer/interfaces';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  members?: {
    type: 'node' | 'way' | 'relation';
    ref: number;
    role?: string;
  }[];
  nodes?: number[];
}

export type LoadingPhase =
  | 'querying-osm-server'
  | 'downloading-osm-data'
  | 'querying-osm-boundaries'
  | 'downloading-boundaries'
  | 'processing-osm-data'
  | 'processing-boundaries';

export type OnLoadingProgress = (phase: LoadingPhase) => void;

export interface LayerLoadTimings {
  layerName: string;
  layerType: string;
  /** Time in ms to run the SQL query that extracts this layer from the OSM table (excludes HTTP). */
  loadMs: number;
  /** Number of GeoJSON features in the loaded layer. */
  featureCount: number;
}

export interface OsmLoadTimings {
  /** Number of OSM elements (nodes + ways + relations) in the main dataset. */
  osmElementCount: number;
  /** Number of elements in the boundary dataset. */
  boundaryElementCount: number;
  /** Time in ms to insert OSM elements into DuckDB (excludes HTTP download). */
  osmDataProcessingMs: number;
  /** Time in ms to insert boundary elements into DuckDB (excludes HTTP download). */
  boundariesProcessingMs: number;
  /** Per-layer timing and feature count details (populated when autoLoadLayers is used). */
  layers: LayerLoadTimings[];
}

export type Params = {
  outputTableName: string;
  autoLoadLayers?: {
    coordinateFormat: string;
    dropOsmTable: boolean;
    layers: Array<LayerType>;
  };
  queryArea: {
    geocodeArea: string;
    areas: string[];
  };
  workspace?: string;
  onProgress?: OnLoadingProgress;
};
