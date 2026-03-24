import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { fromArrayBuffer } from 'geotiff';

import { GeoTiffTable } from '../../../shared/interfaces';
import { LoadGeoTiffParams } from './interfaces';
import { DEFALT_COORDINATE_FORMAT } from '../../../shared/consts';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

const DEFAULT_MAX_PIXELS = 500_000;

export class LoadGeoTiffUseCase {
  private db: AsyncDuckDB;
  private conn: AsyncDuckDBConnection;

  constructor(db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    this.db = db;
    this.conn = conn;
  }

  async exec(params: LoadGeoTiffParams): Promise<GeoTiffTable> {
    const {
      geotiffFileUrl,
      geotiffArrayBuffer,
      outputTableName,
      coordinateFormat = DEFALT_COORDINATE_FORMAT,
      sourceCrs,
      workspace = 'main',
      boundingBox,
      maxPixels = DEFAULT_MAX_PIXELS,
    } = params;

    if (!geotiffFileUrl && !geotiffArrayBuffer) {
      throw new Error('Either geotiffFileUrl or geotiffArrayBuffer must be provided.');
    }
    if (geotiffFileUrl && geotiffArrayBuffer) {
      throw new Error('Cannot provide both geotiffFileUrl and geotiffArrayBuffer.');
    }

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

    const origin = image.getOrigin();        // [originX, originY] — top-left corner in source CRS
    const resolution = image.getResolution(); // [resX, resY] — resY is negative
    const originX = origin[0];
    const originY = origin[1];
    const resX = resolution[0];
    const resY = resolution[1]; // negative
    const fullWidth = image.getWidth();
    const fullHeight = image.getHeight();
    const bandCount = image.getSamplesPerPixel();

    // 3. Compute pixel window from optional bounding box
    let window: [number, number, number, number] | undefined;
    if (boundingBox) {
      const xMin = Math.max(0, Math.floor((boundingBox.minLon - originX) / resX));
      const xMax = Math.min(fullWidth, Math.ceil((boundingBox.maxLon - originX) / resX));
      // resY is negative so the lat comparison is inverted
      const yMin = Math.max(0, Math.floor((boundingBox.maxLat - originY) / resY));
      const yMax = Math.min(fullHeight, Math.ceil((boundingBox.minLat - originY) / resY));
      window = [xMin, yMin, xMax, yMax];
    }

    const windowWidth  = window ? window[2] - window[0] : fullWidth;
    const windowHeight = window ? window[3] - window[1] : fullHeight;
    const pixelCount   = windowWidth * windowHeight;

    if (pixelCount > maxPixels) {
      throw new Error(
        `GeoTIFF region is ${pixelCount.toLocaleString()} pixels, which exceeds the limit of ` +
        `${maxPixels.toLocaleString()}. Supply a 'boundingBox' to clip to a smaller area, ` +
        `or increase 'maxPixels' if your environment can handle it.`
      );
    }

    // 4. Decode pixel data (optionally windowed)
    const rasters = await image.readRasters({ window });
    const colOffset = window ? window[0] : 0;
    const rowOffset = window ? window[1] : 0;

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
    for (let row = 0; row < windowHeight; row++) {
      for (let col = 0; col < windowWidth; col++) {
        const idx = row * windowWidth + col;
        const lon = originX + (colOffset + col + 0.5) * resX;
        const lat = originY + (rowOffset + row + 0.5) * resY;
        const bands = bandData.map((b) => b[idx]).join(',');
        lines.push(`${lon},${lat},${bands}`);
      }
    }

    await this.db.registerFileText(csvFile, lines.join('\n'));

    try {
      // 7. Build geometry expression with optional CRS reprojection
      const shouldTransform = sourceCrs && sourceCrs !== coordinateFormat;
      const geomExpr = shouldTransform
        ? `ST_Transform(ST_Point(lon, lat), '${sourceCrs}', '${coordinateFormat}', always_xy := true)`
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
