export interface BoundingBox2D {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface GeoJsonGeneratorOptions {
  count?: number;
  bbox?: BoundingBox2D;
  seed?: number;
  properties?: Record<string, unknown> | ((index: number) => Record<string, unknown>);
}

export interface BuildingGeneratorOptions extends GeoJsonGeneratorOptions {
  minHeight?: number;
  maxHeight?: number;
  floors?: boolean;
}

export interface CsvGeneratorOptions {
  rowCount?: number;
  bbox?: BoundingBox2D;
  seed?: number;
  includeWkt?: boolean;
}

export interface GeoTiffGeneratorOptions {
  width?: number;
  height?: number;
  bands?: number;
  bbox?: BoundingBox2D;
  minValue?: number;
  maxValue?: number;
}

export interface OsmGeneratorOptions {
  geocodeArea?: string;
  areas?: string[];
  layers?: Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>;
  featureCountPerLayer?: number;
  bbox?: BoundingBox2D;
}
