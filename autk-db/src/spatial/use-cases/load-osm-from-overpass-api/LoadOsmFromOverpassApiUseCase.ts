import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { LoadOsmParams, OsmElement, OnLoadingProgress } from './interfaces';
import { OsmTable } from '../../../shared/interfaces';

interface OsmExecResult {
  tables: OsmTable[];
  osmElementCount: number;
  boundaryElementCount: number;
  osmDataProcessingMs: number;
  boundariesProcessingMs: number;
}
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

  private getCacheKey(queryArea: { geocodeArea: string; areas: string[] }): string {
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-combined-v2-${queryArea.geocodeArea}-${areas}`;
  }

  async exec(params: LoadOsmParams): Promise<OsmExecResult> {
    if (!params.queryArea) throw new Error('queryArea must be provided');
    const workspace = params.workspace || 'main';
    const onProgress = params.onProgress;

    // Single API call for both datasets
    const combined = await this.fetchCombinedOsmData(params.queryArea, onProgress);
    const { osmData, boundariesData } = this.splitCombinedResponse(combined);
    console.log(`[autk-db] Split: ${osmData.elements.length} OSM elements, ${boundariesData.elements.length} boundary elements`);

    onProgress?.('processing-osm-data');
    const t0 = performance.now();
    await this.insertOsmDataUsingJson(params.outputTableName, osmData, workspace);
    const osmDataProcessingMs = performance.now() - t0;
    console.log(`Successfully inserted ${osmData.elements.length} OSM elements into ${params.outputTableName}`);

    onProgress?.('processing-boundaries');
    const t1 = performance.now();
    await this.insertOsmDataUsingJson(`${params.outputTableName}_boundaries`, boundariesData, workspace, true);
    const boundariesProcessingMs = performance.now() - t1;
    console.log(
      `Successfully inserted ${boundariesData.elements.length} boundaries into ${params.outputTableName}_boundaries`,
    );

    const qualifiedTableName = `${workspace}.${params.outputTableName}`;
    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${qualifiedTableName}`);
    const columns = getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray());

    return {
      tables: [
        { source: 'osm', type: 'pointset', name: params.outputTableName, columns },
        { source: 'osm', type: 'pointset', name: `${params.outputTableName}_boundaries`, columns },
      ],
      osmElementCount: osmData.elements.length,
      boundaryElementCount: boundariesData.elements.length,
      osmDataProcessingMs,
      boundariesProcessingMs,
    };
  }

  /**
   * Split a combined Overpass response into main OSM data and boundary data.
   *
   * The combined response includes the boundary relations so we can read their
   * member way IDs. Relations are excluded from both output tables — they were
   * only fetched to identify which ways form the area boundaries.
   */
  private splitCombinedResponse(combined: OverpassApiResponse): {
    osmData: OverpassApiResponse;
    boundariesData: OverpassApiResponse;
  } {
    const elements = combined.elements ?? [];

    // 1. Collect boundary way IDs from relation members
    const boundaryWayIds = new Set<number>();
    for (const element of elements) {
      if (element.type === 'relation' && element.members) {
        for (const member of element.members) {
          if (member.type === 'way') boundaryWayIds.add(member.ref);
        }
      }
    }

    // 2. Main OSM data: all nodes and ways (relations excluded — not used downstream)
    const osmData: OverpassApiResponse = {
      elements: elements.filter(e => e.type !== 'relation'),
    };

    // 3. Boundary data: ways that form the boundary relations + their nodes
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
   * Format OSM data into the exact structure expected by our table schema.
   *
   * With `out geom;`, way elements carry both `nodes` (real OSM IDs, needed so
   * the closed-way check `refs[0] === refs[last]` still works) and `geometry`
   * (inline lat/lon coordinates, so we never need a separate node-recursion
   * step on the server side).  We synthesise node records from the geometry
   * and deduplicate them by ID, matching the assumption of the SQL layer
   * queries that each node ID appears exactly once in the table.
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
    // Track which node IDs we have already emitted to avoid duplicate records.
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
          // Standalone nodes (present when using `out body` instead of `out geom`).
          if (element.lat !== undefined && element.lon !== undefined) {
            emitNode(element.id, element.lat, element.lon);
          }
          break;

        case 'way': {
          const refs: number[] = element.nodes ?? [];

          if (element.geometry && element.geometry.length > 0 && element.nodes) {
            // `out geom` path: geometry is inlined; synthesise node records so
            // the SQL join in LOAD_LAYER_QUERY can find coordinates by node ID.
            for (let i = 0; i < element.nodes.length; i++) {
              const geo = element.geometry[i];
              if (geo) emitNode(element.nodes[i], geo.lat, geo.lon);
            }
          }

          formattedElements.push({
            kind: 'way',
            id: element.id,
            tags: element.tags ? Object.entries(element.tags).map(([k, v]) => ({ k, v })) : [],
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
   * Fetch a URL from the Overpass API with automatic retry.
   *
   * Retryable conditions (per Overpass API docs):
   *  - 429 Too Many Requests – no concurrent slots; wait ≥15 s before retry.
   *  - 503 Service Unavailable – transient server overload.
   *  - 504 Gateway Timeout – can be a transient overload (not just a heavy
   *    query), especially when it follows a 429. Retried with a longer delay.
   *  - Network-level errors (fetch throws) – connection reset, timeout, etc.
   *
   * Backoff per status:
   *  - 429 / 503 / network: 15 s → 30 s → 60 s → 120 s (±10 % jitter)
   *  - 504: 30 s → 60 s → 120 s → 180 s (server needs more recovery time)
   */
  private async fetchWithRetry(url: string): Promise<Response> {
    const MAX_RETRIES = 4;
    const BACKOFF_429_MS = [15_000, 30_000,  60_000, 120_000];
    const BACKOFF_504_MS = [30_000, 60_000, 120_000, 180_000];

    const jitter = (ms: number) => ms * (0.9 + Math.random() * 0.2); // ±10 %
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const isRetryable = (status: number) => status === 429 || status === 503 || status === 504;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;

      try {
        response = await fetch(url);
      } catch (networkErr) {
        if (attempt < MAX_RETRIES) {
          const ms = jitter(BACKOFF_429_MS[attempt] ?? 120_000);
          console.warn(
            `[autk-db] Overpass API network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${networkErr}. ` +
            `Retrying in ${(ms / 1000).toFixed(0)} s…`,
          );
          await wait(ms);
          continue;
        }
        throw networkErr;
      }

      if (response.ok) return response;

      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        const backoff = response.status === 504 ? BACKOFF_504_MS : BACKOFF_429_MS;
        const ms = jitter(backoff[attempt] ?? 180_000);
        console.warn(
          `[autk-db] Overpass API ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}). ` +
          `Retrying in ${(ms / 1000).toFixed(0)} s…`,
        );
        await wait(ms);
        continue;
      }

      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    throw new Error('Overpass API: max retries exceeded');
  }

  /**
   * Build a single Overpass QL query that fetches both the area data and the
   * boundary relation geometry in one round-trip.
   *
   * Spatial filtering uses the pre-indexed `area` type directly — this is
   * significantly faster than `relation + map_to_area` because areas are
   * already stored as indexed objects in the Overpass database.  The
   * `relation` is still fetched alongside so the caller can read member way
   * IDs and identify which ways form each area boundary.
   */
  private buildCombinedQuery(queryArea: { geocodeArea: string; areas: string[] }): string {
    const geocodeAlias = 'areaMain';
    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.${geocodeAlias};`;

    const areaLines: string[] = [];
    const allSelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      // Use the pre-indexed area object for spatial filtering (fast).
      areaLines.push(`area["name"="${areaName}"](area.${geocodeAlias})->.area${i};`);
      // Keep the relation to identify boundary member ways downstream.
      areaLines.push(`relation["name"="${areaName}"](area.${geocodeAlias})->.rel${i};`);
      areaLines.push(`(
        way["highway"](area.area${i});
        way["building"](area.area${i});
        way["building:part"](area.area${i});
        way["landuse"](area.area${i});
        way["leisure"](area.area${i});
        way["natural"](area.area${i});
        way["water"](area.area${i});
        way["waterway"](area.area${i});
        way["amenity"](area.area${i});
      )->.dataWays${i};`);
      areaLines.push(`way(r.rel${i})->.boundaryWays${i};`);

      allSelectors.push(`.rel${i};`);
      allSelectors.push(`.dataWays${i};`);
      allSelectors.push(`.boundaryWays${i};`);
    });

    return `
      [out:json][timeout:180][maxsize:536870912];

      ${geocodeLine}
      ${areaLines.join('\n      ')}

      ( ${allSelectors.join(' ')} );
      out geom;
    `;
  }

  /**
   * Fetch OSM data for both the main dataset and boundary geometry in a single
   * Overpass API request. Result is cached for 24 h using the Browser Cache API.
   */
  private async fetchCombinedOsmData(
    queryArea: { geocodeArea: string; areas: string[] },
    onProgress?: OnLoadingProgress,
  ): Promise<OverpassApiResponse> {
    const cacheKey = this.getCacheKey(queryArea);
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    const query = this.buildCombinedQuery(queryArea);
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log('Fetching OSM data from Overpass API...');
    onProgress?.('querying-osm-server');

    const response = await this.fetchWithRetry(url);

    onProgress?.('downloading-osm-data');
    const data = await response.json();

    const elementCount = Array.isArray(data.elements) ? data.elements.length : 0;
    console.log(`[autk-db] Overpass API returned ${elementCount} elements`);

    if (!Array.isArray(data.elements) || elementCount === 0) {
      console.warn('[autk-db] Overpass API returned no elements — skipping cache. Full response:', JSON.stringify(data).slice(0, 500));
      return { elements: [] };
    }

    await this.cache.set(cacheKey, data);
    return data;
  }
}
