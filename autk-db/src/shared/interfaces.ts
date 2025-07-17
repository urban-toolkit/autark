import { LayerType } from '../spatial/use-cases/load-layer/interfaces';

export type GridLayerTable = CommonTable & { source: 'user'; type: LayerType };

export type Table = OsmTable | LayerTable | CsvTable | JsonTable | CustomLayerTable | GridLayerTable | AnyTable;

export type OsmTable = CommonTable & { source: 'osm'; type: 'pointset' }; // TODO: which type?
export type LayerTable = CommonTable & { source: 'osm'; type: LayerType };
export type CustomLayerTable = CommonTable & { source: 'geojson'; type: LayerType };
export type CsvTable = CommonTable & { source: 'csv'; type: 'pointset' }; // TODO: in theory, its optional to be a pointset
export type JsonTable = CommonTable & { source: 'json'; type: 'pointset' };
export type AnyTable = CommonTable & { source: 'user'; type: 'pointset' };

interface CommonTable {
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}