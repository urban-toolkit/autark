import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import {
  LoadOsmParams,
  OsmElement,
  OnLoadingProgress,
  OsmNamedArea,
  OsmQueryArea,
  OsmTagFilter,
  OsmTagSet,
  boundingBoxOf,
  checkTagSets,
  isBoundingBoxArea,
} from './interfaces';
import { OsmTable } from '../../interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { HttpCache } from '../../http-cache';
import {
  PARKS_LEISURE_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
  EXCLUDED_BUILDING_VALUES,
  EXCLUDED_ROADS_VALUES,
  DEFAULT_WORKSPACE_NAME,
} from '../../consts';

import { OsmProcessingPipeline } from '../../internal/process-osm/pipeline';

/**
 * Internal shape for a parsed Overpass API JSON response.
 */
interface OverpassApiResponse {
  elements: OsmElement[];
}

/**
 * Aggregate execution result returned by the Overpass import use case.
 */
interface OsmExecResult {
  tables: OsmTable[];
  osmElementCount: number;
  boundaryElementCount: number;
  osmDataProcessingMs: number;
  boundariesProcessingMs: number;
}

/**
 * Internal structure describing tag selector arrays for Overpass queries.
 */
type OverpassTagSelectors = {
  way: string[];
  relation: string[];
};

/** An Overpass QL string literal. */
function qlString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `["key"]` or `["key"="value"]`: an exact match, never a regular expression. */
function tagSelector(tag: OsmTagFilter): string {
  return tag.value === undefined ? `[${qlString(tag.key)}]` : `[${qlString(tag.key)}=${qlString(tag.value)}]`;
}

/** Every distinct selector across the tag sets, sorted: what the tag query asks for. */
function tagSelectors(tagSets: OsmTagSet[]): string[] {
  return [...new Set(tagSets.flatMap((set) => set.tags.map(tagSelector)))].sort();
}

/**
 * Loads OSM data from the Overpass API with caching, retry, and slot polling.
 *
 * The use case fetches boundaries first, then requested layer groups (parks, water, roads, buildings),
 * merges responses, inserts normalized OSM elements into DuckDB, and returns table metadata and timings.
 */
export class LoadOsmFromOverpassApiUseCase {
  private readonly conn: AsyncDuckDBConnection;
  private readonly cache: HttpCache<OverpassApiResponse>;
  private readonly pipeline: OsmProcessingPipeline;

  /**
   * @param conn - Active DuckDB connection used for inserting and describing tables.
   * @param pipeline - Shared OSM processing pipeline for splitting and inserting data.
   */
  constructor(conn: AsyncDuckDBConnection, pipeline: OsmProcessingPipeline) {
    this.conn = conn;
    this.cache = new HttpCache('overpass-api-cache', 24 * 60 * 60 * 1000); // 24h TTL
    this.pipeline = pipeline;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Performs the full Overpass data fetch and loads it into DuckDB.
   *
   * @param params - Configuration for the Overpass area, optional PBF fallback, and auto-load settings.
   * @returns Execution result including created table metadata and timing statistics.
   * @throws When required administrative boundaries are missing or network/fetch failures occur.
   * @example
   * const useCase = new LoadOsmFromOverpassApiUseCase(conn, pipeline);
   * const result = await useCase.exec({ queryArea: { geocodeArea: 'Berlin', areas: ['Berlin'] }, autoLoadLayers: { layers: ['roads'] } });
   */
  async exec(params: LoadOsmParams): Promise<OsmExecResult> {
    const workspace = params.workspace || DEFAULT_WORKSPACE_NAME;
    const outputTableName = params.outputTableName || 'table_osm';
    const onProgress = params.onProgress;

    const queryArea = params.queryArea;
    // Checked before any request, so a malformed box or tag set costs Overpass nothing.
    const box = isBoundingBoxArea(queryArea) ? boundingBoxOf(queryArea) : null;
    const tagSets = checkTagSets(params.tagSets);

    const combined = await this.fetchCombinedOsmData(
      queryArea,
      params.autoLoadLayers.layers,
      tagSets,
      onProgress,
      params.forceRefresh,
    );

    let split: { osmData: OverpassApiResponse; boundariesData: OverpassApiResponse };
    if (box) {
      // A box is its own boundary: nothing to look up, nothing missing.
      split = { osmData: combined, boundariesData: this.pipeline.boundingBoxBoundary(box) };
    } else {
      const namedArea = queryArea as OsmNamedArea;
      // Verify every requested area has an admin boundary relation in the response.
      const relationNames = new Set(
        combined.elements
          .filter(e => e.type === 'relation' && e.tags?.name)
          .map(e => e.tags!.name),
      );
      const missingAreas = namedArea.areas.filter(area => !relationNames.has(area));
      if (missingAreas.length > 0) {
        throw new Error(
          `No administrative boundary found in OSM for: ${missingAreas.map(a => `"${a}"`).join(', ')}. ` +
          `Verify the area names match OSM relation names exactly (check openstreetmap.org).`,
        );
      }
      split = this.pipeline.splitCombinedResponse(combined, namedArea);
    }
    const { osmData, boundariesData } = split;
    console.log(`[autk-db] Split: ${osmData.elements.length} OSM elements, ${boundariesData.elements.length} boundary elements`);

    onProgress?.('processing-osm-data');
    const t0 = performance.now();
    await this.pipeline.insertOsmDataUsingJson(outputTableName, osmData, workspace);
    const osmDataProcessingMs = performance.now() - t0;
    console.log(`Successfully inserted ${osmData.elements.length} OSM elements into ${outputTableName}`);

    onProgress?.('processing-boundaries');
    const t1 = performance.now();
    await this.pipeline.insertOsmDataUsingJson(`${outputTableName}_boundaries`, boundariesData, workspace, true);
    const boundariesProcessingMs = performance.now() - t1;
    console.log(`Successfully inserted ${boundariesData.elements.length} boundaries into ${outputTableName}_boundaries`);

    const qualifiedTableName = `${workspace}.${outputTableName}`;
    const tableDescribeResponse = await this.conn.query(`DESCRIBE ${qualifiedTableName}`);
    const columns = getColumnsFromDuckDbTableDescribe(tableDescribeResponse.toArray());

    return {
      tables: [
        { source: 'osm', name: outputTableName, columns },
        { source: 'osm', name: `${outputTableName}_boundaries`, columns },
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

  /**
   * Builds a cache key for combined Overpass responses using the geocode area and requested layers.
   *
   * @param queryArea - Object containing the geocodeArea and area names.
   * @param layers - Optional list of requested layers to include in the cache key.
   * @param tagSets - Tag sets whose tags are part of the request.
   * @returns A stable cache key string.
   */
  private getCacheKey(queryArea: OsmQueryArea, layers?: string[], tagSets: OsmTagSet[] = []): string {
    const tagKey = tagSets.length > 0 ? `-tags:${JSON.stringify(tagSelectors(tagSets))}` : '';
    if (isBoundingBoxArea(queryArea)) {
      const layerKey = layers && layers.length > 0 ? `-${[...layers].sort().join(',')}` : '';
      return `overpass-combined-bbox-${queryArea.bbox.join(',')}${layerKey}${tagKey}`;
    }
    const areas = [...queryArea.areas].sort().join(',');
    const layerKey = layers && layers.length > 0 ? `-layers:${[...layers].sort().join('+')}` : '';
    return `overpass-combined-${queryArea.geocodeArea}-${areas}${layerKey}${tagKey}`;
  }

  /**
   * Builds the full-data cache key (no layer filtering) for Overpass responses.
   *
   * @param queryArea - Object containing the geocodeArea and area names.
   * @returns A cache key string for the full dataset.
   */
  private getFullDataCacheKey(queryArea: OsmQueryArea): string {
    if (isBoundingBoxArea(queryArea)) return `overpass-combined-bbox-${queryArea.bbox.join(',')}`;
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-combined-${queryArea.geocodeArea}-${areas}`;
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
   * A bounding box needs no boundaries request: the box is the boundary, and
   * every layer request is constrained to it.
   */
  private async fetchCombinedOsmData(
    queryArea: OsmQueryArea,
    layers: string[] | undefined,
    tagSets: OsmTagSet[],
    onProgress?: OnLoadingProgress,
    forceRefresh: boolean = false,
  ): Promise<OverpassApiResponse> {
    const cacheKey = this.getCacheKey(queryArea, layers, tagSets);
    if (!forceRefresh) {
      const cachedData = await this.cache.get(cacheKey);
      if (cachedData) {
        console.log(`[autk-db] Using cached Overpass data: ${cacheKey}`);
        return cachedData;
      }

      // A full-data cache entry (no layer filter) is a valid superset — reuse it.
      // It holds no tagged nodes, so it never answers a request with tag sets.
      const fullDataCacheKey = this.getFullDataCacheKey(queryArea);
      if (fullDataCacheKey !== cacheKey && tagSets.length === 0) {
        const fullData = await this.cache.get(fullDataCacheKey);
        if (fullData) {
          console.log(`[autk-db] Using cached Overpass full-data superset: ${fullDataCacheKey}`);
          return fullData;
        }
      }
    } else {
      console.log(`[autk-db] forceRefresh enabled — bypassing Overpass cache for: ${cacheKey}`);
    }

    const requestedLayers = layers && layers.length > 0
      ? layers
      : tagSets.length > 0 ? [] : ['roads', 'buildings', 'parks', 'water'];
    const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const BETWEEN_REQUESTS_MS = 3_000;

    onProgress?.('querying-osm-server');

    let combined: OverpassApiResponse;
    let boundariesBbox: { south: number; north: number; west: number; east: number } | null;
    if (isBoundingBoxArea(queryArea)) {
      combined = { elements: [] };
      boundariesBbox = boundingBoxOf(queryArea);
      onProgress?.('downloading-osm-data');
    } else {
      // Request 1: boundaries (always needed, always small)
      console.log('[autk-db] Fetching boundary data from Overpass API…');
      const boundariesResponse = await this.fetchWithRetry(this.buildBoundariesQuery(queryArea));
      onProgress?.('downloading-osm-data');
      const boundariesData: OverpassApiResponse = await boundariesResponse.json();
      console.log(`[autk-db] Boundaries: ${boundariesData.elements?.length ?? 0} elements`);
      combined = boundariesData;

      // Compute the area bbox once from boundary data only, independent of which
      // layers are requested, so parks/roads/etc. never pollute the extent.
      boundariesBbox = this.pipeline.computeBboxFromElements(boundariesData.elements ?? []);
    }

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
        const tileQueries = boundariesBbox
          ? this.buildBuildingsTileQueries(queryArea, boundariesBbox)
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

    // One request for every tag set, after the layers.
    if (tagSets.length > 0) {
      await pause(BETWEEN_REQUESTS_MS);
      console.log('[autk-db] Fetching tagged features from Overpass API…');
      const response = await this.fetchWithRetry(this.buildTagSetQuery(queryArea, tagSets));
      const data: OverpassApiResponse = await response.json();
      const count = data.elements?.length ?? 0;
      console.log(`[autk-db] tagged features: ${count} elements`);
      if (count === 0) {
        console.warn('[autk-db] tagged features: 0 elements — skipping cache.');
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
   * Overpass lines that bind `.area${i}` to the named area inside `.areaMain`:
   * the relation of that name within the geocode area, mapped to its area.
   * An `area["name"=...](area.areaMain)` statement would not be confined to
   * `.areaMain`, and would match every area of that name.
   */
  private namedAreaLines(areaName: string, i: number): string[] {
    return [
      `relation["name"="${areaName}"](area.areaMain)->.rel${i};`,
      `.rel${i} map_to_area->.area${i};`,
    ];
  }

  /**
   * Builds the one query for every tag set: the nodes, ways and relations in
   * the area that match any set's tags. Multipolygon relations come with their
   * member ways; other relations are left out. Nodes come with `out body`, so
   * with their tags.
   */
  private buildTagSetQuery(queryArea: OsmQueryArea, tagSets: OsmTagSet[]): string {
    const scopeLines: string[] = [];
    let filters: string[];
    if (isBoundingBoxArea(queryArea)) {
      const box = boundingBoxOf(queryArea);
      filters = [`(${box.south},${box.west},${box.north},${box.east})`];
    } else {
      scopeLines.push(`area["name"="${queryArea.geocodeArea}"]->.areaMain;`);
      filters = queryArea.areas.map((areaName, idx) => {
        scopeLines.push(...this.namedAreaLines(areaName, idx + 1));
        return `(area.area${idx + 1})`;
      });
    }
    const hits = filters.flatMap((filter) =>
      tagSelectors(tagSets).flatMap((selector) =>
        ['node', 'way', 'relation'].map((type) => `${type}${selector}${filter};`),
      ),
    );

    return `
      [out:json][timeout:60][maxsize:268435456];

      ${scopeLines.join('\n      ')}
      (
        ${hits.join('\n        ')}
      )->.tagHits;
      rel.tagHits["type"="multipolygon"]->.tagAreas;
      way(r.tagAreas)->.tagAreaWays;

      node.tagHits;
      out body;
      .tagAreas out body;
      ( way.tagHits; .tagAreaWays; );
      out geom qt;
    `;
  }

  /**
   * Builds a query for a specific group of layers.
   * Returns null when no tag selectors apply to the given group (e.g. surface-only).
   */
  private buildLayerGroupQuery(
    queryArea: OsmQueryArea,
    layerGroup: string[],
  ): string | null {
    const tagSelectors = this.getTagSelectorsForLayers(layerGroup);
    if (tagSelectors.way.length === 0 && tagSelectors.relation.length === 0) return null;
    if (isBoundingBoxArea(queryArea)) return this.buildBoundingBoxQuery(boundingBoxOf(queryArea), tagSelectors);

    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.areaMain;`;
    const areaLines: string[] = [];
    const dataWaySelectors: string[] = [];
    const dataRelationSelectors: string[] = [];
    const relationWaySelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      areaLines.push(...this.namedAreaLines(areaName, i));
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
          wayFilters.add(`"highway"]["area"!="yes"]["highway"!~"^(${EXCLUDED_ROADS_VALUES.join('|')})$"`);
          break;
        case 'buildings':
          wayFilters.add(`"building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}]`);
          wayFilters.add(`"building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}]`);
          wayFilters.add(`"type"="building"`);
          relationFilters.add(`"building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}]`);
          relationFilters.add(`"building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}]`);
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
          wayFilters.add(this.buildExactValueSelector('water', WATER_FEATURE_VALUES));
          relationFilters.add(this.buildExactValueSelector('natural', WATER_NATURAL_VALUES));
          relationFilters.add(this.buildExactValueSelector('water', WATER_FEATURE_VALUES));
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

  private buildExcludedValueSelector(key: string, values: readonly string[]): string {
    return `"${key}"!~"^(${values.join('|')})$"`;
  }

  /**
   * Returns `cols × rows` Overpass queries that together cover `bbox`, each
   * using a combined area + tile-bbox filter so only features inside both the
   * named OSM area and the tile are returned.  256 MB maxsize per tile keeps
   * each response well within Overpass limits.
   */
  private buildBuildingsTileQueries(
    queryArea: OsmQueryArea,
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

        if (isBoundingBoxArea(queryArea)) {
          // The tile is inside the box, so the tile alone constrains it.
          queries.push(this.buildBoundingBoxQuery({ south, north, west, east }, this.getTagSelectorsForLayers(['buildings'])));
          continue;
        }

        const geocodeLine = `area["name"="${queryArea.geocodeArea}"]->.areaMain;`;
        const areaLines: string[] = [];
        const dataWaySelectors: string[] = [];
        const dataRelationSelectors: string[] = [];
        const relationWaySelectors: string[] = [];

        queryArea.areas.forEach((areaName, idx) => {
          const i = idx + 1;
          areaLines.push(...this.namedAreaLines(areaName, i));
          areaLines.push(`(
        way["building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}](area.area${i})(${tileBbox});
        way["building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}](area.area${i})(${tileBbox});
        way["type"="building"](area.area${i})(${tileBbox});
      )->.dataWays${i};`);
          dataWaySelectors.push(`.dataWays${i};`);
          areaLines.push(`(
        relation["building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}](area.area${i})(${tileBbox});
        relation["building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}](area.area${i})(${tileBbox});
      )->.dataRelations${i};`);
          areaLines.push(`way(r.dataRelations${i})->.dataRelationWays${i};`);
          dataRelationSelectors.push(`.dataRelations${i};`);
          relationWaySelectors.push(`.dataRelationWays${i};`);
        });

        const allWaySelectors = [...dataWaySelectors, ...relationWaySelectors];

        queries.push(`
      [out:json][timeout:60][maxsize:268435456];

      ${geocodeLine}
      ${areaLines.join('\n      ')}

      ( ${dataRelationSelectors.join(' ')} );
      out body;

      ( ${allWaySelectors.join(' ')} );
      out geom qt;
    `);
      }
    }

    return queries;
  }

  /**
   * Builds a layer query for everything inside a WGS84 box. Same tag
   * selectors and output as the named-area queries, with the box as the only
   * spatial filter.
   */
  private buildBoundingBoxQuery(
    box: { south: number; north: number; west: number; east: number },
    tagSelectors: OverpassTagSelectors,
  ): string {
    const filter = `(${box.south},${box.west},${box.north},${box.east})`;
    const lines: string[] = [];
    const ways: string[] = [];
    const relations: string[] = [];
    if (tagSelectors.way.length > 0) {
      lines.push(`(
        ${tagSelectors.way.map(selector => `way[${selector}]${filter};`).join('\n        ')}
      )->.dataWays;`);
      ways.push('.dataWays;');
    }
    if (tagSelectors.relation.length > 0) {
      lines.push(`(
        ${tagSelectors.relation.map(selector => `relation[${selector}]${filter};`).join('\n        ')}
      )->.dataRelations;`);
      lines.push('way(r.dataRelations)->.dataRelationWays;');
      relations.push('.dataRelations;');
      ways.push('.dataRelationWays;');
    }
    const relationOutput = relations.length > 0 ? `
      ( ${relations.join(' ')} );
      out body;` : '';
    const wayOutput = ways.length > 0 ? `
      ( ${ways.join(' ')} );
      out geom qt;` : '';
    return `
      [out:json][timeout:60][maxsize:268435456];

      ${lines.join('\n      ')}
      ${relationOutput}
      ${wayOutput}
    `;
  }

  /** Merges two Overpass responses, deduplicating all elements by (type, id). */
  private mergeResponses(a: OverpassApiResponse, b: OverpassApiResponse): OverpassApiResponse {
    const existingIds = new Set<string>();
    for (const e of a.elements) {
      existingIds.add(`${e.type}:${e.id}`);
    }
    const dedupedB = b.elements.filter(e => !existingIds.has(`${e.type}:${e.id}`));
    return { elements: [...a.elements, ...dedupedB] };
  }

}
