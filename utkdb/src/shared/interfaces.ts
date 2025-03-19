export type Table = OsmTable | LayerTable | CsvTable;
export type OsmTable = CommonTable & { type: 'osm' };
export type LayerTable = CommonTable & { type: 'layer' };
export type CsvTable = CommonTable & { type: 'csv' };

interface CommonTable {
  name: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
}
