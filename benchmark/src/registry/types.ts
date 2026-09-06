export type ViewApp = 'gallery' | 'usecases';

export type ViewCategory =
  | 'map-vis'
  | 'map-osm'
  | 'map-compute'
  | 'map-spatial-join'
  | 'plot-click'
  | 'plot-brush'
  | 'usecase';

export type ViewDataType =
  | 'geojson'
  | 'osm-overpass'
  | 'osm-pbf'
  | 'csv'
  | 'json-wkt'
  | 'geotiff'
  | 'multi-dataset';

export interface ViewDefinition {
  id: string;
  name: string;
  app: ViewApp;
  path: string;
  category: ViewCategory;
  dataTypes: ViewDataType[];
  description: string;
  canvasRequired?: boolean;
  plotRequired?: boolean;
  loadingOverlay?: boolean;
  mockRoutes?: Array<{
    pattern: string | RegExp;
    type: ViewDataType;
  }>;
}
