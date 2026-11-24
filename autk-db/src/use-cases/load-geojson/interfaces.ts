import { FeatureCollection } from 'geojson';
import type { BoundingBox, LayerType } from '@urban-toolkit/autk-core';

/**
 * Parameters for loading a GeoJSON FeatureCollection into DuckDB as a spatial layer.
 */
export interface LoadGeojsonParams {
  /** URL pointing to a GeoJSON FeatureCollection file. */
  geojsonFileUrl?: string;
  /** In-memory GeoJSON FeatureCollection object. */
  geojsonObject?: FeatureCollection;
  /** Desired output table name to create in DuckDB. */
  outputTableName: string;
  /** CRS of the input GeoJSON data. Defaults to EPSG:4326. */
  sourceCrs?: string;
  /** Optional bounding box to clip or intersect geometries during import. */
  boundingBox?: BoundingBox;
  /** Optional workspace (schema) name. Defaults to `autk` when omitted. */
  workspace?: string;
  /**
   * Explicitly set the layer type. If omitted, the type is auto-detected from the first feature's geometry.
   */
  layerType?: LayerType;
}
