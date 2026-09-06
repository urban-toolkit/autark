import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { fromArrayBuffer } from 'geotiff';

import { GeotiffTable } from '../../interfaces';
import { LoadGeoTiffParams } from './interfaces';
import { DEFAULT_WORKSPACE_NAME, DEFAULT_INPUT_COORDINATE_FORMAT, DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { setRasterPayload } from '../../raster-store';

const DEFAULT_MAX_RASTER_CELLS = 1_000_000;

/**
 * Loads a GeoTIFF raster file into DuckDB as a compact metadata table.
 */
export class LoadGeoTiffUseCase {
  private conn: AsyncDuckDBConnection;

  constructor(_db: AsyncDuckDB, conn: AsyncDuckDBConnection) {
    void _db;
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
      maxRasterCells,
      maxPixels,
      resampleMethod = 'bilinear',
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
    const cellLimit = Math.max(1, Math.floor(maxRasterCells ?? maxPixels ?? DEFAULT_MAX_RASTER_CELLS));

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

    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage(0);

    const origin = image.getOrigin();
    const bbox = image.getBoundingBox();
    const originX = Number(origin[0]);
    const originY = Number(origin[1]);
    const sourceMinX = Math.min(Number(bbox[0]), Number(bbox[2]));
    const sourceMinY = Math.min(Number(bbox[1]), Number(bbox[3]));
    const sourceMaxX = Math.max(Number(bbox[0]), Number(bbox[2]));
    const sourceMaxY = Math.max(Number(bbox[1]), Number(bbox[3]));
    const fullWidth = Number(image.getWidth());
    const fullHeight = Number(image.getHeight());
    const bandCount = Number(image.getSamplesPerPixel());
    const fullPixelCount = fullWidth * fullHeight;

    const scale = fullPixelCount > cellLimit ? Math.sqrt(cellLimit / fullPixelCount) : 1;
    const width = Math.max(1, Math.min(fullWidth, Math.floor(fullWidth * scale)));
    const height = Math.max(1, Math.min(fullHeight, Math.floor(fullHeight * scale)));
    const actualResX = (sourceMaxX - sourceMinX) / width;
    const actualResY = (sourceMaxY - sourceMinY) / height;

    const rasters = await image.readRasters({ width, height, resampleMethod, interleave: false });

    const bandNames: string[] = [];
    const bandValues: Record<string, Float32Array> = {};
    const nodata = this.getNoDataValue(image);

    for (let b = 0; b < bandCount; b++) {
      const bandName = `band_${b + 1}`;
      bandNames.push(bandName);
      const source = (rasters as unknown as Array<ArrayLike<number>>)[b];
      const values = new Float32Array(source.length);
      for (let row = 0; row < height; row++) {
        const sourceRowOffset = row * width;
        const targetRowOffset = (height - 1 - row) * width;
        for (let col = 0; col < width; col++) {
          const value = Number(source[sourceRowOffset + col]);
          values[targetRowOffset + col] = Number.isFinite(value) && (nodata === null || value !== nodata) ? value : Number.NaN;
        }
      }
      bandValues[bandName] = values;
    }

    const transformedBounds = await this.resolveBounds(
      sourceMinX,
      sourceMinY,
      sourceMaxX,
      sourceMaxY,
      sourceCrs,
      targetCrs,
    );

    this.assertFiniteBounds(transformedBounds, sourceCrs, targetCrs);

    const bandColumnsSql = bandNames.map((b) => `0.0::DOUBLE AS "${b}"`).join(',\n        ');

    await this.conn.query(`
      CREATE OR REPLACE TABLE ${qualifiedTableName} AS
      SELECT
        ST_MakeEnvelope(${transformedBounds.minX}, ${transformedBounds.minY}, ${transformedBounds.maxX}, ${transformedBounds.maxY}) AS geometry,
        ${bandColumnsSql ? bandColumnsSql + ',' : ''}
        ${width}::INTEGER AS width,
        ${height}::INTEGER AS height,
        ${fullWidth}::INTEGER AS original_width,
        ${fullHeight}::INTEGER AS original_height,
        ${transformedBounds.minX}::DOUBLE AS min_x,
        ${transformedBounds.minY}::DOUBLE AS min_y,
        ${transformedBounds.maxX}::DOUBLE AS max_x,
        ${transformedBounds.maxY}::DOUBLE AS max_y,
        ${originX}::DOUBLE AS origin_x,
        ${originY}::DOUBLE AS origin_y,
        ${actualResX}::DOUBLE AS res_x,
        ${actualResY}::DOUBLE AS res_y,
        '${sourceCrs.replace(/'/g, "''")}'::VARCHAR AS source_crs,
        '${targetCrs.replace(/'/g, "''")}'::VARCHAR AS target_crs;
    `);

    setRasterPayload(workspace, outputTableName, {
      width,
      height,
      originalWidth: fullWidth,
      originalHeight: fullHeight,
      minX: transformedBounds.minX,
      minY: transformedBounds.minY,
      maxX: transformedBounds.maxX,
      maxY: transformedBounds.maxY,
      originX,
      originY,
      resX: actualResX,
      resY: actualResY,
      sourceCrs,
      targetCrs,
      bands: bandNames.map((bandName) => ({ id: bandName, label: bandName })),
      values: bandValues,
    });

    const describeResult = await this.conn.query(`DESCRIBE ${qualifiedTableName};`);
    return {
      source: 'geotiff',
      type: 'raster',
      name: outputTableName,
      columns: getColumnsFromDuckDbTableDescribe(describeResult.toArray()),
      bands: bandNames.map((bandName) => ({ id: bandName, label: bandName })),
    };
  }

  private getNoDataValue(image: any): number | null {
    const nodata = typeof image.getGDALNoData === 'function' ? Number(image.getGDALNoData()) : Number.NaN;
    return Number.isFinite(nodata) ? nodata : null;
  }

  private async resolveBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    sourceCrs: string,
    targetCrs: string,
  ): Promise<{ minX: number; minY: number; maxX: number; maxY: number }> {
    if (sourceCrs === targetCrs) {
      return { minX, minY, maxX, maxY };
    }

    const result = await this.conn.query(`
      WITH corners AS (
        SELECT ST_Transform(ST_Point(x, y), '${sourceCrs.replace(/'/g, "''")}', '${targetCrs.replace(/'/g, "''")}', always_xy := true) AS geom
        FROM (VALUES
          (${minX}, ${minY}),
          (${minX}, ${maxY}),
          (${maxX}, ${minY}),
          (${maxX}, ${maxY})
        ) AS pts(x, y)
      )
      SELECT
        MIN(ST_X(geom)) AS min_x,
        MIN(ST_Y(geom)) AS min_y,
        MAX(ST_X(geom)) AS max_x,
        MAX(ST_Y(geom)) AS max_y
      FROM corners;
    `);

    const row = result.toArray()[0] as Record<string, unknown> | undefined;
    if (!row) {
      return { minX, minY, maxX, maxY };
    }

    return {
      minX: Number(row.min_x),
      minY: Number(row.min_y),
      maxX: Number(row.max_x),
      maxY: Number(row.max_y),
    };
  }

  private assertFiniteBounds(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    sourceCrs: string,
    targetCrs: string,
  ): void {
    const values = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
    if (values.every((value) => Number.isFinite(value))) {
      return;
    }

    throw new Error(
      `Failed to transform GeoTIFF bounds from ${sourceCrs} to ${targetCrs}. ` +
      `The loader assumes EPSG:4326 (lat/lng) when coordinateFormat is not provided. ` +
      `If the raster is not in EPSG:4326, pass the correct coordinateFormat explicitly.`
    );
  }
}
