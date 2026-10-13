import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Field, Float32, List, Table as ArrowTable, tableToIPC, vectorFromArray } from 'apache-arrow';
import type { Table, WorkspaceConfiguration } from '../../interfaces';
import { getRasterPayload } from '../../raster-store';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import type { SpatialQueryParams } from './interfaces';
import { SPATIAL_JOIN_QUERY } from './queries';

/** Joins compact band arrays via a per-feature, grid-indexed virtual pointset. */
export class RasterSpatialJoinUseCase {
  constructor(private conn: AsyncDuckDBConnection) {}

  async exec(params: SpatialQueryParams, root: Table, raster: Table, workspace: string,
    configuration: Partial<WorkspaceConfiguration> = {}): Promise<Table> {
    const payload = getRasterPayload(workspace, raster.name);
    if (!payload) throw new Error(`Raster payload for ${workspace}.${raster.name} is not available. Reload the raster before joining.`);
    const { width, height, sourceMinX, sourceMinY, resX, resY, sourceCrs } = payload;
    if (![width, height].every(n => Number.isInteger(n) && n > 0) ||
        ![sourceMinX, sourceMinY, resX, resY].every(Number.isFinite) || resX <= 0 || resY <= 0) {
      throw new Error(`Invalid source grid for raster ${raster.name}.`);
    }
    if (params.near && (!Number.isFinite(params.near.distance) || params.near.distance < 0)) {
      throw new Error('Raster near distance must be finite and non-negative.');
    }
    const allBands = payload.bands.map(band => band.id);
    const columns = params.groupBy?.length ? params.groupBy : null;
    const needsAllBands = !columns || columns.some(col => col.aggregateFn === 'collect' && col.column === '*');
    const selected = new Set(needsAllBands ? allBands : []);
    for (const col of columns ?? []) {
      if (col.aggregateFn === 'weighted') continue;
      if (col.column === '*' && (col.aggregateFn === 'count' || col.aggregateFn === 'collect')) continue;
      if (!allBands.includes(col.column)) throw new Error(`Unknown raster band ${col.column} in ${raster.name}.`);
      selected.add(col.column);
    }
    const bands = [...selected];
    for (const band of bands) {
      if (payload.values[band]?.length !== width * height) throw new Error(`Invalid values for raster band ${band}.`);
    }

    // One row of packed numeric lists, never a row/geometry per pixel. Only requested
    // bands cross the worker boundary; IPC avoids coupling DuckDB's Arrow version.
    const arrays = bands.length ? new ArrowTable(Object.fromEntries(bands.map(band => [band,
      vectorFromArray([payload.values[band]], new List(new Field('item', new Float32()))),
    ]))) : new ArrowTable({ seed: vectorFromArray(new Int32Array([1])) });
    const scratch = `_autk_raster_join_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const qualifiedScratch = `"${workspace.replace(/"/g, '""')}"."${scratch}"`;
    try {
      await this.conn.insertArrowFromIPCStream(tableToIPC(arrays, 'stream'), { name: scratch, schema: workspace, create: true });
      const targetCrs = configuration.coordinateFormat ?? payload.targetCrs;
      const precision = configuration.precisionGrid ?? 0;
      const rootColumn = root.columns.find(col => col.type === 'GEOMETRY')!.name;
      const rootGeometry = `autk_root_feature."${rootColumn.replace(/"/g, '""')}"`;
      const effectiveRoot = params.near && (params.near.useCentroid ?? true) ? `ST_Centroid(${rootGeometry})` : rootGeometry;
      const envelope = `ST_Expand(ST_Envelope(${effectiveRoot}), ${(params.near?.distance ?? 0) + precision})`;
      const escapedSource = sourceCrs.replace(/'/g, "''");
      const escapedTarget = targetCrs.replace(/'/g, "''");
      const sameCrs = sourceCrs === targetCrs;
      const mercator = new Set(['EPSG:3395', 'EPSG:3857']);
      const geographicSource = sourceCrs === 'EPSG:4326';
      const geographicTarget = targetCrs === 'EPSG:4326';
      const mercatorHalfWorld = Math.PI * 6378137; // WGS84 semi-major axis × 180° in radians.
      const mercatorSourceDomain = mercator.has(sourceCrs) && sourceMinX >= -mercatorHalfWorld &&
        sourceMinX + width * resX <= mercatorHalfWorld;
      // Axis-monotone transforms allow exact inverse bbox pruning. For other CRSs
      // conservatively visit the entire grid: transformed bbox corners alone cannot
      // bound a curved projection safely. Every actual cell center is still transformed.
      const monotone = sameCrs || (geographicSource && mercator.has(targetCrs) &&
        sourceMinX >= -180 && sourceMinX + width * resX <= 180) ||
        (geographicTarget && mercatorSourceDomain) || (mercatorSourceDomain && mercator.has(targetCrs));
      let bounds = `ST_MakeEnvelope(${sourceMinX}, ${sourceMinY}, ${sourceMinX + width * resX}, ${sourceMinY + height * resY})`;
      if (monotone) {
        const transformed = sameCrs ? envelope : `ST_Transform(${envelope}, '${escapedTarget}', '${escapedSource}', always_xy := true)`;
        if (geographicTarget && !sameCrs) {
          bounds = `CASE WHEN ST_XMin(${envelope}) >= -180 AND ST_XMax(${envelope}) <= 180 AND ST_YMin(${envelope}) > -90 AND ST_YMax(${envelope}) < 90 THEN ${transformed} ELSE ${bounds} END`;
        } else if (mercator.has(targetCrs) && !sameCrs) {
          // A search window crossing ±180° wraps when inverted; its corners no
          // longer bound the seam-adjacent cells, even for an otherwise monotone CRS.
          bounds = `CASE WHEN ST_XMin(${envelope}) >= ${-mercatorHalfWorld} AND ST_XMax(${envelope}) <= ${mercatorHalfWorld} THEN ${transformed} ELSE ${bounds} END`;
        } else {
          bounds = transformed;
        }
      }
      const center = `ST_Point(${sourceMinX} + (col + 0.5) * ${resX}, ${sourceMinY} + (row + 0.5) * ${resY})`;
      const projected = sameCrs ? center : `ST_Transform(${center}, '${escapedSource}', '${escapedTarget}', always_xy := true)`;
      const geometry = precision > 0 ? `ST_ReducePrecision(${projected}, ${precision})` : projected;
      const bandSql = bands.map(band => {
        const identifier = `"${band.replace(/"/g, '""')}"`;
        const value = `packed.${identifier}[row * ${width} + col + 1]`;
        return `CASE WHEN isfinite(${value}) THEN ${value} ELSE NULL END AS ${identifier}`;
      });
      const candidates = `
        WITH bounds AS (SELECT ${bounds} AS box WHERE ${rootGeometry} IS NOT NULL AND NOT ST_IsEmpty(${rootGeometry}))
        SELECT ${geometry} AS geometry${bandSql.length ? `, ${bandSql.join(', ')}` : ''}
        FROM bounds, ${qualifiedScratch} AS packed,
          LATERAL range(GREATEST(0, LEAST(${width}, FLOOR((ST_XMin(box) - ${sourceMinX}) / ${resX} - 0.5) - 1))::BIGINT,
                        GREATEST(0, LEAST(${width}, CEIL((ST_XMax(box) - ${sourceMinX}) / ${resX} - 0.5) + 2))::BIGINT) AS x(col),
          LATERAL range(GREATEST(0, LEAST(${height}, FLOOR((ST_YMin(box) - ${sourceMinY}) / ${resY} - 0.5) - 1))::BIGINT,
                        GREATEST(0, LEAST(${height}, CEIL((ST_YMax(box) - ${sourceMinY}) / ${resY} - 0.5) + 2))::BIGINT) AS y(row)
      `;
      const join: Table = { ...raster, columns: [{ name: 'geometry', type: 'GEOMETRY' },
        ...bands.map(name => ({ name, type: 'FLOAT' }))] };
      const query = SPATIAL_JOIN_QUERY({ workspace, tableRoot: root, tableJoin: join,
        geometricColumnRoot: rootColumn, geometricColumnJoin: 'geometry',
        spatialPredicate: params.near ? 'NEAR' : 'INTERSECT', nearDistance: params.near?.distance,
        nearUseCentroid: params.near?.useCentroid ?? true, groupBy: columns, rasterCandidates: candidates });
      const result = await this.conn.query(`CREATE OR REPLACE TABLE ${workspace}.${root.name} AS ${query}
        DESCRIBE ${workspace}.${root.name};`);
      return { ...root, columns: getColumnsFromDuckDbTableDescribe(result.toArray()) };
    } finally {
      await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedScratch};`);
    }
  }
}
