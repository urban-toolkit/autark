import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { LoadOsmParams, OsmElement, OnLoadingProgress } from './interfaces';
import { OsmTable } from '../../../shared/interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { CREATE_OSM_TABLE_QUERY, INSERT_OSM_DATA_QUERY } from './queries';
import { HttpCache } from '../../../shared/HttpCache';

interface OverpassApiResponse {
  elements: OsmElement[];
}

interface OsmExecResult {
  tables: OsmTable[];
  osmElementCount: number;
  boundaryElementCount: number;
  osmDataProcessingMs: number;
  boundariesProcessingMs: number;
}

type OverpassTagSelectors = {
  way: string[];
  relation: string[];
};

const PARKS_LEISURE_VALUES = ['dog_park', 'park', 'playground', 'recreation_ground'] as const;
const PARKS_LANDUSE_VALUES = ['wood', 'grass', 'forest', 'orchard', 'village_green', 'vineyard', 'cemetery', 'meadow'] as const;
const PARKS_NATURAL_VALUES = ['wood', 'grass', 'grassland', 'forest', 'scrub', 'heath', 'meadow'] as const;

const WATER_NATURAL_VALUES = ['water', 'wetland', 'strait', 'spring'] as const;
const WATER_WATER_VALUES = ['pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river'] as const;

const EXCLUDED_ROAD_HIGHWAY_VALUES = ['cycleway', 'elevator', 'footway', 'steps', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway'] as const;
const BUILDING_HEIGHT_KEYS = ['height', 'levels', 'building:levels'] as const;

export class LoadOsmFromOverpassApiUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;
  private cache: HttpCache<OverpassApiResponse>;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
    this.cache = new HttpCache('overpass-api-cache', 24 * 60 * 60 * 1000); // 24h TTL
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async exec(params: LoadOsmParams): Promise<OsmExecResult> {
    if (!params.queryArea) throw new Error('queryArea must be provided');
    const workspace = params.workspace || 'main';
    const onProgress = params.onProgress;

    const combined = await this.fetchCombinedOsmData(params.queryArea, params.autoLoadLayers?.layers, onProgress);

    // Verify every requested area has an admin boundary relation in the response.
    const relationNames = new Set(
      combined.elements
        .filter(e => e.type === 'relation' && e.tags?.name)
        .map(e => e.tags!.name),
    );
    const missingAreas = params.queryArea.areas.filter(area => !relationNames.has(area));
    if (missingAreas.length > 0) {
      throw new Error(
        `No administrative boundary found in OSM for: ${missingAreas.map(a => `"${a}"`).join(', ')}. ` +
        `Verify the area names match OSM relation names exactly (check openstreetmap.org).`,
      );
    }

    const { osmData, boundariesData } = this.splitCombinedResponse(combined, params.queryArea);
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
    console.log(`Successfully inserted ${boundariesData.elements.length} boundaries into ${params.outputTableName}_boundaries`);

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

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  private getCacheKey(queryArea: { geocodeArea: string; areas: string[] }, layers?: string[]): string {
    const areas = [...queryArea.areas].sort().join(',');
    const layerKey = layers && layers.length > 0 ? `-layers:${[...layers].sort().join('+')}` : '';
    return `overpass-combined-v2-${queryArea.geocodeArea}-${areas}${layerKey}`;
  }

  private getFullDataCacheKey(queryArea: { geocodeArea: string; areas: string[] }): string {
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-combined-v2-${queryArea.geocodeArea}-${areas}`;
  }

  // ---------------------------------------------------------------------------
  // Overpass fetch orchestration
  // ---------------------------------------------------------------------------

  /**
   * Fetches OSM data as four independent requests — boundaries, parks+water,
   * roads, buildings — so each request is smaller and less likely to trigger a
   * 504. A pause between requests avoids immediate rate-limiting. Results are
   * cached for 24h.
   *
   * `geocodeArea` (e.g. "New York") is used only as a disambiguation scope.
   * All data is spatially constrained to the entries in `queryArea.areas`.
   */
  private async fetchCombinedOsmData(
    queryArea: { geocodeArea: string; areas: string[] },
    layers: string[] | undefined,
    onProgress?: OnLoadingProgress,
  ): Promise<OverpassApiResponse> {
    const cacheKey = this.getCacheKey(queryArea, layers);
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    // A full-data cache entry (no layer filter) is a valid superset — reuse it.
    const fullDataCacheKey = this.getFullDataCacheKey(queryArea);
    if (fullDataCacheKey !== cacheKey) {
      const fullData = await this.cache.get(fullDataCacheKey);
      if (fullData) return fullData;
    }

    const requestedLayers = layers && layers.length > 0 ? layers : ['roads', 'buildings', 'parks', 'water'];
    const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const BETWEEN_REQUESTS_MS = 3_000;

    onProgress?.('querying-osm-server');

    // Request 1: boundaries (always needed, always small)
    console.log('[autk-db] Fetching boundary data from Overpass API…');
    const boundariesResponse = await this.fetchWithRetry(this.buildBoundariesQuery(queryArea));
    onProgress?.('downloading-osm-data');
    let combined: OverpassApiResponse = await boundariesResponse.json();
    console.log(`[autk-db] Boundaries: ${combined.elements?.length ?? 0} elements`);

    // Requests 2–4: one per layer group, skipped when not requested.
    // Buildings are fetched as a 2×2 tiled grid to stay within Overpass maxsize limits.
    const layerGroups: [string, string[]][] = [
      ['parks+water', ['parks', 'water']],
      ['roads',       ['roads']],
      ['buildings',   ['buildings']],
    ];

    let anyGroupEmpty = false;

    for (const [label, group] of layerGroups) {
      const activeGroup = group.filter(l => requestedLayers.includes(l));
      if (activeGroup.length === 0) continue;

      if (activeGroup.includes('buildings')) {
        const bbox = this.computeBboxFromElements(combined.elements ?? []);
        const tileQueries = bbox
          ? this.buildBuildingsTileQueries(queryArea, bbox)
          : [this.buildLayerGroupQuery(queryArea, activeGroup)!];

        let buildingsTotal = 0;
        for (let t = 0; t < tileQueries.length; t++) {
          await pause(BETWEEN_REQUESTS_MS);
          console.log(`[autk-db] Fetching buildings tile ${t + 1}/${tileQueries.length}…`);
          const response = await this.fetchWithRetry(tileQueries[t]);
          const data: OverpassApiResponse = await response.json();
          const count = data.elements?.length ?? 0;
          console.log(`[autk-db] buildings tile ${t + 1}: ${count} elements`);
          buildingsTotal += count;
          combined = this.mergeResponses(combined, data);
        }
        if (buildingsTotal === 0) {
          console.warn('[autk-db] buildings: 0 elements across all tiles — skipping cache.');
          anyGroupEmpty = true;
        }
        continue;
      }

      const query = this.buildLayerGroupQuery(queryArea, activeGroup);
      if (!query) continue;

      await pause(BETWEEN_REQUESTS_MS);
      console.log(`[autk-db] Fetching ${label} data from Overpass API…`);
      const response = await this.fetchWithRetry(query);
      const data: OverpassApiResponse = await response.json();
      const count = data.elements?.length ?? 0;
      console.log(`[autk-db] ${label}: ${count} elements`);
      if (count === 0) {
        console.warn(`[autk-db] ${label}: 0 elements — skipping cache.`);
        anyGroupEmpty = true;
      }
      combined = this.mergeResponses(combined, data);
    }

    if (anyGroupEmpty) {
      return combined;
    }

    await this.cache.set(cacheKey, combined);
    return combined;
  }

  // ---------------------------------------------------------------------------
  // Overpass HTTP — slot checking and retry
  // ---------------------------------------------------------------------------

  private static readonly OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  private static readonly OVERPASS_STATUS_ENDPOINT = 'https://overpass-api.de/api/status';

  // Query [timeout] is stepped down on each consecutive 504 / network rejection
  // to make the request look cheaper to the server.
  private static readonly QUERY_TIMEOUTS_S = [60, 45, 30, 20, 15, 10];

  private static setQueryTimeout(query: string, timeoutS: number): string {
    return query.replace(/\[timeout:\d+\]/, `[timeout:${timeoutS}]`);
  }

  /**
   * Polls the Overpass status endpoint until a slot is free, then returns.
   * Fails silently — a status check error never blocks the actual request.
   */
  private async waitForSlot(): Promise<void> {
    const POLL_INTERVAL_MS = 3_000;
    const MAX_CHECKS = 60; // bail out after ~3 min of polling
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    for (let check = 0; check < MAX_CHECKS; check++) {
      try {
        const res = await fetch(LoadOsmFromOverpassApiUseCase.OVERPASS_STATUS_ENDPOINT);
        if (!res.ok) return;
        const text = await res.text();

        const available = text.match(/(\d+) slots available now/);
        if (available && parseInt(available[1]) > 0) return;

        const waitTimes = [...text.matchAll(/in (\d+) seconds/g)].map(m => parseInt(m[1]));
        if (waitTimes.length === 0) return;

        const nextFreeS = Math.min(...waitTimes);
        console.log(`[autk-db] No Overpass slots available (next free in ${nextFreeS}s). Waiting…`);
        await wait(POLL_INTERVAL_MS);
      } catch {
        return;
      }
    }
  }

  /**
   * POSTs a query to the Overpass API with slot checking and automatic retry.
   *
   * POST is used so large queries are never truncated by proxy URL-length limits.
   * Before each top-level call the slot status is checked and waited on.
   *
   * Retryable conditions:
   *  - 429 / 503 — server overloaded; backoff: 20s → 45s → 90s → 120s → 180s → 240s
   *  - 504 / ERR_EMPTY_RESPONSE / fetch timeout — proxy rejection; backoff:
   *    10s → 20s → 45s → 90s → 120s → 180s, plus [timeout] in the query is
   *    stepped down (60s → 45s → 30s → 20s → 15s → 10s) so each retry looks
   *    cheaper to the server.
   *
   * All backoff values have ±10% jitter. The fetch-level AbortController
   * deadline is derived from the current query [timeout] + 30s overhead.
   */
  private async fetchWithRetry(query: string): Promise<Response> {
    const MAX_RETRIES = 6;
    const FETCH_OVERHEAD_MS = 30_000;
    const BACKOFF_429_MS = [20_000,  45_000,  90_000, 120_000, 180_000, 240_000];
    const BACKOFF_504_MS = [10_000,  20_000,  45_000,  90_000, 120_000, 180_000];

    const endpoint = LoadOsmFromOverpassApiUseCase.OVERPASS_ENDPOINT;
    const jitter = (ms: number) => ms * (0.9 + Math.random() * 0.2);
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const isRetryable = (status: number) => status === 429 || status === 503 || status === 504;

    await this.waitForSlot();

    let consecutive504s = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const queryTimeoutS = LoadOsmFromOverpassApiUseCase.QUERY_TIMEOUTS_S[consecutive504s] ?? 10;
      const fetchTimeoutMs = queryTimeoutS * 1000 + FETCH_OVERHEAD_MS;
      const activeQuery = LoadOsmFromOverpassApiUseCase.setQueryTimeout(query, queryTimeoutS);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
      let response: Response;

      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(activeQuery),
          signal: controller.signal,
        });
      } catch (networkErr) {
        clearTimeout(timeoutId);
        if (attempt < MAX_RETRIES) {
          const isTimeout = (networkErr as Error)?.name === 'AbortError';
          consecutive504s++;
          const nextTimeoutS = LoadOsmFromOverpassApiUseCase.QUERY_TIMEOUTS_S[consecutive504s] ?? 10;
          const ms = jitter(BACKOFF_504_MS[attempt] ?? 180_000);
          console.warn(
            `[autk-db] Overpass ${isTimeout ? 'fetch timeout' : 'network error'} ` +
            `(attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${networkErr}. ` +
            `Reducing query timeout ${queryTimeoutS}s → ${nextTimeoutS}s. ` +
            `Retrying in ${(ms / 1000).toFixed(0)}s…`,
          );
          await wait(ms);
          continue;
        }
        throw networkErr;
      }

      clearTimeout(timeoutId);

      if (response.ok) return response;

      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        const backoff = response.status === 504 ? BACKOFF_504_MS : BACKOFF_429_MS;
        const ms = jitter(backoff[attempt] ?? 240_000);
        if (response.status === 504) {
          consecutive504s++;
          const nextTimeoutS = LoadOsmFromOverpassApiUseCase.QUERY_TIMEOUTS_S[consecutive504s] ?? 10;
          console.warn(
            `[autk-db] Overpass 504 (attempt ${attempt + 1}/${MAX_RETRIES + 1}). ` +
            `Reducing query timeout ${queryTimeoutS}s → ${nextTimeoutS}s. ` +
            `Retrying in ${(ms / 1000).toFixed(0)}s…`,
          );
        } else {
          consecutive504s = 0;
          console.warn(
            `[autk-db] Overpass ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}). ` +
            `Retrying in ${(ms / 1000).toFixed(0)}s…`,
          );
        }
        await wait(ms);
        continue;
      }

      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    throw new Error('Overpass API: max retries exceeded');
  }

  // ---------------------------------------------------------------------------
  // Query builders
  // ---------------------------------------------------------------------------

  /**
   * Builds the boundaries query: admin relations + their member ways.
   * Relations are output with `body` only (tags + member IDs); ways get full
   * inline geometry via `out geom qt`.
   */
  private buildBoundariesQuery(queryArea: { geocodeArea: string; areas: string[] }): string {
    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.areaMain;`;
    const areaLines: string[] = [];
    const relSelectors: string[] = [];
    const boundaryWaySelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      areaLines.push(`area["name"="${areaName}"](area.areaMain)->.area${i};`);
      areaLines.push(`relation["name"="${areaName}"](area.areaMain)->.rel${i};`);
      areaLines.push(`way(r.rel${i})->.boundaryWays${i};`);
      relSelectors.push(`.rel${i};`);
      boundaryWaySelectors.push(`.boundaryWays${i};`);
    });

    return `
      [out:json][timeout:60][maxsize:134217728];

      ${geocodeLine}
      ${areaLines.join('\n      ')}

      ( ${relSelectors.join(' ')} );
      out body;

      ( ${boundaryWaySelectors.join(' ')} );
      out geom qt;
    `;
  }

  /**
   * Builds a query for a specific group of layers.
   * Returns null when no tag selectors apply to the given group (e.g. surface-only).
   */
  private buildLayerGroupQuery(
    queryArea: { geocodeArea: string; areas: string[] },
    layerGroup: string[],
  ): string | null {
    const tagSelectors = this.getTagSelectorsForLayers(layerGroup);
    if (tagSelectors.way.length === 0 && tagSelectors.relation.length === 0) return null;

    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.areaMain;`;
    const areaLines: string[] = [];
    const dataWaySelectors: string[] = [];
    const dataRelationSelectors: string[] = [];
    const relationWaySelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      areaLines.push(`area["name"="${areaName}"](area.areaMain)->.area${i};`);
      if (tagSelectors.way.length > 0) {
        areaLines.push(`(
        ${tagSelectors.way.map(filter => `way[${filter}](area.area${i});`).join('\n        ')}
      )->.dataWays${i};`);
        dataWaySelectors.push(`.dataWays${i};`);
      }
      if (tagSelectors.relation.length > 0) {
        areaLines.push(`(
        ${tagSelectors.relation.map(filter => `relation[${filter}](area.area${i});`).join('\n        ')}
      )->.dataRelations${i};`);
        areaLines.push(`way(r.dataRelations${i})->.dataRelationWays${i};`);
        dataRelationSelectors.push(`.dataRelations${i};`);
        relationWaySelectors.push(`.dataRelationWays${i};`);
      }
    });

    const allWaySelectors = [...dataWaySelectors, ...relationWaySelectors];
    const relationOutput = dataRelationSelectors.length > 0
      ? `
      ( ${dataRelationSelectors.join(' ')} );
      out body;`
      : '';
    const wayOutput = allWaySelectors.length > 0
      ? `
      ( ${allWaySelectors.join(' ')} );
      out geom qt;`
      : '';

    return `
      [out:json][timeout:60][maxsize:268435456];

      ${geocodeLine}
      ${areaLines.join('\n      ')}
      ${relationOutput}
      ${wayOutput}
    `;
  }

  /**
   * Returns Overpass tag filter expressions for the requested layers.
   * Uses value-level specificity for `natural` to avoid fetching unused types
   * (coastline, beach, cliff, etc.). `surface` needs no selectors — its ways
   * come from `way(r.rel)` in the boundaries query.
   */
  private getTagSelectorsForLayers(layers: string[]): OverpassTagSelectors {
    const wayFilters = new Set<string>();
    const relationFilters = new Set<string>();

    for (const layer of layers) {
      switch (layer) {
        case 'roads':
          wayFilters.add(`"highway"]["area"!="yes"]["highway"!~"^(${EXCLUDED_ROAD_HIGHWAY_VALUES.join('|')})$"`);
          break;
        case 'buildings':
          BUILDING_HEIGHT_KEYS.forEach((heightKey) => {
            wayFilters.add(`"building"]["building"!="roof"]["${heightKey}"`);
            wayFilters.add(`"building:part"]["building:part"!="roof"]["${heightKey}"`);
            wayFilters.add(`"type"="building"]["${heightKey}"`);
          });
          break;
        case 'parks':
          wayFilters.add(this.buildExactValueSelector('leisure', PARKS_LEISURE_VALUES));
          wayFilters.add(this.buildExactValueSelector('landuse', PARKS_LANDUSE_VALUES));
          wayFilters.add(this.buildExactValueSelector('natural', PARKS_NATURAL_VALUES));
          relationFilters.add(this.buildExactValueSelector('leisure', PARKS_LEISURE_VALUES));
          relationFilters.add(this.buildExactValueSelector('landuse', PARKS_LANDUSE_VALUES));
          relationFilters.add(this.buildExactValueSelector('natural', PARKS_NATURAL_VALUES));
          break;
        case 'water':
          wayFilters.add(this.buildExactValueSelector('natural', WATER_NATURAL_VALUES));
          wayFilters.add(this.buildExactValueSelector('water', WATER_WATER_VALUES));
          relationFilters.add(this.buildExactValueSelector('natural', WATER_NATURAL_VALUES));
          relationFilters.add(this.buildExactValueSelector('water', WATER_WATER_VALUES));
          break;
        case 'surface':
          break;
      }
    }

    return {
      way: [...wayFilters],
      relation: [...relationFilters],
    };
  }

  private buildExactValueSelector(key: string, values: readonly string[]): string {
    return `"${key}"~"^(${values.join('|')})$"`;
  }

  /**
   * Derives the bounding box from boundary elements already in memory.
   * Uses node lat/lon and way inline geometry produced by `out geom qt`.
   */
  private computeBboxFromElements(
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

  /**
   * Returns `cols × rows` Overpass queries that together cover `bbox`, each
   * using a combined area + tile-bbox filter so only features inside both the
   * named OSM area and the tile are returned.  256 MB maxsize per tile keeps
   * each response well within Overpass limits.
   */
  private buildBuildingsTileQueries(
    queryArea: { geocodeArea: string; areas: string[] },
    bbox: { south: number; north: number; west: number; east: number },
    cols = 2,
    rows = 2,
  ): string[] {
    const latStep = (bbox.north - bbox.south) / rows;
    const lonStep = (bbox.east - bbox.west) / cols;
    const queries: string[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const south = bbox.south + row * latStep;
        const north = south + latStep;
        const west  = bbox.west  + col * lonStep;
        const east  = west  + lonStep;
        const tileBbox = `${south},${west},${north},${east}`;

        const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.areaMain;`;
        const areaLines: string[] = [];
        const dataWaySelectors: string[] = [];

        queryArea.areas.forEach((areaName, idx) => {
          const i = idx + 1;
          areaLines.push(`area["name"="${areaName}"](area.areaMain)->.area${i};`);
          areaLines.push(`(
        way["building"](area.area${i})(${tileBbox});
        way["building:part"](area.area${i})(${tileBbox});
      )->.dataWays${i};`);
          dataWaySelectors.push(`.dataWays${i};`);
        });

        queries.push(`
      [out:json][timeout:60][maxsize:268435456];

      ${geocodeLine}
      ${areaLines.join('\n      ')}

      ( ${dataWaySelectors.join(' ')} );
      out geom qt;
    `);
      }
    }

    return queries;
  }

  // ---------------------------------------------------------------------------
  // Response processing
  // ---------------------------------------------------------------------------

  /**
   * Splits the merged Overpass response into two datasets:
   * - `osmData`: all nodes, ways, and non-boundary relations
   * - `boundariesData`: only the ways that form admin boundary rings + their nodes
   */
  private splitCombinedResponse(
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

  private getBoundaryRelationIds(elements: OsmElement[], areaNames: string[]): Set<number> {
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
      tags.type === 'building';

    return hasBuildingKind && BUILDING_HEIGHT_KEYS.some((key) => tags[key] !== undefined);
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

  /** Merges two Overpass responses, deduplicating nodes by ID. */
  private mergeResponses(a: OverpassApiResponse, b: OverpassApiResponse): OverpassApiResponse {
    const nodeIds = new Set(a.elements.filter(e => e.type === 'node').map(e => e.id));
    const dedupedB = b.elements.filter(e => e.type !== 'node' || !nodeIds.has(e.id));
    return { elements: [...a.elements, ...dedupedB] };
  }

  // ---------------------------------------------------------------------------
  // DuckDB insertion
  // ---------------------------------------------------------------------------

  private async insertOsmDataUsingJson(
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
    const fileName = 'osm_data.json';

    await this.db.registerFileText(fileName, JSON.stringify(formattedElements));
    await this.conn.query(CREATE_OSM_TABLE_QUERY(tableName, workspace));
    await this.conn.query(INSERT_OSM_DATA_QUERY(tableName, fileName, workspace, ignoreTags));

    try {
      await this.db.dropFile(fileName);
    } catch (e) {
      console.warn(`Failed to cleanup file ${fileName}:`, e);
    }
  }

  /**
   * Converts a raw Overpass response into the flat record format expected by
   * the DuckDB table schema.
   *
   * Ways returned with `out geom` carry both `nodes` (real OSM node IDs,
   * needed for the closed-way check `refs[0] === refs[last]`) and `geometry`
   * (inline lat/lon per node). Synthetic node records are emitted from the
   * inline geometry so the SQL layer queries can join on node ID without a
   * separate server-side node-recursion step.
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
}
