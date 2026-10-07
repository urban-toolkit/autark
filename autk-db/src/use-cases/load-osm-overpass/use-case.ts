import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { LoadOsmParams, OsmElement, OnLoadingProgress, OsmNamedArea, OsmQueryArea, OsmTagSet, boundingBoxOf, checkTagSets, isBoundingBoxArea } from './interfaces';
import type { MultiPolygon } from 'geojson';
import { coastalLandMask } from '../../internal/process-osm-surface/coastline';
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
  /** WGS84 land mask; undefined retains the complete query-area surface. */
  surfaceMask?: MultiPolygon;
}

/**
 * Internal structure describing tag selector arrays for Overpass queries.
 */
type OverpassTagSelectors = {
  way: string[];
  relation: string[];
};

/** Canonical exact selectors per requested geometry family, independent of set names. */
function tagSelectors(sets: OsmTagSet[]): Record<OsmTagSet['type'], string[]> {
  const selectors = { points: new Set<string>(), polylines: new Set<string>(), polygons: new Set<string>() };
  for (const set of sets) {
    for (const tag of set.tags) {
      selectors[set.type].add(tag.value === undefined ? `[${JSON.stringify(tag.key)}]`
        : `[${JSON.stringify(tag.key)}=${JSON.stringify(tag.value)}]`);
    }
  }
  return { points: [...selectors.points].sort(), polylines: [...selectors.polylines].sort(), polygons: [...selectors.polygons].sort() };
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
    const box = isBoundingBoxArea(params.queryArea) ? boundingBoxOf(params.queryArea) : null;
    const tagSets = checkTagSets(params.tagSets);

    const combined = await this.fetchCombinedOsmData(
      params.queryArea,
      params.autoLoadLayers.layers,
      onProgress,
      params.forceRefresh,
      tagSets,
    );

    if (!isBoundingBoxArea(params.queryArea)) {
      const relationNames = new Set(combined.elements.filter(e => e.type === 'relation' && e.tags?.boundary && e.tags.name).map(e => e.tags!.name));
      const missingAreas = params.queryArea.areas.filter(area => !relationNames.has(area));
      if (missingAreas.length > 0) {
        throw new Error(
          `No area boundary found in OSM for: ${missingAreas.map(a => `"${a}"`).join(', ')}. ` +
          `Verify the area names match OSM relation names exactly (check openstreetmap.org).`,
        );
      }
    }
    const { osmData, boundariesData } = box
      ? { osmData: combined, boundariesData: this.pipeline.boundingBoxBoundary(box) }
      : this.pipeline.splitCombinedResponse(combined, params.queryArea as OsmNamedArea);
    const extent = box ?? this.pipeline.computeBboxFromElements(boundariesData.elements);
    if (!extent) throw new Error('Failed to compute query-area extent');
    const surfaceMask = coastalLandMask(combined.elements, extent);
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
      surfaceMask,
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
   * @returns A stable cache key string.
   */
  private getCacheKey(queryArea: OsmQueryArea, layers?: string[], tagSets: OsmTagSet[] = []): string {
    const tagKey = tagSets.length > 0 ? `-tag-sets-v1:${JSON.stringify(tagSelectors(tagSets))}` : '';
    const layerKey = layers && layers.length > 0 ? `-layers:${[...layers].sort().join('+')}` : '';
    if (isBoundingBoxArea(queryArea)) return `overpass-combined-v3-bbox-${queryArea.bbox.join(',')}${layerKey}${tagKey}`;
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-combined-v4-${queryArea.geocodeArea}-${areas}${layerKey}${tagKey}`;
  }

  /**
   * Builds the full-data cache key (no layer filtering) for Overpass responses.
   *
   * @param queryArea - Object containing the geocodeArea and area names.
   * @returns A cache key string for the full dataset.
   */
  private getFullDataCacheKey(queryArea: OsmQueryArea): string {
    if (isBoundingBoxArea(queryArea)) return `overpass-combined-v3-bbox-${queryArea.bbox.join(',')}`;
    const areas = [...queryArea.areas].sort().join(',');
    return `overpass-combined-v4-${queryArea.geocodeArea}-${areas}`;
  }

  // ---------------------------------------------------------------------------
  // Overpass fetch orchestration
  // ---------------------------------------------------------------------------

  /**
   * Fetches boundaries (named areas only), coastlines, parks+water, roads and
   * tiled buildings independently so each request is smaller and less likely to trigger a
   * 504. A pause between requests avoids immediate rate-limiting. Results are
   * cached for 24h.
   *
   * `geocodeArea` (e.g. "New York") is used only as a disambiguation scope.
   * Thematic candidates are selected by named areas or bbox. Complete relation
   * members can extend outside the query area; the mandatory surface clips later.
   */
  private async fetchCombinedOsmData(
    queryArea: OsmQueryArea,
    layers: string[] | undefined,
    onProgress?: OnLoadingProgress,
    forceRefresh: boolean = false,
    tagSets: OsmTagSet[] = [],
  ): Promise<OverpassApiResponse> {
    const cacheKey = this.getCacheKey(queryArea, layers, tagSets);
    if (!forceRefresh) {
      const cachedData = await this.cache.get(cacheKey);
      if (cachedData) {
        console.log(`[autk-db] Using cached Overpass data: ${cacheKey}`);
        return cachedData;
      }

      // A full-data cache entry (no layer filter) is a valid superset — reuse it.
      const fullDataCacheKey = this.getFullDataCacheKey(queryArea);
      // Traditional supersets contain neither arbitrary tagged nodes nor all custom tags.
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

    const requestedLayers = layers && layers.length > 0 ? layers
      : tagSets.length > 0 ? [] : ['roads', 'buildings', 'parks', 'water'];
    const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const BETWEEN_REQUESTS_MS = 3_000;

    onProgress?.('querying-osm-server');

    let combined: OverpassApiResponse = { elements: [] };
    let boundariesBbox: { south: number; north: number; west: number; east: number } | null;
    if (isBoundingBoxArea(queryArea)) {
      boundariesBbox = boundingBoxOf(queryArea);
    } else {
      console.log('[autk-db] Fetching boundary data from Overpass API…');
      const boundariesResponse = await this.fetchWithRetry(this.buildBoundariesQuery(queryArea));
      combined = await boundariesResponse.json();
      boundariesBbox = this.pipeline.computeBboxFromElements(combined.elements ?? []);
    }
    onProgress?.('downloading-osm-data');
    if (boundariesBbox) {
      await pause(BETWEEN_REQUESTS_MS);
      const response = await this.fetchWithRetry(this.buildBoundingBoxQuery(boundariesBbox, { way: ['"natural"="coastline"'], relation: [] }));
      combined = this.mergeResponses(combined, await response.json());
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

    if (tagSets.length > 0) {
      await pause(BETWEEN_REQUESTS_MS);
      const response = await this.fetchWithRetry(this.buildTagSetQuery(queryArea, tagSets));
      const data: OverpassApiResponse = await response.json();
      if ((data.elements?.length ?? 0) === 0) anyGroupEmpty = true;
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

      const body = await response.text().catch(() => '');
      const detail = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
    }

    throw new Error('Overpass API: max retries exceeded');
  }

  // ---------------------------------------------------------------------------
  // Query builders
  // ---------------------------------------------------------------------------

  /** Select the named boundary relation inside the region, then derive its area. */
  private namedAreaLines(areaName: string, i: number): string[] {
    return [
      `relation["name"="${areaName}"]["boundary"](area.areaMain)->.rel${i};`,
      `.rel${i} map_to_area->.area${i};`,
    ];
  }

  /**
   * Builds the boundaries query: admin relations + their member ways.
   * Relations are output with `body` only (tags + member IDs); ways get full
   * inline geometry via `out geom qt`.
   */
  private buildBoundariesQuery(queryArea: { geocodeArea: string; areas: string[] }): string {
    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]["boundary"]->.areaMain;`;
    const areaLines: string[] = [];
    const relSelectors: string[] = [];
    const boundaryWaySelectors: string[] = [];

    queryArea.areas.forEach((areaName, idx) => {
      const i = idx + 1;
      areaLines.push(...this.namedAreaLines(areaName, i));
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

  /** Acquires only the requested OSM geometry families; polygon relations keep full member ways for assembly. */
  private buildTagSetQuery(queryArea: OsmQueryArea, tagSets: OsmTagSet[]): string {
    const scopeLines: string[] = [];
    let filters: string[];
    if (isBoundingBoxArea(queryArea)) {
      const box = boundingBoxOf(queryArea);
      filters = [`(${box.south},${box.west},${box.north},${box.east})`];
    } else {
      scopeLines.push(`area["name"=${JSON.stringify(queryArea.geocodeArea)}]["boundary"]->.areaMain;`);
      filters = queryArea.areas.map((areaName, index) => {
        scopeLines.push(...this.namedAreaLines(areaName, index + 1));
        return `(area.area${index + 1})`;
      });
    }
    const selectors = tagSelectors(tagSets);
    const waySelectors = [...new Set([...selectors.polylines, ...selectors.polygons])];
    const hits = filters.flatMap(filter => [
      ...selectors.points.map(selector => `node${selector}${filter};`),
      ...waySelectors.map(selector => `way${selector}${filter};`),
      ...selectors.polygons.map(selector => `relation${selector}["type"="multipolygon"]${filter};`),
    ]);
    return `[out:json][timeout:60][maxsize:268435456];
      ${scopeLines.join('\n')}
      (${hits.join('\n')})->.tagHits;
      ${selectors.points.length > 0 ? 'node.tagHits; out body;' : ''}
      ${selectors.polygons.length > 0 ? `rel.tagHits["type"="multipolygon"]->.tagAreas;
        way(r.tagAreas)->.tagAreaWays;
        .tagAreas out body;` : ''}
      ${waySelectors.length > 0 ? `(way.tagHits; ${selectors.polygons.length > 0 ? '.tagAreaWays;' : ''}); out geom qt;` : ''}`;
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

    const geocodeLine = `area["name"="${queryArea.geocodeArea}"]["boundary"]->.areaMain;`;
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
          wayFilters.add(`"building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}`);
          wayFilters.add(`"building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}`);
          wayFilters.add(`"type"="building"`);
          relationFilters.add(`"building"][${this.buildExcludedValueSelector('building', EXCLUDED_BUILDING_VALUES)}`);
          relationFilters.add(`"building:part"][${this.buildExcludedValueSelector('building:part', EXCLUDED_BUILDING_VALUES)}`);
          relationFilters.add(`"type"="building"`);
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
          queries.push(this.buildBoundingBoxQuery({ south, north, west, east }, this.getTagSelectorsForLayers(['buildings'])));
          continue;
        }
        const geocodeLine = `area["name"="${queryArea.geocodeArea}"]["boundary"]->.areaMain;`;
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
        relation["type"="building"](area.area${i})(${tileBbox});
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

  /** Spatial selectors acquire complete ways and relation members; surface clips them later. */
  private buildBoundingBoxQuery(
    box: { south: number; north: number; west: number; east: number },
    selectors: OverpassTagSelectors,
  ): string {
    const filter = `(${box.south},${box.west},${box.north},${box.east})`;
    const ways = selectors.way.map(selector => `way[${selector}]${filter};`).join('\n');
    const relations = selectors.relation.map(selector => `relation[${selector}]${filter};`).join('\n');
    const relationQuery = relations ? `(${relations})->.dataRelations;
      way(r.dataRelations)->.dataRelationWays;
      (.dataRelations;); out body;` : '';
    return `[out:json][timeout:60][maxsize:268435456];
      (${ways})->.dataWays;
      ${relationQuery}
      (.dataWays; ${relations ? '.dataRelationWays;' : ''}); out geom qt;`;
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
