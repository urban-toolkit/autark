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
  /** Name of the custom tag set, when this timing describes a tag-selected layer. */
  tagSet?: string;
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

/** Exact OSM boundary names (including boundary=place), scoped by member nodes inside a named region.
 * Both sources apply this scope when available. PBF warns and falls back to exact
 * area names if the extract lacks a usable region boundary. */
export type OsmNamedArea = { geocodeArea: string; areas: string[] };
/** WGS84 degrees in [west, south, east, north] order. Antimeridian crossings are unsupported. */
export type OsmBoundingBoxArea = { bbox: [number, number, number, number] };
export type OsmQueryArea = OsmNamedArea | OsmBoundingBoxArea;

export function isBoundingBoxArea(area: OsmQueryArea): area is OsmBoundingBoxArea {
  return 'bbox' in area;
}

/** Validates the public bbox before any network request or PBF scan. */
export function boundingBoxOf(area: OsmBoundingBoxArea): { west: number; south: number; east: number; north: number } {
  const box = area.bbox;
  if (!Array.isArray(box) || box.length !== 4 || !Array.from(box).every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('queryArea.bbox must be [west, south, east, north] in finite WGS84 degrees.');
  }
  const [west, south, east, north] = box;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error('queryArea.bbox must be [west, south, east, north] with west < east and south < north within WGS84 limits.');
  }
  return { west, south, east, north };
}

/** Exact tag value, or key presence when value is omitted. Filters within a set use OR. */
export type OsmTagFilter = { key: string; value?: string };

/** One geometry family; no centroid conversion or automatic multi-layer splitting. */
export type OsmTagSet = {
  name: string;
  type: 'points' | 'polylines' | 'polygons';
  tags: OsmTagFilter[];
};

/** Validates before acquisition and canonicalizes filters for deterministic queries/cache keys. */
export function checkTagSets(sets: unknown): OsmTagSet[] {
  if (sets === undefined) return [];
  if (!Array.isArray(sets) || sets.length > 8) {
    throw new Error('tagSets must be a list of at most 8 tag sets.');
  }
  const names = new Set<string>();
  return sets.map((set: OsmTagSet) => {
    if (typeof set?.name !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(set.name) || names.has(set.name)) {
      throw new Error('A tag set name must be a unique lowercase identifier starting with a letter (at most 32 characters).');
    }
    names.add(set.name);
    if (!['points', 'polylines', 'polygons'].includes(set.type)) {
      throw new Error(`Tag set "${set.name}" requires type: points, polylines or polygons.`);
    }
    if (!Array.isArray(set.tags) || set.tags.length === 0 || set.tags.length > 64) {
      throw new Error(`Tag set "${set.name}" must have 1 to 64 tags.`);
    }
    const unique = new Map<string, OsmTagFilter>();
    for (const tag of set.tags) {
      const { key, value } = tag ?? {};
      if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_:.-]{0,254}$/.test(key)) {
        throw new Error(`Tag set "${set.name}" has an invalid OSM tag key.`);
      }
      if (value !== undefined && (typeof value !== 'string' || value.length === 0 || value.length > 255
        || [...value].some(character => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f))) {
        throw new Error(`Tag set "${set.name}" has an empty, oversized or control-character tag value.`);
      }
      unique.set(JSON.stringify([key, value ?? null]), value === undefined ? { key } : { key, value });
    }
    return { name: set.name, type: set.type,
      tags: [...unique.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, filter]) => filter) };
  });
}

export type LoadOsmParams = {
  outputTableName?: string;
  autoLoadLayers: {
    /** CRS of the OSM input data (source). Defaults to EPSG:4326. */
    coordinateFormat?: string;
    /** Public layers to retain; may be empty for tag-only loads. Surface is always constructed as a workspace mask, hidden unless requested. */
    layers: Array<LayerType>;
  };
  /** Named boundaries or a WGS84 bbox. Surface excludes sea when coastline reconstruction succeeds;
   * otherwise the full query area is used with a warning. Buildings retain complete original parts. */
  queryArea: OsmQueryArea;
  /** Overpass-only tag-selected layers, clipped to the mandatory surface. Each set requires one geometry type. */
  tagSets?: OsmTagSet[];
  /** If provided, OSM data is loaded from this `.osm.pbf` file instead of the Overpass API. */
  pbfFileUrl?: string;
  /** When true, bypasses the cached Overpass response and fetches fresh data. */
  forceRefresh?: boolean;
  workspace?: string;
  onProgress?: OnLoadingProgress;
};
