import { BoundingBox } from '../../../shared/interfaces';

export type LayerType =
  | 'surface'
  | 'water'
  | 'parks'
  | 'roads'
  | 'buildings'
  | 'points'
  | 'polygons'
  | 'polylines'
  | 'rasters';

export function isLayerType(value: string): value is LayerType {
  return ['surface', 'water', 'parks', 'roads', 'buildings', 'points', 'polygons', 'polylines', 'rasters'].includes(
    value,
  );
}

/**
 * Maps GeoJSON geometry types to LayerType
 * - Point/MultiPoint → points
 * - LineString/MultiLineString → polylines
 * - Polygon/MultiPolygon → polygons
 * - GeometryCollection → polygons (default)
 */
export function mapGeojsonGeometryTypeToLayerType(geojsonType: string): LayerType {
  switch (geojsonType) {
    case 'Point':
    case 'MultiPoint':
      return 'points';
    case 'LineString':
    case 'MultiLineString':
      return 'polylines';
    case 'Polygon':
    case 'MultiPolygon':
      return 'polygons';
    case 'GeometryCollection':
      return 'polygons'; // default fallback
    default:
      throw new Error(`Unsupported GeoJSON geometry type: ${geojsonType}`);
  }
}

export interface Params {
  osmInputTableName: string;
  outputTableName?: string;
  layer: LayerType;
  coordinateFormat?: string;
  boundingBox?: BoundingBox;
}

export interface Layer {
  metadata: { [key: string]: string };
  linestring: {
    type: 'LineString';
    coordinates: Array<Array<number>>;
  };
}
