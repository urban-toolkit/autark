import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { OsmElement } from '../../use-cases/load-osm-overpass/interfaces';
import { FormattedElement, OverpassApiResponse } from './interfaces';
import {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_ROADS_VALUES,
  EXCLUDED_BUILDING_VALUES,
} from '../../consts';

import { CREATE_OSM_TABLE_QUERY, INSERT_OSM_DATA_QUERY } from '../../use-cases/load-osm-overpass/queries';

/**
 * Shared OSM processing pipeline for splitting, tagging, and inserting OSM data.
 *
 * Consumed identically by both the Overpass API and PBF loading paths.
 */
export class OsmProcessingPipeline {
  /**
   * @param db DuckDB instance.
   * @param conn Active DuckDB connection.
   */
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
   *
   * @param combined The full Overpass API response.
   * @param queryArea Information about the geocoded area and its names.
   * @returns An object containing split `osmData` and `boundariesData`.
   * @example
   * const { osmData, boundariesData } = pipeline.splitCombinedResponse(response, area);
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
   *
   * @param elements List of OSM elements to process.
   * @returns The bounding box (south, north, west, east) or `null` if no coordinates found.
   * @example
   * const bbox = pipeline.computeBboxFromElements(elements);
   * if (bbox) console.log(bbox.south);
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

  /**
   * Identifies relation IDs that correspond to the requested area boundaries.
   *
   * @param elements List of OSM elements to scan.
   * @param areaNames Names of the areas used to match boundary relations.
   * @returns A set of relation IDs that represent the requested boundaries.
   * @example
   * const boundaryIds = pipeline.getBoundaryRelationIds(elements, ['Berlin']);
   */
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

  /**
   * Inserts OSM data into a DuckDB table using a JSON payload.
   *
   * @param tableName Name of the target DuckDB table.
   * @param osmData The OSM data to be inserted.
   * @param workspace The DuckDB workspace name.
   * @param ignoreTags Whether to skip derived layer tagging.
   * @returns A promise that resolves when insertion is complete.
   * @throws Error if JSON serialization fails.
   * @example
   * await pipeline.insertOsmDataUsingJson('osm_ways', response, 'autk');
   */
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
   *
   * @param osmData The raw OSM response to format.
   * @returns An array of formatted elements ready for JSON serialization.
   * @example
   * const formatted = pipeline.formatOsmDataForJson(response);
   */
  formatOsmDataForJson(osmData: OverpassApiResponse): FormattedElement[] {
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

  /**
   * Determines a derived layer tag (e.g., 'parks', 'water') based on OSM tags.
   *
   * @param tags The OSM tags to analyze.
   * @returns The derived layer name or `null` if no specific layer is identified.
   * @private
   */
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
      this.hasTagValue(tags, 'water', WATER_FEATURE_VALUES)
    ) {
      return 'water';
    }

    return null;
  }

  /**
   * Checks if the tags indicate a road-like element.
   *
   * @param tags The OSM tags to check.
   * @returns `true` if the element is a road, `false` otherwise.
   * @private
   */
  private isRoadTagSet(tags: Record<string, string>): boolean {
    return (
      tags.highway !== undefined &&
      tags.area !== 'yes' &&
      !this.hasTagValue(tags, 'highway', EXCLUDED_ROADS_VALUES)
    );
  }

  /**
   * Checks if the tags indicate a building-like element.
   *
   * @param tags The OSM tags to check.
   * @returns `true` if the element is a building, `false` otherwise.
   * @private
   */
  private isBuildingTagSet(tags: Record<string, string>): boolean {
    const hasBuildingKind =
      (tags.building !== undefined && !this.hasTagValue(tags, 'building', EXCLUDED_BUILDING_VALUES)) ||
      (tags['building:part'] !== undefined && !this.hasTagValue(tags, 'building:part', EXCLUDED_BUILDING_VALUES)) ||
      tags.type === 'building' ||
      (tags.type === 'multipolygon' && tags.building !== undefined && !this.hasTagValue(tags, 'building', EXCLUDED_BUILDING_VALUES)) ||
      (tags.type === 'multipolygon' && tags['building:part'] !== undefined && !this.hasTagValue(tags, 'building:part', EXCLUDED_BUILDING_VALUES));

    return hasBuildingKind;
  }

  /**
   * Checks if a specific tag key has one of the provided values.
   *
   * @param tags The OSM tags to check.
   * @param key The tag key to look for.
   * @param values The list of allowed values for the key.
   * @returns `true` if the tag exists and matches one of the values, `false` otherwise.
   * @private
   */
  private hasTagValue(tags: Record<string, string>, key: string, values: readonly string[]): boolean {
    const value = tags[key];
    return value !== undefined && values.includes(value);
  }

  /**
   * Adds a derived layer tag to the existing OSM tags if applicable.
   *
   * @param tags The original OSM tags.
   * @returns A new object containing the original tags plus the `__autk_layer` tag, or the original tags if no layer is derived.
   * @private
   */
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
