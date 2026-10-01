import type { LayerType } from '@urban-toolkit/autk-core';

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
  /** Inline geometry from Overpass `out geom;` — present alongside `nodes` for ways. */
  geometry?: Array<{ lat: number; lon: number }>;
}

export type LoadingPhase =
  | 'querying-osm-server'
  | 'downloading-osm-data'
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

/** Named admin areas inside a region: `areas` are boundary names, `geocodeArea` scopes them. */
export type OsmNamedArea = {
  geocodeArea: string;
  areas: string[];
};

/** A WGS84 bounding box, `[west, south, east, north]` in degrees. */
export type OsmBoundingBoxArea = {
  bbox: [number, number, number, number];
};

/** What `loadOsm` loads: named areas, or everything inside a box. */
export type OsmQueryArea = OsmNamedArea | OsmBoundingBoxArea;

/** True for the bounding-box form of a query area. */
export function isBoundingBoxArea(area: OsmQueryArea): area is OsmBoundingBoxArea {
  return 'bbox' in area;
}

/**
 * Checks a bounding-box query area and returns it as south, north, west, east.
 *
 * @throws When the box is not four finite WGS84 degrees with west < east and south < north.
 */
export function boundingBoxOf(area: OsmBoundingBoxArea): { south: number; north: number; west: number; east: number } {
  const box = area.bbox;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('queryArea.bbox must be [west, south, east, north] in WGS84 degrees.');
  }
  const [west, south, east, north] = box;
  if (!(west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north)) {
    throw new Error(
      'queryArea.bbox must be [west, south, east, north] in WGS84 degrees, with west < east and south < north.',
    );
  }
  return { south, north, west, east };
}

export type LoadOsmParams = {
  outputTableName?: string;
  autoLoadLayers: {
    /** CRS of the OSM input data (source). Defaults to EPSG:4326. */
    coordinateFormat?: string;
    layers: Array<LayerType>;
  };
  /**
   * Named areas inside a region, or a WGS84 bounding box. With a box, the box
   * is the area's boundary: layers are cropped and clipped to it, and the
   * `surface` layer is the box itself.
   */
  queryArea: OsmQueryArea;
  /** If provided, OSM data is loaded from this `.osm.pbf` file instead of the Overpass API. Takes named areas only. */
  pbfFileUrl?: string;
  /** When true, bypasses the cached Overpass response and fetches fresh data. */
  forceRefresh?: boolean;
  workspace?: string;
  onProgress?: OnLoadingProgress;
};
