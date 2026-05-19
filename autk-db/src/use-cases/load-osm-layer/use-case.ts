import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { Geometry, MultiPolygon, Polygon, Position } from 'geojson';

import { LoadOsmLayerParams } from './interfaces';
import { LOAD_LAYER_QUERY } from './queries';
import type { BoundingBox, LayerType } from '../../types-core';
import { OsmLayerTable } from '../../interfaces';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';
import { ProcessOsmBuildingsUseCase } from '../../internal/process-osm-buildings/use-case';
import { getOsmProcessingConfig } from './osm-processing-config';

type RelationRow = {
  id: number | bigint;
  refs: unknown;
  ref_roles: unknown;
  ref_types: unknown;
  tags_json: unknown;
};

type WayRow = {
  id: number | bigint;
  refs: unknown;
};

type NodeRow = {
  id: number | bigint;
  lat: number;
  lon: number;
};

type WayRing = {
  refs: number[];
  coordinates: Position[];
};

type RelationAreaRecord = {
  id: number;
  tags: Array<{ k: string; v: string }>;
  geometry: Geometry;
};

/**
 * Extracts a thematic layer (roads, buildings, parks, water, surface) from raw OSM data.
 */
export class LoadOsmLayerUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;
  private processOsmBuildingsUseCase: ProcessOsmBuildingsUseCase;

  /**
   * @param db - DuckDB instance for file registration and VFS operations.
   * @param conn - Active DuckDB connection for executing SQL.
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
    this.processOsmBuildingsUseCase = new ProcessOsmBuildingsUseCase(db, conn);
  }

  /**
   * Runs the extraction pipeline for the requested OSM layer.
   *
   * The function executes SQL to extract the layer, optionally appends relation
   * geometries when configured, and runs post-processing (e.g. building aggregation).
   *
   * @param params - Configuration including input table name, requested layer, and optional bbox/workspace.
   * @returns Metadata describing the created layer table.
   * @throws Error if the requested layer type is unsupported or required geometry data is missing.
   * @example
   * const useCase = new LoadOsmLayerUseCase(db, conn);
   * const table = await useCase.exec({ osmInputTableName: 'osm_data', layer: 'buildings', outputTableName: 'buildings' });
   */
  async exec(params: LoadOsmLayerParams & { workspaceCoordinateFormat?: string }): Promise<OsmLayerTable> {
    const sourceCrs = params.coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT;
    const targetCrs = params.workspaceCoordinateFormat || DEFAULT_WORKSPACE_COORDINATE_FORMAT;
    const workspace = params.workspace || DEFAULT_WORKSPACE_NAME;

    const layerOutputTableName = params.outputTableName || `${params.osmInputTableName}_${params.layer}`;
    const qualifiedOutputTableName = `${workspace}.${layerOutputTableName}`;

    const layerQuery = LOAD_LAYER_QUERY({
      layer: params.layer,
      tableName: params.osmInputTableName,
      sourceCrs,
      targetCrs,
      outputTableName: layerOutputTableName,
      boundingBox: params.boundingBox,
      workspace,
    });
    const describeTableResponse = await this.conn.query(layerQuery);
    let columns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());
    let totalSkippedRelations = 0;

    const config = getOsmProcessingConfig(params.layer);
    if (!config) throw new Error(`Unsupported layer type for OSM processing: ${params.layer}`);

    if (config.processesRelations) {
      totalSkippedRelations = await this.appendRelationAreaGeometries({
        inputTableName: params.osmInputTableName,
        outputTableName: layerOutputTableName,
        layer: params.layer,
        sourceCrs,
        targetCrs,
        boundingBox: params.boundingBox,
        workspace,
      });

      const describeUpdatedTableResponse = await this.conn.query(`DESCRIBE ${qualifiedOutputTableName}`);
      columns = getColumnsFromDuckDbTableDescribe(describeUpdatedTableResponse.toArray());
    }

    if (totalSkippedRelations > 0) {
      console.warn(`[LoadOsmLayerUseCase] loaded ${params.layer}: ${totalSkippedRelations} relations skipped.`);
    }

    if (config.postProcessing === 'building-aggregation') {
      columns = await this.processOsmBuildingsUseCase.exec({
        tableName: layerOutputTableName,
        workspace,
      });
    }

    return {
      source: 'osm',
      type: params.layer,
      columns,
      name: layerOutputTableName,
    };
  }

  /**
   * Appends resolved relation area geometries to the output layer table.
   *
   * The method builds relation area records, writes them to a temporary VFS file,
   * and inserts them into the output table, optionally clipping by bounding box.
   *
   * @param params - Input/output table names, layer, CRS, bbox and workspace.
   * @returns Number of skipped relations (those that couldn't be resolved to geometry).
   */
  private async appendRelationAreaGeometries(params: {
    inputTableName: string;
    outputTableName: string;
    layer: LayerType;
    sourceCrs: string;
    targetCrs: string;
    boundingBox?: BoundingBox;
    workspace: string;
  }): Promise<number> {
    const { records, skipped } = await this.buildRelationAreaRecords(params.inputTableName, params.layer, params.workspace);
    if (records.length === 0) return skipped;

    const fileName = `temp_${params.layer}_relations_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
    await this.db.registerFileText(fileName, JSON.stringify(records));

    const qualifiedOutputTableName = `${params.workspace}.${params.outputTableName}`;
    const geometryWgs84 = 'ST_GeomFromGeoJSON(JSON(geometry))';
    const transformedGeometry = `ST_Transform(${geometryWgs84}, '${params.sourceCrs}', '${params.targetCrs}', always_xy := true)`;
    const clippingGeometry = params.boundingBox
      ? `ST_MakeEnvelope(${params.boundingBox.minLon}, ${params.boundingBox.minLat}, ${params.boundingBox.maxLon}, ${params.boundingBox.maxLat})`
      : null;
    const geometrySelect = clippingGeometry
      ? `ST_Intersection(${transformedGeometry}, ${clippingGeometry})`
      : transformedGeometry;
    const whereClause = clippingGeometry
      ? `WHERE ST_Intersects(${transformedGeometry}, ${clippingGeometry})`
      : '';

    try {
      await this.conn.query(`
        INSERT INTO ${qualifiedOutputTableName} (id, properties, refs, geometry)
        SELECT
          id::BIGINT,
          CASE
            WHEN tags IS NULL OR tags = [] THEN NULL
            ELSE map_from_entries(tags)
          END AS properties,
          []::BIGINT[] AS refs,
          ${geometrySelect} AS geometry
        FROM '${fileName}'
        ${whereClause};
      `);
    } finally {
      await this.db.dropFile(fileName);
    }

    return skipped;
  }

  /**
   * Constructs polygon/multipolygon GeoJSON geometries for relation elements.
   *
   * @param inputTableName - Name of the OSM elements table to read.
   * @param layer - The thematic layer name used to filter relations.
   * @param workspace - Workspace containing the input table.
   * @returns An object containing the list of GeoJSON relation records and the count of skipped relations.
   */
  private async buildRelationAreaRecords(
    inputTableName: string,
    layer: LayerType,
    workspace: string,
  ): Promise<{ records: RelationAreaRecord[]; skipped: number }> {
    const qualifiedInputTableName = `${workspace}.${inputTableName}`;
    const relations = (await this.conn.query(`
      SELECT id, refs, ref_roles, ref_types, CAST(tags AS JSON) AS tags_json
        FROM ${qualifiedInputTableName}
        WHERE kind = 'relation' AND map_extract(tags, '__autk_layer')[1] = '${layer}';
    `)).toArray() as unknown as RelationRow[];

    if (relations.length === 0) return { records: [], skipped: 0 };

    const ways = (await this.conn.query(`
      SELECT id, refs
      FROM ${qualifiedInputTableName}
      WHERE kind = 'way';
    `)).toArray() as unknown as WayRow[];
    const nodes = (await this.conn.query(`
      SELECT id, lat, lon
      FROM ${qualifiedInputTableName}
      WHERE kind = 'node';
    `)).toArray() as unknown as NodeRow[];

    const refsByWayId = new Map<number, number[]>();
    for (const way of ways) {
      refsByWayId.set(this.toNumber(way.id), this.toNumberArray(way.refs));
    }

    const coordinateByNodeId = new Map<number, Position>();
    for (const node of nodes) {
      coordinateByNodeId.set(this.toNumber(node.id), [node.lon, node.lat]);
    }

    const records: RelationAreaRecord[] = [];
    let skipped = 0;
    for (const relation of relations) {
      const geometry = this.buildRelationGeometry(relation, refsByWayId, coordinateByNodeId);
      if (!geometry) {
        skipped++;
        continue;
      }

      const tags = this.parseTags(relation.tags_json);
      records.push({
        id: this.toNumber(relation.id),
        tags: Object.entries(tags).map(([k, v]) => ({ k, v })),
        geometry,
      });
    }

    if (skipped > 0) {
      console.warn(`[autk-db] ${layer}: ${skipped} relations skipped (missing member ways or geometry).`);
    }

    return { records, skipped };
  }

  /**
   * Builds a Polygon or MultiPolygon GeoJSON geometry for a single relation.
   *
   * @param relation - Relation row with member refs and types.
   * @param refsByWayId - Map of way ID → node refs.
   * @param coordinateByNodeId - Map of node ID → coordinate position.
   * @returns A Polygon or MultiPolygon geometry, or `null` if construction fails.
   */
  private buildRelationGeometry(
    relation: RelationRow,
    refsByWayId: Map<number, number[]>,
    coordinateByNodeId: Map<number, Position>,
  ): Polygon | MultiPolygon | null {
    const refs = this.toNumberArray(relation.refs);
    const roles = this.toStringArray(relation.ref_roles);
    const types = this.toStringArray(relation.ref_types);

    const outerWayIds: number[] = [];
    const innerWayIds: number[] = [];

    refs.forEach((ref, index) => {
      if (types[index] !== 'way') return;

      const role = roles[index] ?? '';
      if (role === 'inner') {
        innerWayIds.push(ref);
      } else if (role === 'outer' || role === '') {
        outerWayIds.push(ref);
      }
    });

    const outerRings = this.buildClosedRings(outerWayIds, refsByWayId, coordinateByNodeId);
    const innerRings = this.buildClosedRings(innerWayIds, refsByWayId, coordinateByNodeId);
    if (outerRings.length === 0) return null;

    const polygons = outerRings.map((outer) => [outer.coordinates] as Position[][]);

    for (const inner of innerRings) {
      const matchIndex = outerRings.length === 1
        ? 0
        : outerRings.findIndex((outer) => this.ringContainsPosition(outer.coordinates, inner.coordinates[0]));

      if (matchIndex === -1) {
        console.warn(`[autk-db] Skipped unmatched inner ring in relation ${String(relation.id)}.`);
        continue;
      }

      polygons[matchIndex].push(inner.coordinates);
    }

    if (polygons.length === 1) {
      return {
        type: 'Polygon',
        coordinates: polygons[0],
      };
    }

    return {
      type: 'MultiPolygon',
      coordinates: polygons,
    };
  }

  /**
   * Converts a set of way IDs into closed rings where possible, stitching open segments.
   *
   * @param wayIds - Way IDs that should form rings.
   * @param refsByWayId - Map from way ID to its node refs.
   * @param coordinateByNodeId - Map from node ID to its coordinate.
   * @returns An array of closed WayRing objects.
   */
  private buildClosedRings(
    wayIds: number[],
    refsByWayId: Map<number, number[]>,
    coordinateByNodeId: Map<number, Position>,
  ): WayRing[] {
    const standaloneClosedRings: WayRing[] = [];
    const openSegments: WayRing[] = [];

    for (const wayId of wayIds) {
      const refs = refsByWayId.get(wayId);
      if (!refs || refs.length < 2) continue;

      const coordinates = refs.map((ref) => coordinateByNodeId.get(ref));
      if (coordinates.some((coordinate) => !coordinate)) continue;

      const ring = { refs: [...refs], coordinates: coordinates as Position[] };
      if (refs.length > 3 && refs[0] === refs[refs.length - 1]) {
        standaloneClosedRings.push(ring);
      } else {
        openSegments.push(ring);
      }
    }

    return [...standaloneClosedRings, ...this.stitchOpenWaySegmentsIntoRings(openSegments)];
  }

  /**
   * Attempts to join open way segments into closed rings by repeatedly merging
   * segments that share endpoints.
   *
   * @param segments - Array of open way segments to stitch.
   * @returns Array of stitched rings (closed WayRing objects).
   */
  private stitchOpenWaySegmentsIntoRings(segments: WayRing[]): WayRing[] {
    const unusedSegments = [...segments];
    const rings: WayRing[] = [];

    while (unusedSegments.length > 0) {
      let current = unusedSegments.shift()!;
      let extended = true;

      while (extended) {
        extended = false;
        for (let i = 0; i < unusedSegments.length; i++) {
          const merged = this.tryMergeRings(current, unusedSegments[i]);
          if (!merged) continue;

          current = merged;
          unusedSegments.splice(i, 1);
          extended = true;
          break;
        }
      }

      if (current.refs.length > 3 && current.refs[0] === current.refs[current.refs.length - 1]) {
        rings.push(current);
      }
    }

    return rings;
  }

  /**
   * Tries to merge two way segments if their endpoints touch; returns the merged ring or null.
   */
  private tryMergeRings(a: WayRing, b: WayRing): WayRing | null {
    const aStart = a.refs[0];
    const aEnd = a.refs[a.refs.length - 1];
    const bStart = b.refs[0];
    const bEnd = b.refs[b.refs.length - 1];

    if (aEnd === bStart) return this.concatRings(a, b);
    if (aEnd === bEnd) return this.concatRings(a, this.reverseRing(b));
    if (aStart === bEnd) return this.concatRings(b, a);
    if (aStart === bStart) return this.concatRings(this.reverseRing(b), a);

    return null;
  }

  /**
   * Concatenates two rings by joining their refs and coordinates (dropping duplicated junction point).
   */
  private concatRings(left: WayRing, right: WayRing): WayRing {
    return {
      refs: [...left.refs, ...right.refs.slice(1)],
      coordinates: [...left.coordinates, ...right.coordinates.slice(1)],
    };
  }

  /**
   * Returns a new WayRing with refs and coordinates reversed.
   */
  private reverseRing(ring: WayRing): WayRing {
    return {
      refs: [...ring.refs].reverse(),
      coordinates: [...ring.coordinates].reverse(),
    };
  }

  /**
   * Point-in-polygon test (ray-casting) to determine if `position` lies inside `ring`.
   */
  private ringContainsPosition(ring: Position[], position: Position): boolean {
    const [x, y] = position;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects = ((yi > y) !== (yj > y))
        && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }

    return inside;
  }

  /**
   * Normalizes various tag encodings into a plain string-to-string record.
   *
   * Accepts Map, array-of-entries, and plain object encodings.
   */
  private parseTags(rawTags: unknown): Record<string, string> {
    const value = typeof rawTags === 'string' ? JSON.parse(rawTags) as unknown : rawTags;
    if (!value) return {};

    if (value instanceof Map) {
      return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), String(v)]));
    }

    if (Array.isArray(value)) {
      const entries = value.flatMap((entry): [string, string][] => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Record<string, unknown>;
        if ('k' in record && 'v' in record) return [[String(record.k), String(record.v)]];
        if ('key' in record && 'value' in record) return [[String(record.key), String(record.value)]];
        return [];
      });
      return Object.fromEntries(entries);
    }

    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      );
    }

    return {};
  }

  /**
   * Converts an iterable of numeric-like values into a number[] by coercion.
   */
  private toNumberArray(value: unknown): number[] {
    if (!value) return [];
    return Array.from(value as Iterable<unknown>).map((item) => this.toNumber(item));
  }

  /**
   * Converts an iterable of values into a string[] by coercion.
   */
  private toStringArray(value: unknown): string[] {
    if (!value) return [];
    return Array.from(value as Iterable<unknown>).map((item) => String(item));
  }

  private toNumber(value: unknown): number {
    return typeof value === 'bigint' ? Number(value) : Number(value);
  }
}

