import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { OsmElement } from '../load-osm-from-overpass-api/interfaces';
import {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_WATER_VALUES,
  EXCLUDED_ROAD_HIGHWAY_VALUES,
} from '../../../shared/osm-tag-definitions';

import { CREATE_OSM_TABLE_QUERY, INSERT_OSM_DATA_QUERY } from '../load-osm-from-overpass-api/queries';

interface OverpassApiResponse {
  elements: OsmElement[];
}

/**
 * Shared OSM processing pipeline — consumed identically by the Overpass
 * and PBF loading paths.  All methods are pure except the DuckDB insertion
 * helpers.
 */
export class OsmProcessingPipeline {
  constructor(
    private readonly db: AsyncDuckDB,
    private readonly conn: AsyncDuckDBConnection,
  ) {}

  // ---------------------------------------------------------------------------
  // Response splitting
  // ---------------------------------------------------------------------------

  /**
   * Splits the merged OSM response into two datasets:
   * - `osmData`: all nodes, ways, and non-boundary relations
   * - `boundariesData`: only the ways that form admin boundary rings + their nodes
   */
  splitCombinedResponse(
    combined: OverpassApiResponse,
    queryArea: { geocodeArea: string; areas: string[] },
  ): {
    osmData: OverpassApiResponse;
    boundariesData: OverpassApiResponse;
  } {
    const elements = combined.elements ?? [];
    const boundaryRelationIds = this.getBoundaryRelationIds(elements, queryArea.areas);

    const boundaryWayIds = new Set<number>();
    for (const element of elements) {
      if (element.type === 'relation' && boundaryRelationIds.has(element.id) && element.members) {
        for (const member of element.members) {
          if (member.type === 'way') boundaryWayIds.add(member.ref);
        }
      }
    }

    const osmData: OverpassApiResponse = {
      elements: elements.filter(e => e.type !== 'relation' || !boundaryRelationIds.has(e.id)),
    };

    const boundaryNodeIds = new Set<number>();
    for (const element of elements) {
      if (element.type === 'way' && boundaryWayIds.has(element.id) && element.nodes) {
        element.nodes.forEach(nodeId => boundaryNodeIds.add(nodeId));
      }
    }

    const boundariesData: OverpassApiResponse = {
      elements: elements.filter(
        e =>
          (e.type === 'way' && boundaryWayIds.has(e.id)) ||
          (e.type === 'node' && boundaryNodeIds.has(e.id)),
      ),
    };

    return { osmData, boundariesData };
  }

  // ---------------------------------------------------------------------------
  // Bounding-box computation
  // ---------------------------------------------------------------------------

  /**
   * Derives the bounding box from elements already in memory.
   * Uses node lat/lon and way inline geometry produced by `out geom qt`
   * or resolved from a PBF node index.
   */
  computeBboxFromElements(
    elements: OsmElement[],
  ): { south: number; north: number; west: number; east: number } | null {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    let found = false;

    for (const el of elements) {
      if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
        if (el.lat < minLat) minLat = el.lat;
        if (el.lat > maxLat) maxLat = el.lat;
        if (el.lon < minLon) minLon = el.lon;
        if (el.lon > maxLon) maxLon = el.lon;
        found = true;
      }
      if (el.type === 'way' && el.geometry) {
        for (const pt of el.geometry) {
          if (pt.lat < minLat) minLat = pt.lat;
          if (pt.lat > maxLat) maxLat = pt.lat;
          if (pt.lon < minLon) minLon = pt.lon;
          if (pt.lon > maxLon) maxLon = pt.lon;
          found = true;
        }
      }
    }

    return found ? { south: minLat, north: maxLat, west: minLon, east: maxLon } : null;
  }

  // ---------------------------------------------------------------------------
  // Boundary relation detection
  // ---------------------------------------------------------------------------

  getBoundaryRelationIds(elements: OsmElement[], areaNames: string[]): Set<number> {
    const boundaryRelationIds = new Set<number>();
    const requestedAreaNames = new Set(areaNames);

    for (const element of elements) {
      if (element.type !== 'relation') continue;
      if (element.tags?.name && requestedAreaNames.has(element.tags.name)) {
        boundaryRelationIds.add(element.id);
      }
    }

    if (boundaryRelationIds.size === 0) {
      console.warn(
        `[autk-db] Requested area boundary relations were not found by exact name match: ${areaNames.join(', ')}`,
      );
    }

    return boundaryRelationIds;
  }

  // ---------------------------------------------------------------------------
  // DuckDB insertion
  // ---------------------------------------------------------------------------

  async insertOsmDataUsingJson(
    tableName: string,
    osmData: OverpassApiResponse,
    workspace: string,
    ignoreTags: boolean = false,
  ): Promise<void> {
    if ((osmData.elements?.length ?? 0) === 0) {
      await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName, workspace));
      return;
    }

    const formattedElements = this.formatOsmDataForJson(osmData);
    if (formattedElements.length === 0) {
      await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName, workspace));
      return;
    }

    const payload = JSON.stringify(formattedElements);
    if (!payload || payload.trim().length === 0) {
      throw new Error(`Failed to serialize OSM JSON payload for table ${tableName}`);
    }

    const fileName = `osm_data_${tableName}_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;

    await this.db.registerFileText(fileName, payload);
    await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName, workspace));
    await this.conn.query(INSERT_OSM_DATA_QUERY(tableName, fileName, workspace, ignoreTags));

    try {
      await this.db.dropFile(fileName);
    } catch (e) {
      console.warn(`Failed to cleanup file ${fileName}:`, e);
    }
  }

  // ---------------------------------------------------------------------------
  // Element formatting
  // ---------------------------------------------------------------------------

  /**
   * Converts a raw OSM response into the flat record format expected by
   * the DuckDB table schema.
   *
   * Ways with inline `geometry` carry both `nodes` (real OSM node IDs) and
   * `geometry` (lat/lon per node). Synthetic node records are emitted from
   * the inline geometry so the SQL layer queries can join on node ID.
   */
  formatOsmDataForJson(osmData: OverpassApiResponse): Array<{
    kind: 'node' | 'way' | 'relation';
    id: number;
    tags: Array<{ k: string; v: string }>;
    refs: number[];
    lat: number | null;
    lon: number | null;
    ref_roles: string[];
    ref_types: string[];
  }> {
    type FormattedElement = {
      kind: 'node' | 'way' | 'relation';
      id: number;
      tags: Array<{ k: string; v: string }>;
      refs: number[];
      lat: number | null;
      lon: number | null;
      ref_roles: string[];
      ref_types: string[];
    };

    const formattedElements: FormattedElement[] = [];
    const emittedNodeIds = new Set<number>();

    const emitNode = (id: number, lat: number, lon: number) => {
      if (!emittedNodeIds.has(id)) {
        emittedNodeIds.add(id);
        formattedElements.push({ kind: 'node', id, tags: [], refs: [], lat, lon, ref_roles: [], ref_types: [] });
      }
    };

    osmData.elements.forEach((element) => {
      switch (element.type) {
        case 'node':
          if (element.lat !== undefined && element.lon !== undefined) {
            emitNode(element.id, element.lat, element.lon);
          }
          break;

        case 'way': {
          const refs: number[] = element.nodes ?? [];
          const tags = this.withDerivedLayerTag(element.tags);
          if (element.geometry && element.geometry.length > 0 && element.nodes) {
            for (let i = 0; i < element.nodes.length; i++) {
              const geo = element.geometry[i];
              if (geo) emitNode(element.nodes[i], geo.lat, geo.lon);
            }
          }
          formattedElements.push({
            kind: 'way',
            id: element.id,
            tags: tags ? Object.entries(tags).map(([k, v]) => ({ k, v })) : [],
            refs,
            lat: null,
            lon: null,
            ref_roles: [],
            ref_types: [],
          });
          break;
        }

        case 'relation': {
          const refs: number[] = [];
          const ref_roles: string[] = [];
          const ref_types: ('node' | 'way' | 'relation')[] = [];
          const tags = this.withDerivedLayerTag(element.tags);
          if (element.members) {
            element.members.forEach((member) => {
              refs.push(member.ref);
              ref_roles.push(member.role || '');
              ref_types.push(member.type);
            });
          }
          formattedElements.push({
            kind: 'relation',
            id: element.id,
            tags: tags ? Object.entries(tags).map(([k, v]) => ({ k, v })) : [],
            refs,
            lat: null,
            lon: null,
            ref_roles,
            ref_types,
          });
          break;
        }
      }
    });

    return formattedElements;
  }

  // ---------------------------------------------------------------------------
  // Derived layer tagging
  // ---------------------------------------------------------------------------

  private getDerivedLayerTag(tags?: Record<string, string>): 'parks' | 'water' | 'roads' | 'buildings' | null {
    if (!tags) return null;

    if (this.isBuildingTagSet(tags)) {
      return 'buildings';
    }

    if (this.isRoadTagSet(tags)) {
      return 'roads';
    }

    if (
      this.hasTagValue(tags, 'leisure', PARKS_LEISURE_VALUES) ||
      this.hasTagValue(tags, 'landuse', PARKS_LANDUSE_VALUES) ||
      this.hasTagValue(tags, 'natural', PARKS_NATURAL_VALUES)
    ) {
      return 'parks';
    }

    if (
      this.hasTagValue(tags, 'natural', WATER_NATURAL_VALUES) ||
      this.hasTagValue(tags, 'water', WATER_WATER_VALUES)
    ) {
      return 'water';
    }

    return null;
  }

  private isRoadTagSet(tags: Record<string, string>): boolean {
    return (
      tags.highway !== undefined &&
      tags.area !== 'yes' &&
      !this.hasTagValue(tags, 'highway', EXCLUDED_ROAD_HIGHWAY_VALUES)
    );
  }

  private isBuildingTagSet(tags: Record<string, string>): boolean {
    const hasBuildingKind =
      (tags.building !== undefined && tags.building !== 'roof') ||
      (tags['building:part'] !== undefined && tags['building:part'] !== 'roof') ||
      tags.type === 'building' ||
      (tags.type === 'multipolygon' && tags.building !== undefined && tags.building !== 'roof') ||
      (tags.type === 'multipolygon' && tags['building:part'] !== undefined && tags['building:part'] !== 'roof');

    return hasBuildingKind;
  }

  private hasTagValue(tags: Record<string, string>, key: string, values: readonly string[]): boolean {
    const value = tags[key];
    return value !== undefined && values.includes(value);
  }

  private withDerivedLayerTag(tags?: Record<string, string>): Record<string, string> | undefined {
    if (!tags) return tags;

    const derivedLayer = this.getDerivedLayerTag(tags);
    if (!derivedLayer) return tags;

    return {
      ...tags,
      __autk_layer: derivedLayer,
    };
  }
}
