import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { FeatureCollection, LineString, Polygon } from 'geojson';
import { polygonize } from '@turf/turf';

import { PolygonizeOsmSurfaceParams } from './interfaces';
import { OsmLayerTable } from '../../interfaces';
import { GetLayerUseCase } from '../../use-cases/get-layer';
import { LOAD_FEATURE_COLLECTION_QUERY } from '../../use-cases/load-geojson/queries';
import { LOAD_POLYGONIZED_LAYER_QUERY } from './queries';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { DEFAULT_WORKSPACE_NAME } from '../../consts';

/**
 * Polygonizes a surface layer from line geometries into closed polygons using Turf.js.
 */
export class PolygonizeOsmSurfaceUseCase {
  /** DuckDB database instance for file operations. */
  private db: AsyncDuckDB;

  /** Active DuckDB connection for query execution. */
  private conn: AsyncDuckDBConnection;

  /** Helper use case for retrieving layer data. */
  private getLayerUseCase: GetLayerUseCase;

  /**
   * @param db DuckDB database instance.
   * @param conn Active DuckDB connection.
   */
  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
    this.getLayerUseCase = new GetLayerUseCase(conn);
  }

  /**
   * Polygonizes line geometries into closed surface polygons and persists the result.
   *
   * Drops the original table, polygonizes via Turf.js, loads the result back into DuckDB,
   * and cleans up temporary files.
   * @param params Configuration for the polygonization operation.
   * @param surfaceTable Metadata about the source surface layer.
   * @returns The updated layer table with polygonized geometry and properties.
   * @example const result = await useCase.exec({ surfaceTableName: 'osm_surface' }, tableMeta);
   */
  async exec(
    params: PolygonizeOsmSurfaceParams,
    surfaceTable: OsmLayerTable,
  ): Promise<OsmLayerTable> {
    const { surfaceTableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedSurfaceTableName = `${workspace}.${surfaceTableName}`;
    const qualifiedFeatureCollectionTableName = `${workspace}.${surfaceTableName}_feature_collection`;

    const geojson = (await this.getLayerUseCase.exec(
      surfaceTable,
      workspace,
    )) as FeatureCollection<LineString>;
    const polygonizedGeojson = polygonize(geojson) as FeatureCollection<Polygon>;

    await this.conn.query(`DROP TABLE IF EXISTS ${qualifiedSurfaceTableName};`);
    await this.conn.query(
      `DROP TABLE IF EXISTS ${qualifiedFeatureCollectionTableName};`,
    );

    const fileName = `temp_polygonized_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;

    await this.db.registerFileText(fileName, JSON.stringify(polygonizedGeojson));

    const featureCollectionQuery = LOAD_FEATURE_COLLECTION_QUERY(
      fileName,
      `${surfaceTableName}_feature_collection`,
      workspace,
    );
    await this.conn.query(featureCollectionQuery);

    const queryLayer = LOAD_POLYGONIZED_LAYER_QUERY(
      `${surfaceTableName}_feature_collection`,
      surfaceTableName,
      workspace,
    );

    const describeTableResponse = await this.conn.query(queryLayer);
    await this.db.dropFile(fileName);

    console.log('Loaded polygonized layer!');

    return {
      source: 'osm',
      type: 'surface',
      columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
      name: surfaceTableName,
    };
  }
}
