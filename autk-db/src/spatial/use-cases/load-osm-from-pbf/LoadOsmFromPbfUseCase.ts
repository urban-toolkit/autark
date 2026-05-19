import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { readOsmPbf } from '@osmix/pbf';

import { OsmTable } from '../../../shared/interfaces';
import {
  EXCLUDED_BUILDING_VALUES,
  EXCLUDED_HIGHWAY_VALUES,
  PARKS_LANDUSE_VALUES,
  PARKS_LEISURE_VALUES,
  PARKS_NATURAL_VALUES,
  WATER_NATURAL_VALUES,
  WATER_FEATURE_VALUES,
} from '../../../shared/osm-tag-definitions';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';
import { LoadOsmParams, OsmElement } from '../load-osm-from-overpass-api/interfaces';
import { OsmProcessingPipeline } from '../osm-processing-pipeline/OsmProcessingPipeline';
import { blockToElements, resolveWayGeometries } from './osm-pbf-parser';

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

type RequestedLayer = 'roads' | 'buildings' | 'parks' | 'water';
type Bbox = { south: number; north: number; west: number; east: number };

class IdFilter {
  private bits: Uint8Array;
  private bitCount: number;

  constructor(bitCount: number = 1 << 27) {
    this.bitCount = bitCount;
    this.bits = new Uint8Array(Math.ceil(bitCount / 8));
  }

  add(id: number): void {
    this.setBit(this.hash1(id));
    this.setBit(this.hash2(id));
    this.setBit(this.hash3(id));
  }

  has(id: number): boolean {
    return this.getBit(this.hash1(id)) && this.getBit(this.hash2(id)) && this.getBit(this.hash3(id));
  }

  private setBit(index: number): void {
    this.bits[index >> 3] |= 1 << (index & 7);
  }

  private getBit(index: number): boolean {
    return (this.bits[index >> 3] & (1 << (index & 7))) !== 0;
  }

  private hash1(id: number): number {
    return this.mix(id, 0x9e3779b1);
  }

  private hash2(id: number): number {
    return this.mix(id, 0x85ebca6b);
  }

  private hash3(id: number): number {
    return this.mix(id, 0xc2b2ae35);
  }

  private mix(id: number, seed: number): number {
    let x = Math.floor(id) ^ seed;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = x ^ (x >>> 16);
    return (x >>> 0) % this.bitCount;
  }
}

/**
 * Loads OSM data from a local PBF file with multi-pass streaming.
 */
export class LoadOsmFromPbfUseCase {
  private readonly conn: AsyncDuckDBConnection;
  private readonly pipeline: OsmProcessingPipeline;

  constructor(conn: AsyncDuckDBConnection, pipeline: OsmProcessingPipeline) {
    this.conn = conn;
    this.pipeline = pipeline;
  }

  async exec(params: LoadOsmParams): Promise<OsmExecResult> {
    const pbfFileUrl = params.pbfFileUrl;
    if (!pbfFileUrl) throw new Error('pbfFileUrl must be provided for PBF loading');
    const workspace = params.workspace || 'main';
    const onProgress = params.onProgress;
    const requestedLayers = this.getRequestedLayers(params);

    onProgress?.('downloading-osm-data');

    const boundaryContext = await this.collectBoundaryContext(pbfFileUrl, params.queryArea.areas);
    const bbox = await this.collectBoundaryBbox(pbfFileUrl, boundaryContext.boundaryWayIds);

    onProgress?.('processing-osm-data');
    console.log('[autk-db] PBF pass 3/3: thematic collection started');

    const candidates = await this.collectCandidateWaysAndRelations(
      pbfFileUrl,
      boundaryContext.boundaryRelationIds,
      boundaryContext.boundaryWayIds,
      requestedLayers,
    );

    await this.collectRequiredNodes(pbfFileUrl, candidates.requiredNodeIds, candidates.elements);
    resolveWayGeometries(candidates.elements);

    const filteredElements = this.filterFinalElements(
      candidates.elements,
      bbox,
      boundaryContext.boundaryRelationIds,
      boundaryContext.boundaryWayIds,
    );
    const grouped = this.buildGroupedCollections(
      filteredElements,
      boundaryContext.boundaryRelationIds,
      boundaryContext.boundaryWayIds,
    );
    console.log('[autk-db] PBF pass 3/3: thematic collection finished');
    console.log(
      `[autk-db] PBF filter summary: boundaries=${grouped.boundaries.elements.length}, parks+water=${grouped.parksWater.elements.length}, roads=${grouped.roads.elements.length}, buildings=${grouped.buildings.elements.length}, total=${filteredElements.length}`
    );

    const combined = this.mergeResponses(
      this.mergeResponses(grouped.boundaries, grouped.parksWater),
      this.mergeResponses(grouped.roads, grouped.buildings),
    );
    const { osmData, boundariesData } = this.pipeline.splitCombinedResponse(combined, params.queryArea);

    const t0 = performance.now();
    await this.pipeline.insertOsmDataUsingJson(params.outputTableName, osmData, workspace);
    const osmDataProcessingMs = performance.now() - t0;

    onProgress?.('processing-boundaries');
    const t1 = performance.now();
    await this.pipeline.insertOsmDataUsingJson(`${params.outputTableName}_boundaries`, boundariesData, workspace, true);
    const boundariesProcessingMs = performance.now() - t1;

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

  private getRequestedLayers(params: LoadOsmParams): RequestedLayer[] {
    const layers = params.autoLoadLayers?.layers ?? ['roads', 'buildings', 'parks', 'water'];
    return layers.filter((layer): layer is RequestedLayer =>
      layer === 'roads' || layer === 'buildings' || layer === 'parks' || layer === 'water',
    );
  }

  // Pass 1: find requested boundary relations and their member ways
  private async collectBoundaryContext(
    pbfFileUrl: string,
    areaNames: string[],
  ): Promise<{
    boundaryRelationIds: Set<number>;
    boundaryWayIds: Set<number>;
  }> {
    console.log('[autk-db] PBF pass 1/3: boundary discovery started');
    const requestedAreaNames = new Set(areaNames);
    const foundAreaNames = new Set<string>();
    const boundaryRelationIds = new Set<number>();
    const boundaryWayIds = new Set<number>();

    await this.streamPbfBlocks(pbfFileUrl, async (elements) => {
      for (const element of elements) {
        if (element.type !== 'relation') continue;
        const name = element.tags?.name;
        if (!name || !requestedAreaNames.has(name)) continue;

        foundAreaNames.add(name);
        boundaryRelationIds.add(element.id);
        for (const member of element.members ?? []) {
          if (member.type === 'way') boundaryWayIds.add(member.ref);
        }
      }
    });

    const missingAreas = areaNames.filter((name) => !foundAreaNames.has(name));
    if (missingAreas.length > 0) {
      throw new Error(
        `No administrative boundary found in PBF for: ${missingAreas.map(a => `"${a}"`).join(', ')}. ` +
        `Verify the area names match OSM relation names exactly.`,
      );
    }

    console.log(
      `[autk-db] PBF pass 1/3: boundary discovery finished (${boundaryRelationIds.size} relations, ${boundaryWayIds.size} ways)`
    );
    return { boundaryRelationIds, boundaryWayIds };
  }

  // Pass 2: collect boundary ways/nodes and compute bbox
  private async collectBoundaryBbox(
    pbfFileUrl: string,
    boundaryWayIds: Set<number>,
  ): Promise<Bbox> {
    console.log('[autk-db] PBF pass 2/3: boundary bbox collection started');
    const elements: OsmElement[] = [];
    const requiredNodeIds = new IdFilter();

    await this.streamPbfBlocks(pbfFileUrl, async (blockElements) => {
      for (const element of blockElements) {
        if (element.type !== 'way' || !boundaryWayIds.has(element.id)) continue;
        elements.push(element);
        for (const nodeId of element.nodes ?? []) requiredNodeIds.add(nodeId);
      }
    });

    await this.collectRequiredNodes(pbfFileUrl, requiredNodeIds, elements);
    resolveWayGeometries(elements);

    const bbox = this.pipeline.computeBboxFromElements(elements);
    if (!bbox) throw new Error('Failed to compute bounding box from boundary elements');

    console.log(
      `[autk-db] PBF pass 2/3: boundary bbox collection finished (${bbox.south}, ${bbox.west}) → (${bbox.north}, ${bbox.east})`
    );
    return bbox;
  }

  // Pass 3: collect candidate thematic relations + ways and required node ids
  private async collectCandidateWaysAndRelations(
    pbfFileUrl: string,
    boundaryRelationIds: Set<number>,
    boundaryWayIds: Set<number>,
    requestedLayers: RequestedLayer[],
  ): Promise<{
    elements: OsmElement[];
    requiredNodeIds: IdFilter;
  }> {
    const elements: OsmElement[] = [];
    const relationWayIds = new Set<number>();

    await this.streamPbfBlocks(pbfFileUrl, async (blockElements) => {
      for (const element of blockElements) {
        if (element.type !== 'relation') continue;

        if (boundaryRelationIds.has(element.id) || this.matchesRequestedRelationLayers(element.tags, requestedLayers)) {
          elements.push(element);
          for (const member of element.members ?? []) {
            if (member.type === 'way') relationWayIds.add(member.ref);
          }
        }
      }
    });

    const requiredNodeIds = new IdFilter();

    await this.streamPbfBlocks(pbfFileUrl, async (blockElements) => {
      for (const element of blockElements) {
        if (element.type !== 'way') continue;

        const keep =
          boundaryWayIds.has(element.id) ||
          relationWayIds.has(element.id) ||
          this.matchesRequestedWayLayers(element.tags, requestedLayers);

        if (!keep) continue;

        elements.push(element);
        for (const nodeId of element.nodes ?? []) {
          requiredNodeIds.add(nodeId);
        }
      }
    });

    return { elements, requiredNodeIds };
  }

  private async collectRequiredNodes(
    pbfFileUrl: string,
    requiredNodeIds: IdFilter,
    elements: OsmElement[],
  ): Promise<void> {
    await this.streamPbfBlocks(pbfFileUrl, async (blockElements) => {
      for (const element of blockElements) {
        if (element.type !== 'node') continue;
        if (!requiredNodeIds.has(element.id)) continue;
        elements.push(element);
      }
    });
  }

  private filterFinalElements(
    elements: OsmElement[],
    bbox: Bbox,
    boundaryRelationIds: Set<number>,
    boundaryWayIds: Set<number>,
  ): OsmElement[] {
    const intersectingWays = new IdFilter();

    for (const element of elements) {
      if (element.type !== 'way') continue;
      if (boundaryWayIds.has(element.id) || this.wayIntersectsBbox(element, bbox)) {
        intersectingWays.add(element.id);
      }
    }

    const keptRelationIds = new IdFilter();
    const relationMemberWayIds = new IdFilter();

    for (const element of elements) {
      if (element.type !== 'relation') continue;

      if (boundaryRelationIds.has(element.id)) {
        keptRelationIds.add(element.id);
        for (const member of element.members ?? []) {
          if (member.type === 'way') relationMemberWayIds.add(member.ref);
        }
        continue;
      }

      const memberWayRefs = this.getRelationWayRefs(element);

      if (memberWayRefs.some((ref) => intersectingWays.has(ref))) {
        keptRelationIds.add(element.id);
        for (const ref of memberWayRefs) relationMemberWayIds.add(ref);
      }
    }

    const keptWays = new IdFilter();
    for (const element of elements) {
      if (element.type !== 'way') continue;
      if (intersectingWays.has(element.id) || relationMemberWayIds.has(element.id)) {
        keptWays.add(element.id);
      }
    }

    const keptNodeIds = new IdFilter();
    for (const element of elements) {
      if (element.type === 'way' && keptWays.has(element.id)) {
        for (const nodeId of element.nodes ?? []) keptNodeIds.add(nodeId);
      }
    }

    return elements.filter((element) => {
      if (element.type === 'way') return keptWays.has(element.id);
      if (element.type === 'node') return keptNodeIds.has(element.id);
      if (element.type === 'relation') return keptRelationIds.has(element.id);
      return false;
    });
  }

  private buildGroupedCollections(
    elements: OsmElement[],
    boundaryRelationIds: Set<number>,
    boundaryWayIds: Set<number>,
  ): {
    boundaries: OverpassApiResponse;
    parksWater: OverpassApiResponse;
    roads: OverpassApiResponse;
    buildings: OverpassApiResponse;
  } {
    const boundaryWaySet = new Set<number>();
    const parksWaterWaySet = new Set<number>();
    const roadsWaySet = new Set<number>();
    const buildingsWaySet = new Set<number>();

    const boundaryNodeIds = new IdFilter();
    const parksWaterNodeIds = new IdFilter();
    const roadsNodeIds = new IdFilter();
    const buildingsNodeIds = new IdFilter();

    const boundaries: OsmElement[] = [];
    const parksWater: OsmElement[] = [];
    const roads: OsmElement[] = [];
    const buildings: OsmElement[] = [];

    const addWayNodes = (nodeIds: number[] | undefined, nodeFilter: IdFilter) => {
      for (const nodeId of nodeIds ?? []) nodeFilter.add(nodeId);
    };

    for (const element of elements) {
      if (element.type !== 'relation') continue;

      if (boundaryRelationIds.has(element.id)) {
        boundaries.push(element);
        for (const member of element.members ?? []) {
          if (member.type === 'way') boundaryWaySet.add(member.ref);
        }
        continue;
      }

      if (this.isBuildingTagSet(element.tags ?? {})) {
        buildings.push(element);
        for (const member of element.members ?? []) {
          if (member.type === 'way') buildingsWaySet.add(member.ref);
        }
        continue;
      }

      if (this.isRoadTagSet(element.tags ?? {})) {
        roads.push(element);
        for (const member of element.members ?? []) {
          if (member.type === 'way') roadsWaySet.add(member.ref);
        }
        continue;
      }

      if (this.isParkTagSet(element.tags ?? {}) || this.isWaterTagSet(element.tags ?? {})) {
        parksWater.push(element);
        for (const member of element.members ?? []) {
          if (member.type === 'way') parksWaterWaySet.add(member.ref);
        }
      }
    }

    for (const element of elements) {
      if (element.type !== 'way') continue;

      if (boundaryWayIds.has(element.id) || boundaryWaySet.has(element.id)) {
        boundaries.push(element);
        boundaryWaySet.add(element.id);
        addWayNodes(element.nodes, boundaryNodeIds);
        continue;
      }
      if (buildingsWaySet.has(element.id) || this.isBuildingTagSet(element.tags ?? {})) {
        buildings.push(element);
        buildingsWaySet.add(element.id);
        addWayNodes(element.nodes, buildingsNodeIds);
        continue;
      }
      if (roadsWaySet.has(element.id) || this.isRoadTagSet(element.tags ?? {})) {
        roads.push(element);
        roadsWaySet.add(element.id);
        addWayNodes(element.nodes, roadsNodeIds);
        continue;
      }
      if (parksWaterWaySet.has(element.id) || this.isParkTagSet(element.tags ?? {}) || this.isWaterTagSet(element.tags ?? {})) {
        parksWater.push(element);
        parksWaterWaySet.add(element.id);
        addWayNodes(element.nodes, parksWaterNodeIds);
        continue;
      }
    }

    for (const element of elements) {
      if (element.type !== 'node') continue;
      if (boundaryNodeIds.has(element.id)) boundaries.push(element);
      if (parksWaterNodeIds.has(element.id)) parksWater.push(element);
      if (roadsNodeIds.has(element.id)) roads.push(element);
      if (buildingsNodeIds.has(element.id)) buildings.push(element);
    }

    return {
      boundaries: { elements: boundaries },
      parksWater: { elements: parksWater },
      roads: { elements: roads },
      buildings: { elements: buildings },
    };
  }

  private mergeResponses(a: OverpassApiResponse, b: OverpassApiResponse): OverpassApiResponse {
    const existingIds = new Set<string>();
    for (const e of a.elements) existingIds.add(`${e.type}:${e.id}`);
    const dedupedB = b.elements.filter(e => !existingIds.has(`${e.type}:${e.id}`));
    return { elements: [...a.elements, ...dedupedB] };
  }

  private getRelationWayRefs(element: OsmElement): number[] {
    return (element.members ?? [])
      .filter((member) => member.type === 'way')
      .map((member) => member.ref);
  }

  private wayIntersectsBbox(element: OsmElement, bbox: Bbox): boolean {
    const points = element.geometry;
    if (!points || points.length === 0) return false;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const pt of points) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
    }

    return !(maxLat < bbox.south || minLat > bbox.north || maxLon < bbox.west || minLon > bbox.east);
  }

  private async streamPbfBlocks(
    pbfFileUrl: string,
    onBlock: (elements: OsmElement[]) => Promise<void> | void,
  ): Promise<void> {
    const response = await fetch(pbfFileUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch PBF file: ${response.status} ${response.statusText}`);
    }

    const { blocks } = await readOsmPbf(response.body);
    for await (const block of blocks) {
      await onBlock(blockToElements(block));
    }
  }

  private matchesRequestedWayLayers(tags: Record<string, string> | undefined, requestedLayers: RequestedLayer[]): boolean {
    if (!tags) return false;
    for (const layer of requestedLayers) {
      switch (layer) {
        case 'roads':
          if (this.isRoadTagSet(tags)) return true;
          break;
        case 'buildings':
          if (this.isBuildingTagSet(tags)) return true;
          break;
        case 'parks':
          if (this.isParkTagSet(tags)) return true;
          break;
        case 'water':
          if (this.isWaterTagSet(tags)) return true;
          break;
      }
    }
    return false;
  }

  private matchesRequestedRelationLayers(tags: Record<string, string> | undefined, requestedLayers: RequestedLayer[]): boolean {
    return this.matchesRequestedWayLayers(tags, requestedLayers);
  }

  private isRoadTagSet(tags: Record<string, string>): boolean {
    return (
      tags.highway !== undefined &&
      tags.area !== 'yes' &&
      !this.hasTagValue(tags, 'highway', EXCLUDED_HIGHWAY_VALUES)
    );
  }

  private isBuildingTagSet(tags: Record<string, string>): boolean {
    return (
      (tags.building !== undefined && !this.hasTagValue(tags, 'building', EXCLUDED_BUILDING_VALUES)) ||
      (tags['building:part'] !== undefined && !this.hasTagValue(tags, 'building:part', EXCLUDED_BUILDING_VALUES)) ||
      tags.type === 'building' ||
      (tags.type === 'multipolygon' && tags.building !== undefined && !this.hasTagValue(tags, 'building', EXCLUDED_BUILDING_VALUES)) ||
      (tags.type === 'multipolygon' && tags['building:part'] !== undefined && !this.hasTagValue(tags, 'building:part', EXCLUDED_BUILDING_VALUES))
    );
  }

  private isParkTagSet(tags: Record<string, string>): boolean {
    return (
      this.hasTagValue(tags, 'leisure', PARKS_LEISURE_VALUES) ||
      this.hasTagValue(tags, 'landuse', PARKS_LANDUSE_VALUES) ||
      this.hasTagValue(tags, 'natural', PARKS_NATURAL_VALUES)
    );
  }

  private isWaterTagSet(tags: Record<string, string>): boolean {
    return (
      this.hasTagValue(tags, 'natural', WATER_NATURAL_VALUES) ||
      this.hasTagValue(tags, 'water', WATER_FEATURE_VALUES)
    );
  }

  private hasTagValue(tags: Record<string, string>, key: string, values: readonly string[]): boolean {
    const value = tags[key];
    return value !== undefined && values.includes(value);
  }
}
