import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { fromArrayBuffer } from 'geotiff';

import { GeotiffTable } from '../../../shared/interfaces';
import { LoadGeoTiffParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../../shared/consts';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

const DEFAULT_MAX_PIXELS = 500_000;

/**
 * Loads a GeoTIFF raster file into DuckDB as a spatially-indexed table.
 */
export class LoadGeoTiffUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec(params: LoadGeoTiffParams & { workspaceCoordinateFormat?: string }): Promise<GeotiffTable> {
    const {
      geotiffFileUrl,
      geotiffArrayBuffer,
      outputTableName,
      coordinateFormat,
      workspace = DEFAULT_WORKSPACE_NAME,
      workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT,
      maxPixels = DEFAULT_MAX_PIXELS,
    } = params;

    if (!geotiffFileUrl && !geotiffArrayBuffer) {
      throw new Error('Either geotiffFileUrl or geotiffArrayBuffer must be provided.');
    }
    if (geotiffFileUrl && geotiffArrayBuffer) {
      throw new Error('Cannot provide both geotiffFileUrl and geotiffArrayBuffer.');
    }

    const sourceCrs = coordinateFormat || DEFAULT_INPUT_COORDINATE_FORMAT;
    const targetCrs = workspaceCoordinateFormat;
    const qualifiedTableName = `${workspace}.${outputTableName}`;
    const csvFile = `_geotiff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.csv`;

    // 1. Obtain the file buffer
    let buffer: ArrayBuffer;
    if (geotiffFileUrl) {
      const response = await fetch(geotiffFileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoTIFF from ${geotiffFileUrl}: HTTP ${response.status}`);
      }
      buffer = await response.arrayBuffer();
    } else {
      buffer = geotiffArrayBuffer!;
    }

    // 2. Parse metadata with geotiff.js
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage(0);

    const origin = image.getOrigin();
    const resolution = image.getResolution();
    const originX = origin[0];
    const originY = origin[1];
    const resX = resolution[0];
    const resY = resolution[1];
    const fullWidth = Number(image.getWidth());
    const fullHeight = Number(image.getHeight());
    const bandCount = Number(image.getSamplesPerPixel());

    // 3. Validate full raster pixel count
    const pixelCount = fullWidth * fullHeight;
    if (pixelCount > maxPixels) {
      throw new Error(
        `GeoTIFF is ${pixelCount.toLocaleString()} pixels, which exceeds the limit of ` +
        `${maxPixels.toLocaleString()}. Increase 'maxPixels' if your environment can handle it.`
      );
    }

    // 4. Decode full raster
    const rasters = await image.readRasters();

    // 5. Collect band arrays
    const bandNames: string[] = [];
    const bandData: Array<ArrayLike<number>> = [];
    for (let b = 0; b < bandCount; b++) {
      bandNames.push(`band_${b + 1}`);
      bandData.push((rasters as unknown as Array<ArrayLike<number>>)[b]);
    }

    // 6. Build CSV: header + one row per pixel
    const header = ['lon', 'lat', ...bandNames].join(',');
    const lines: string[] = [header];
    for (let row = 0; row < fullHeight; row++) {
      for (let col = 0; col < fullWidth; col++) {
        const idx = row * fullWidth + col;
        const lon = originX + (col + 0.5) * resX;
        const lat = originY + (row + 0.5) * resY;
        const bands = bandData.map((b) => { const v = b[idx]; return isNaN(v) ? '' : v; }).join(',');
        lines.push(`${lon},${lat},${bands}`);
      }
    }

    await this.db.registerFileText(csvFile, lines.join('\n'));

    try {
      // 7. Build geometry expression with CRS reprojection
      const shouldTransform = sourceCrs !== targetCrs;
      const geomExpr = shouldTransform
        ? `ST_Transform(ST_Point(lon, lat), '${sourceCrs}', '${targetCrs}', always_xy := true)`
        : `ST_Point(lon, lat)`;

      const propertiesExpr =
        bandNames.length > 0
          ? `{${bandNames.map((n) => `'${n}': "${n}"`).join(', ')}}`
          : `NULL::JSON`;

      // 8. Create the final table from the CSV
      await this.conn.query(`
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
        SELECT
          ${geomExpr} AS geometry,
          ${propertiesExpr} AS properties
        FROM read_csv('${csvFile}', header=true, delim=',');
      `);

      // 9. Spatial index for query performance
      await this.conn.query(
        `CREATE INDEX idx_${outputTableName}_geometry ON ${qualifiedTableName} USING RTREE (geometry);`
      );

      const describeResult = await this.conn.query(`DESCRIBE ${qualifiedTableName};`);
      return {
        source: 'geotiff',
        type: 'raster',
        name: outputTableName,
        columns: getColumnsFromDuckDbTableDescribe(describeResult.toArray()),
      };
    } finally {
      await this.db.dropFile(csvFile);
    }
  }
}
