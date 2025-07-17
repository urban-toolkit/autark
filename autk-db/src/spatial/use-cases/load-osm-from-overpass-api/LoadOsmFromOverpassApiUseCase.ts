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

  async exec(params: Params): Promise<OsmTable> {
    if (!params.queryArea) throw new Error('queryArea must be provided');

    const osmData = await this.fetchOsmWithinPolygon(params.queryArea);

    if (osmData.elements.length === 0) {
      throw new Error('No OSM elements found in the specified area');
    }

    await this.insertOsmDataUsingJson(params.outputTableName, osmData);

    console.log(`Successfully inserted ${osmData.elements.length} OSM elements into ${params.outputTableName}`);

    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${params.outputTableName}`);
    return {
      source: 'osm',
      type: 'pointset',
      name: params.outputTableName,
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
   * Fetch OSM data within a geocode area from the Overpass API
   */
  private async fetchOsmWithinPolygon(queryArea: {
    geocodeArea: string;
    areas: string[];
  }): Promise<OverpassApiResponse> {
    const geocodeAlias = 'areaMain'; // alias without leading dot

    // 1. Main geocode area
    const geocodeLine = `area[\"name\"=\"${queryArea.geocodeArea}\"]->.${geocodeAlias};`;

    // 2. Build a set of lines for each requested sub-area
    const subAreaLines: string[] = [];
    const allWaysSelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      subAreaLines.push(`relation[\"name\"=\"${areaName}\"](area.${geocodeAlias})->.rel${i};`);
      subAreaLines.push(`.rel${i} map_to_area->.area${i};`);
      subAreaLines.push(`way(area.area${i})->.ways${i};`);
      subAreaLines.push(`way(r.rel${i})->.mways${i};`);

      allWaysSelectors.push(`.ways${i};.mways${i};`);
    });

    // 3. Combine everything into a full query with readable indentation
    const query = `
      [
        out:json
      ][timeout:25];

      ${geocodeLine}
      ${subAreaLines.map((l) => `  ${l}`).join('\n')}

      ( ${allWaysSelectors.join('')} )->.allWays;
      .allWays->.selWays;
      ( .selWays; >; )->.complete;
      ( .selWays; .complete; );
      out body;
    `;

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log('Fetching OSM data from Overpass API...');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
