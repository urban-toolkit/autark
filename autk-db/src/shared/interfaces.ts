export type GridLayerTable = CommonTable & { source: 'user' };

export type Table = OsmTable | LayerTable | CsvTable | JsonTable | CustomLayerTable | GridLayerTable | AnyTable;

export type OsmTable = CommonTable & { source: 'osm' };
export type LayerTable = CommonTable & { source: 'osm_layer' };
export type CustomLayerTable = CommonTable & { source: 'geojson' };
export type CsvTable = CommonTable & { source: 'csv' };
export type JsonTable = CommonTable & { source: 'json' };
export type AnyTable = CommonTable & { source: 'user' };

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
