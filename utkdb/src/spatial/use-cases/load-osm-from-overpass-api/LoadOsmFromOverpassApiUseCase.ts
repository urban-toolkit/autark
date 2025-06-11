import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params, OsmElement } from './interfaces';
import { OsmTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { CREATE_OSM_TABLE_QUERY, INSERT_OSM_DATA_QUERY } from './queries';

interface OverpassApiResponse {
  elements: OsmElement[];
}

export class LoadOsmFromOverpassApiUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec({ boundingBox, outputTableName }: Params): Promise<OsmTable> {
    const osmData = await this.fetchOsmWithinBBox(boundingBox);
    console.log(`Fetched ${osmData.elements.length} OSM elements`);

    if (osmData.elements.length === 0) {
      throw new Error('No OSM elements found in the specified bounding box');
    }

    console.log(`Before filter count: ${osmData.elements.length}`);
    // Filter elements to only include those within bounding box
    const filteredOsmData = this.filterElements(osmData, boundingBox);
    console.log(`Filtered to ${filteredOsmData.elements.length} OSM elements within bounding box`);

    await this.insertOsmDataUsingJson(outputTableName, filteredOsmData);

    console.log(`Successfully inserted ${filteredOsmData.elements.length} OSM elements into ${outputTableName}`);

    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${outputTableName}`);
    return {
      source: 'osm',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
    };
  }

  /**
   * Insert OSM data using single JSON file approach with direct table creation
   */
  private async insertOsmDataUsingJson(tableName: string, osmData: OverpassApiResponse): Promise<void> {
    const formattedElements = this.formatOsmDataForJson(osmData);

    const fileName = 'osm_data.json';
    await this.db.registerFileText(fileName, JSON.stringify(formattedElements));

    await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName));

    await this.conn.query(INSERT_OSM_DATA_QUERY(tableName, fileName));

    try {
      await this.db.dropFile(fileName);
    } catch (e) {
      // Ignore errors if file cleanup fails
      console.warn(`Failed to cleanup file ${fileName}:`, e);
    }
  }

  /**
   * Filter OSM elements to only include those within the bounding box
   * Uses geometry-aware filtering to preserve complete road geometries
   */
  private filterElements(osmData: OverpassApiResponse, boundingBox: Params['boundingBox']): OverpassApiResponse {
    const { minLat, minLon, maxLat, maxLon } = boundingBox;

    // Step 1: Identify nodes that are within the bounding box
    const nodesInBBox = osmData.elements.filter((element) => {
      if (element.type !== 'node') return false;
      if (element.lat === undefined || element.lon === undefined) return false;

      return element.lat >= minLat && element.lat <= maxLat && element.lon >= minLon && element.lon <= maxLon;
    });

    const nodeIdsInBBox = new Set(nodesInBBox.map((node) => node.id));

    // Step 2: Find ways that have at least one node within the bounding box
    const waysWithNodesInBBox = osmData.elements.filter((element) => {
      if (element.type !== 'way') return false;
      if (!element.nodes || element.nodes.length === 0) return false;

      // Keep way if it has at least one node in the bounding box
      return element.nodes.some((nodeId) => nodeIdsInBBox.has(nodeId));
    });

    // Step 3: Get ALL nodes referenced by these valid ways (even if outside bbox)
    // This preserves complete geometry for roads that cross boundaries
    const allReferencedNodeIds = new Set<number>();
    waysWithNodesInBBox.forEach((way) => {
      way.nodes?.forEach((nodeId) => allReferencedNodeIds.add(nodeId));
    });

    // Step 4: Include all nodes that are either in bbox OR referenced by valid ways
    const validNodes = osmData.elements.filter((element) => {
      if (element.type !== 'node') return false;
      return nodeIdsInBBox.has(element.id) || allReferencedNodeIds.has(element.id);
    });

    // Step 5: Keep all ways that have nodes in the bounding box (with complete node references)
    const validWays = waysWithNodesInBBox;

    // Create a Set of valid way IDs for relation filtering
    const validWayIds = new Set(validWays.map((way) => way.id));
    const validNodeIds = new Set(validNodes.map((node) => node.id));

    // Step 6: Filter relations to only include members that reference valid nodes/ways
    const validRelations = osmData.elements
      .filter((element) => element.type === 'relation')
      .map((relation) => ({
        ...relation,
        members:
          relation.members?.filter((member) => {
            if (member.type === 'node') {
              return validNodeIds.has(member.ref);
            } else if (member.type === 'way') {
              return validWayIds.has(member.ref);
            } else if (member.type === 'relation') {
              // For now, keep relation references as they might be valid
              // You can adjust this logic based on your specific needs
              return true;
            }
            return false;
          }) || [],
      }))
      .filter((relation) => relation.members && relation.members.length > 0); // Remove relations with no valid members

    // Combine all filtered elements
    const filteredElements = [...validNodes, ...validWays, ...validRelations];

    return {
      elements: filteredElements,
    };
  }

  /**
   * Format OSM data into the exact structure expected by our table schema
   */
  private formatOsmDataForJson(osmData: OverpassApiResponse): Array<{
    kind: 'node' | 'way' | 'relation';
    id: number;
    tags: Array<{ k: string; v: string }>;
    refs: number[];
    lat: number | null;
    lon: number | null;
    ref_roles: string[];
    ref_types: string[];
  }> {
    const formattedElements: Array<{
      kind: 'node' | 'way' | 'relation';
      id: number;
      tags: Array<{ k: string; v: string }>;
      refs: number[];
      lat: number | null;
      lon: number | null;
      ref_roles: string[];
      ref_types: string[];
    }> = [];

    console.log({ node: osmData.elements.find((e) => e.type === 'node') });
    console.log({ way: osmData.elements.find((e) => e.type === 'way') });
    console.log({ relation: osmData.elements.find((e) => e.type === 'relation') });

    osmData.elements.forEach((element) => {
      switch (element.type) {
        case 'node':
          if (element.lat !== undefined && element.lon !== undefined) {
            formattedElements.push({
              kind: 'node',
              id: element.id,
              tags: element.tags ? Object.entries(element.tags).map(([k, v]) => ({ k, v })) : [],
              refs: [],
              lat: element.lat,
              lon: element.lon,
              ref_roles: [],
              ref_types: [],
            });
          }
          break;

        case 'way':
          formattedElements.push({
            kind: 'way',
            id: element.id,
            tags: element.tags ? Object.entries(element.tags).map(([k, v]) => ({ k, v })) : [],
            refs: element.nodes || [],
            lat: null,
            lon: null,
            ref_roles: [],
            ref_types: [],
          });
          break;

        case 'relation': {
          const refs: number[] = [];
          const ref_roles: string[] = [];
          const ref_types: ('node' | 'way' | 'relation')[] = [];

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
            tags: element.tags ? Object.entries(element.tags).map(([k, v]) => ({ k, v })) : [],
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

  /**
   * Fetch OSM data within a bounding box from the Overpass API
   */
  private async fetchOsmWithinBBox(bbox: Params['boundingBox']): Promise<OverpassApiResponse> {
    const { minLat, minLon, maxLat, maxLon } = bbox;

    const query = `
      [out:json][timeout:25];
      (
        node(${minLat},${minLon},${maxLat},${maxLon});
        way(${minLat},${minLon},${maxLat},${maxLon});
        relation(${minLat},${minLon},${maxLat},${maxLon});
      );
      (._; >;);
      out body;
    `.trim();

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log(`Fetching OSM data from Overpass API...`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
