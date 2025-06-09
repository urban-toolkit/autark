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

    await this.insertOsmDataUsingJson(outputTableName, osmData);

    console.log(`Successfully inserted ${osmData.elements.length} OSM elements into ${outputTableName}`);

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
