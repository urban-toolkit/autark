import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params, OsmElement } from './interfaces';
import { OsmTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { CREATE_OSM_TABLE_QUERY, INSERT_OSM_DATA_QUERY } from './queries';
import { HttpCache } from '../../../shared/HttpCache';

interface OverpassApiResponse {
  elements: OsmElement[];
}

export class LoadOsmFromOverpassApiUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;
  private cache: HttpCache<OverpassApiResponse>;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
    this.cache = new HttpCache('overpass-api-cache', 24 * 60 * 60 * 1000); // 24h TTL
  }

  /**
   * Generate a cache key from query parameters
   */
  private getCacheKey(queryArea: { geocodeArea: string; areas: string[] }, isBoundary: boolean): string {
    const type = isBoundary ? 'boundaries' : 'data';
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-${type}-${queryArea.geocodeArea}-${areas}`;
  }

  async exec(params: Params): Promise<OsmTable[]> {
    if (!params.queryArea) throw new Error('queryArea must be provided');
    const workspace = params.workspace || 'main';

    // 1. Fetch OSM data from query area
    const osmData = await this.fetchOsmWithinArea(params.queryArea);
    await this.insertOsmDataUsingJson(params.outputTableName, osmData, workspace);
    console.log(`Successfully inserted ${osmData.elements.length} OSM elements into ${params.outputTableName}`);

    // 2. Fetch OSM data just for boundaries
    const boundariesData = await this.fetchBoundariesOsmWithinArea(params.queryArea);
    await this.insertOsmDataUsingJson(`${params.outputTableName}_boundaries`, boundariesData, workspace, true);
    console.log(
      `Successfully inserted ${boundariesData.elements.length} boundaries into ${params.outputTableName}_boundaries`,
    );

    const qualifiedTableName = `${workspace}.${params.outputTableName}`;
    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${qualifiedTableName}`);
    return [
      {
        source: 'osm',
        type: 'pointset',
        name: params.outputTableName,
        columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
      },
      {
        source: 'osm',
        type: 'pointset',
        name: `${params.outputTableName}_boundaries`,
        columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
      },
    ];
  }

  /**
   * Insert OSM data using single JSON file approach with direct table creation
   */
  private async insertOsmDataUsingJson(
    tableName: string,
    osmData: OverpassApiResponse,
    workspace: string,
    ignoreTags: boolean = false,
  ): Promise<void> {
    const formattedElements = this.formatOsmDataForJson(osmData);

    const fileName = 'osm_data.json';
    await this.db.registerFileText(fileName, JSON.stringify(formattedElements));

    await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName, workspace));

    await this.conn.query(INSERT_OSM_DATA_QUERY(tableName, fileName, workspace, ignoreTags));

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
   * Fetch OSM data within a geocode area from the Overpass API (with caching)
   */
  private async fetchOsmWithinArea(queryArea: { geocodeArea: string; areas: string[] }): Promise<OverpassApiResponse> {
    // Try cache first
    const cacheKey = this.getCacheKey(queryArea, false);
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    // Fetch from API
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

      allWaysSelectors.push(`.ways${i};`);
    });

    // 3. Combine everything into a full query with readable indentation
    const query = `
      [
        out:json
      ];

      ${geocodeLine}
      ${subAreaLines.map((l) => `  ${l}`).join('\n')}

      ( ${allWaysSelectors.join('')} )->.allWays;
      ( .allWays; >; );

      out body;
    `;

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log('Fetching OSM data from Overpass API...');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Store in cache for future use
    await this.cache.set(cacheKey, data);

    return data;
  }

  private async fetchBoundariesOsmWithinArea(queryArea: {
    geocodeArea: string;
    areas: string[];
  }): Promise<OverpassApiResponse> {
    // Try cache first
    const cacheKey = this.getCacheKey(queryArea, true);
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    // Fetch from API
    // ------------------------------------------------------------------------
    // Example of the query:
    //
    // [out:json][timeout:25];
    // area["name"="<geocodeArea>"]->.<mainAreaAlias>;
    //
    // relation["name"="<area1>"](area.<mainAreaAlias>)->.rel1;
    // way(r.rel1)->.ways1;
    // ...
    //
    // (.ways1; .ways2; ...;)->.allWays;
    //
    // (.allWays; >;);
    //
    // out skel;
    // ------------------------------------------------------------------------

    const mainAreaAlias = 'areaMain';

    // 1. Line to select the main area by name
    const mainAreaLine = `area["name"="${queryArea.geocodeArea}"]->.${mainAreaAlias};`;

    // 2. For each requested sub-area, select the relation inside the main area and
    //    then select all ways belonging to that relation.
    const relationLines: string[] = [];
    const waysLines: string[] = [];
    const waysSelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      relationLines.push(`relation["name"="${areaName}"](area.${mainAreaAlias})->.rel${i};`);
      waysLines.push(`way(r.rel${i})->.ways${i};`);
      waysSelectors.push(`.ways${i};`);
    });

    // 3. Assemble the final Overpass QL query string.
    const query = `
      [out:json][timeout:50];

      ${mainAreaLine}

      ${relationLines.join('\n')}
      ${waysLines.join('\n')}

      ( ${waysSelectors.join(' ')} )->.allWays;

      (.allWays; >;);

      out skel;
    `;

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log('Fetching OSM boundaries from Overpass API...');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Store in cache for future use
    await this.cache.set(cacheKey, data);

    return data;
  }
}
