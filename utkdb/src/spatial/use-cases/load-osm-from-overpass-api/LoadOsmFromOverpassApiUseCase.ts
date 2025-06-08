import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { Params, OsmElement, FormattedOsmNode, FormattedOsmWay, FormattedOsmRelation } from './interfaces';
import { OsmTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { CREATE_EMPTY_OSM_TABLE_QUERY, INSERT_OSM_BATCH_QUERY } from './queries';

interface OverpassApiResponse {
  elements: OsmElement[];
}

export class LoadOsmFromOverpassApiUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(conn: AsyncDuckDBConnection) {
    this.conn = conn;
  }

  async exec({ boundingBox, outputTableName }: Params): Promise<OsmTable> {
    // Step 1: Get data from Overpass API
    const osmData = await this.fetchOsmWithinBBox(boundingBox);
    console.log(`Fetched ${osmData.elements.length} OSM elements`);

    if (osmData.elements.length === 0) {
      throw new Error('No OSM elements found in the specified bounding box');
    }

    // Step 2: Create empty table
    const createEmptyTableQuery = CREATE_EMPTY_OSM_TABLE_QUERY(outputTableName);
    await this.conn.query(createEmptyTableQuery);

    // Step 3: Format OSM data for table insertion
    const { nodes, ways, relations } = this.formatOsmData(osmData);

    // Step 4: Insert formatted data in batches
    await this.insertOsmDataInBatches(outputTableName, { nodes, ways, relations });

    console.log(
      `Successfully inserted ${nodes.length} nodes, ${ways.length} ways, and ${relations.length} relations into ${outputTableName}`,
    );

    // Step 5: Get table description to return table metadata
    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${outputTableName}`);

    return {
      source: 'osm',
      type: 'pointset',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray()),
    };
  }

  /**
   * Format OSM data into arrays suitable for table insertion
   */
  private formatOsmData(osmData: OverpassApiResponse): {
    nodes: FormattedOsmNode[];
    ways: FormattedOsmWay[];
    relations: FormattedOsmRelation[];
  } {
    const nodes: FormattedOsmNode[] = [];
    const ways: FormattedOsmWay[] = [];
    const relations: FormattedOsmRelation[] = [];

    osmData.elements.forEach((element) => {
      switch (element.type) {
        case 'node':
          if (element.lat !== undefined && element.lon !== undefined) {
            nodes.push({
              kind: 'node',
              id: element.id,
              tags: element.tags || null,
              refs: null,
              lat: element.lat,
              lon: element.lon,
              ref_roles: null,
              ref_types: null,
            });
          }
          break;

        case 'way':
          ways.push({
            kind: 'way',
            id: element.id,
            tags: element.tags || null,
            refs: element.nodes || [],
            lat: null,
            lon: null,
            ref_roles: null,
            ref_types: null,
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

          relations.push({
            kind: 'relation',
            id: element.id,
            tags: element.tags || null,
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

    return { nodes, ways, relations };
  }

  /**
   * Insert OSM data in batches with different batch sizes for each element type
   */
  private async insertOsmDataInBatches(
    tableName: string,
    data: {
      nodes: FormattedOsmNode[];
      ways: FormattedOsmWay[];
      relations: FormattedOsmRelation[];
    },
  ): Promise<void> {
    const batchSizes = {
      nodes: 100,
      ways: 100,
      relations: 1,
    };

    // Insert nodes first
    console.log(`Inserting ${data.nodes.length} nodes in batches of ${batchSizes.nodes}...`);
    for (let i = 0; i < data.nodes.length; i += batchSizes.nodes) {
      const nodesBatch = data.nodes.slice(i, Math.min(i + batchSizes.nodes, data.nodes.length));
      const query = INSERT_OSM_BATCH_QUERY(tableName, {
        nodes: nodesBatch,
        ways: [],
        relations: [],
      });

      if (query.trim()) {
        await this.conn.query(query);
      }
    }
    console.log(`Inserted ${data.nodes.length} nodes`);

    // Insert ways second
    console.log(`Inserting ${data.ways.length} ways in batches of ${batchSizes.ways}...`);
    for (let i = 0; i < data.ways.length; i += batchSizes.ways) {
      const waysBatch = data.ways.slice(i, Math.min(i + batchSizes.ways, data.ways.length));
      const query = INSERT_OSM_BATCH_QUERY(tableName, {
        nodes: [],
        ways: waysBatch,
        relations: [],
      });

      if (query.trim()) {
        await this.conn.query(query);
      }
    }
    console.log(`Inserted ${data.ways.length} ways`);

    // Insert relations last
    console.log(`Inserting ${data.relations.length} relations in batches of ${batchSizes.relations}...`);
    for (let i = 0; i < data.relations.length; i += batchSizes.relations) {
      const relationsBatch = data.relations.slice(i, Math.min(i + batchSizes.relations, data.relations.length));
      const query = INSERT_OSM_BATCH_QUERY(tableName, {
        nodes: [],
        ways: [],
        relations: relationsBatch,
      });

      if (query.trim()) {
        await this.conn.query(query);
      }
    }
    console.log(`Inserted ${data.relations.length} relations`);
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
