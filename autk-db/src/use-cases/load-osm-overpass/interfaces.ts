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
  /** The tag set a `points`, `polylines` or `polygons` layer was built for. */
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

/** One tag condition: the key is present (no `value`), or the key has exactly `value`. */
export type OsmTagFilter = { key: string; value?: string };

/**
 * Features chosen by their tags: every node, way and multipolygon relation in
 * the query area that matches any one of `tags`. They load as up to three
 * layers, `<outputTableName>_<name>_points`, `_polylines` and `_polygons`;
 * a geometry with no feature gets no layer.
 */
export type OsmTagSet = { name: string; tags: OsmTagFilter[] };

const MAX_TAG_SETS = 8;
const MAX_TAG_FILTERS = 64;
const TAG_SET_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const TAG_KEY = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,254}$/;
const hasControlCharacter = (text: string) =>
  [...text].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

/**
 * Checks tag sets and returns them with each set's filters deduplicated and sorted.
 *
 * @throws When there are more than 8 sets, a name is not a lowercase identifier
 *   or repeats, a set has no filter or more than 64, a key is not an OSM key, or
 *   a value is empty, longer than 255 characters or holds a control character.
 */
export function checkTagSets(sets: unknown): OsmTagSet[] {
  if (sets === undefined) return [];
  if (!Array.isArray(sets) || sets.length > MAX_TAG_SETS) {
    throw new Error(`tagSets must be a list of at most ${MAX_TAG_SETS} tag sets.`);
  }
  const names = new Set<string>();
  return sets.map((set) => {
    const name = (set as OsmTagSet)?.name;
    if (typeof name !== 'string' || !TAG_SET_NAME.test(name) || names.has(name)) {
      throw new Error(`A tag set name must be unique, lowercase letters, digits and _, starting with a letter: ${JSON.stringify(name)}.`);
    }
    names.add(name);
    const tags = (set as OsmTagSet).tags;
    if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAG_FILTERS) {
      throw new Error(`Tag set "${name}" must have 1 to ${MAX_TAG_FILTERS} tags.`);
    }
    const unique = new Map<string, OsmTagFilter>();
    for (const tag of tags) {
      const { key, value } = (tag ?? {}) as OsmTagFilter;
      if (typeof key !== 'string' || !TAG_KEY.test(key)) {
        throw new Error(`Tag set "${name}" has a key that is not an OSM key: ${JSON.stringify(key)}.`);
      }
      if (value !== undefined && (typeof value !== 'string' || value.length === 0 || value.length > 255 || hasControlCharacter(value))) {
        throw new Error(`Tag set "${name}" has a value for "${key}" that is empty, too long, or holds a control character.`);
      }
      const filter = value === undefined ? { key } : { key, value };
      unique.set(JSON.stringify([key, value ?? null]), filter);
    }
    const sorted = [...unique.values()].sort((a, b) =>
      a.key === b.key ? (a.value ?? '').localeCompare(b.value ?? '') : a.key < b.key ? -1 : 1,
    );
    return { name, tags: sorted };
  });
}

export type LoadOsmParams = {
  outputTableName?: string;
  autoLoadLayers: {
    /** CRS of the OSM input data (source). Defaults to EPSG:4326. */
    coordinateFormat?: string;
    /** May be empty when `tagSets` are given. */
    layers: Array<LayerType>;
  };
  /**
   * Features chosen by their tags, loaded beside the layers. Each set's
   * features are whole elements, never cut at the area's edge. Not supported
   * with `pbfFileUrl`.
   */
  tagSets?: OsmTagSet[];
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
