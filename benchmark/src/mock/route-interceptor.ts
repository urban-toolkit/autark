import type { Page, Route } from '@playwright/test';
import type { RouteInterceptorOptions, InterceptedPayloadSummary, SyntheticScale } from './types';
import {
  generateSyntheticOsmResponse,
  generateSyntheticPolygons,
  generateSyntheticBuildings,
  generateSyntheticLines,
  generateSyntheticPoints,
  generateTaxiCsv,
  generateNoiseCsv,
  generatePermitCsv,
  generateShadowsChicagoCsv,
  generateNycNeighborhoodsCsv,
  generateGenericPointsCsv,
  generateSyntheticWktJson,
} from '../generators';

const SCALE_MULTIPLIERS: Record<SyntheticScale, number> = {
  minimal: 0.2,
  light: 0.5,
  standard: 1.0,
  heavy: 2.5,
};

export class BenchmarkRouteInterceptor {
  private readonly intercepted: InterceptedPayloadSummary[] = [];
  private readonly options: Required<RouteInterceptorOptions>;

  constructor(options: RouteInterceptorOptions = {}) {
    this.options = {
      syntheticScale: options.syntheticScale ?? 'standard',
      interceptOverpass: options.interceptOverpass ?? true,
      interceptStaticData: options.interceptStaticData ?? true,
      simulatedLatencyMs: options.simulatedLatencyMs ?? 0,
    };
  }

  public getPayloadSummaries(): InterceptedPayloadSummary[] {
    return [...this.intercepted];
  }

  public getTotalDataBytes(): number {
    return this.intercepted.reduce((acc, curr) => acc + curr.byteLength, 0);
  }

  public async setup(page: Page): Promise<void> {
    if (this.options.interceptOverpass) {
      await page.route(url => this.isOverpassStatusUrl(url.toString()), route => this.handleOverpassStatus(route));
      await page.route(url => this.isOverpassUrl(url.toString()), route => this.handleOverpass(route));
    }
    if (this.options.interceptStaticData) {
      await page.route(url => this.isStaticDataUrl(url.toString()), route => this.handleStaticData(route));
    }
  }

  private isOverpassStatusUrl(url: string): boolean {
    return url.includes('/api/status') || url.includes('overpass-api.de/api/status');
  }

  private isOverpassUrl(url: string): boolean {
    return (
      url.includes('/api/interpreter') ||
      url.includes('overpass-api.de') ||
      url.includes('overpass.kumi.systems') ||
      url.includes('lz4.overpass-api.de') ||
      url.includes('overpass.private.coffee')
    );
  }

  private isStaticDataUrl(url: string): boolean {
    return (
      url.includes('/data/') &&
      (url.endsWith('.geojson') ||
        url.endsWith('.csv') ||
        url.endsWith('.json'))
    );
  }

  private async handleOverpassStatus(route: Route): Promise<void> {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'Connected as: 123456\nCurrent time: 2026-09-06T12:00:00Z\nRate limit: 2\n2 slots available now.\nSlot available after: 2026-09-06T12:00:00Z',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  private async handleOverpass(route: Route): Promise<void> {
    const startTime = performance.now();
    const req = route.request();
    const rawPostData = req.postData() ?? '';
    let decodedQuery: string;

    try {
      if (rawPostData.startsWith('data=')) {
        decodedQuery = decodeURIComponent(rawPostData.substring(5).replace(/\+/g, ' '));
      } else {
        decodedQuery = decodeURIComponent(rawPostData.replace(/\+/g, ' '));
      }
    } catch {
      decodedQuery = rawPostData;
    }

    const mult = SCALE_MULTIPLIERS[this.options.syntheticScale];
    const areas: string[] = [];

    const areaMatches = decodedQuery.matchAll(/["']name["']\s*=\s*["']([^"']+)["']/g);
    for (const match of areaMatches) {
      if (match[1] && !areas.includes(match[1])) {
        areas.push(match[1]);
      }
    }

    let geocodeArea = 'New York';
    if (areas.length > 0) {
      // If first area is known geocodeArea, use it and shift
      const knownCities = ['New York', 'Chicago', 'Paris', 'Rio de Janeiro'];
      const foundCity = knownCities.find(c => areas.includes(c));
      if (foundCity) {
        geocodeArea = foundCity;
      }
    }

    // Filter out the city name itself if sub-areas exist
    const subAreas = areas.filter(a => !['New York', 'Chicago', 'Paris', 'Rio de Janeiro'].includes(a));
    const targetAreas = subAreas.length > 0 ? subAreas : (areas.length > 0 ? areas : ['Battery Park City', 'Financial District']);

    const layers: Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'> = [];
    if (decodedQuery.includes('building') || !decodedQuery) layers.push('buildings');
    if (decodedQuery.includes('highway') || !decodedQuery) layers.push('roads');
    if (decodedQuery.includes('leisure') || decodedQuery.includes('park') || !decodedQuery) layers.push('parks');
    if (decodedQuery.includes('natural') || decodedQuery.includes('water') || !decodedQuery) layers.push('water');
    if (decodedQuery.includes('landuse') || !decodedQuery) layers.push('surface');

    const syntheticOsm = generateSyntheticOsmResponse({
      geocodeArea,
      areas: targetAreas,
      layers: layers.length > 0 ? layers : undefined,
      featureCountPerLayer: Math.max(10, Math.round(30 * mult)),
    });

    const bodyStr = JSON.stringify(syntheticOsm);
    const durationMs = performance.now() - startTime;

    this.intercepted.push({
      url: req.url(),
      type: 'osm-overpass',
      byteLength: Buffer.byteLength(bodyStr, 'utf-8'),
      durationMs,
      timestamp: Date.now(),
    });

    if (this.options.simulatedLatencyMs > 0) {
      await new Promise(r => setTimeout(r, this.options.simulatedLatencyMs));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: bodyStr,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  private async handleStaticData(route: Route): Promise<void> {
    const startTime = performance.now();
    const req = route.request();
    const url = req.url();
    const mult = SCALE_MULTIPLIERS[this.options.syntheticScale];

    let bodyStr = '';
    let contentType = 'application/json';
    let type = 'geojson';

    if (url.endsWith('.geojson')) {
      type = 'geojson';
      contentType = 'application/json';
      if (url.includes('nit_buildings')) {
        bodyStr = JSON.stringify(generateSyntheticBuildings({ count: Math.round(150 * mult) }));
      } else if (url.includes('roads')) {
        bodyStr = JSON.stringify(generateSyntheticLines({ count: Math.round(60 * mult) }));
      } else if (url.includes('pois') || url.includes('test')) {
        bodyStr = JSON.stringify(generateSyntheticPoints({ count: Math.round(80 * mult) }));
      } else {
        bodyStr = JSON.stringify(generateSyntheticPolygons({ count: Math.round(40 * mult) }));
      }
    } else if (url.endsWith('.csv')) {
      type = 'csv';
      contentType = 'text/csv';
      if (url.includes('shadows')) {
        bodyStr = generateShadowsChicagoCsv(Math.round(100 * mult));
      } else if (url.includes('taxi')) {
        bodyStr = generateTaxiCsv(Math.round(300 * mult));
      } else if (url.includes('noise')) {
        bodyStr = generateNoiseCsv(Math.round(200 * mult));
      } else if (url.includes('permit')) {
        bodyStr = generatePermitCsv(Math.round(200 * mult));
      } else if (url.includes('nyc_neigs')) {
        bodyStr = generateNycNeighborhoodsCsv(Math.round(40 * mult));
      } else {
        bodyStr = generateGenericPointsCsv({ rowCount: Math.round(150 * mult) });
      }
    } else if (url.endsWith('.json') && !url.includes('package')) {
      type = 'json-wkt';
      contentType = 'application/json';
      bodyStr = JSON.stringify(generateSyntheticWktJson(Math.round(40 * mult)));
    }

    const durationMs = performance.now() - startTime;
    this.intercepted.push({
      url,
      type,
      byteLength: Buffer.byteLength(bodyStr, 'utf-8'),
      durationMs,
      timestamp: Date.now(),
    });

    if (this.options.simulatedLatencyMs > 0) {
      await new Promise(r => setTimeout(r, this.options.simulatedLatencyMs));
    }

    await route.fulfill({
      status: 200,
      contentType,
      body: bodyStr,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
