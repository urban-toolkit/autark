import { LayerType } from '../spatial/use-cases/load-layer/interfaces';

export type Table = OsmTable | LayerTable | CsvTable | CustomLayerTable;
export type OsmTable = CommonTable & { source: 'osm'; type: 'pointset' }; // TODO: which type?
export type LayerTable = CommonTable & { source: 'osm'; type: LayerType };
export type CustomLayerTable = CommonTable & { source: 'geojson'; type: LayerType };
export type CsvTable = CommonTable & { source: 'csv'; type: 'pointset' }; // TODO: in theory, its optional to be a pointset

interface CommonTable {
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
}

// TODO:
// 4. Crop data on db?
