import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import type { BoundingBox } from '@urban-toolkit/autk-core';
import { RasterBandMetadata, Table, UserTable } from '../../interfaces';
import { SpatialJoinUseCase } from '../spatial-join/use-case';
import { getColumnsFromDuckDbTableDescribe, toPlain } from '../../utils';
import { setRasterPayload } from '../../raster-store';
import { DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '../../consts';

/**
 * Builds a heatmap by creating a spatial grid, aggregating source data into cells via NEAR join,
 * and materializing the result as a compact raster payload.
 *
 * @remarks Creates a temporary RTREE-backed point grid for the spatial join, then rewrites the
 * final output table into a compact one-row raster metadata table and stores flat band arrays
 * in the shared raster store.
 */
export class BuildHeatmapUseCase {
    private spatialJoinUseCase: SpatialJoinUseCase;

    /**
     * @param conn - Active DuckDB connection used for all queries.
     */
    constructor(private conn: AsyncDuckDBConnection) {
        this.spatialJoinUseCase = new SpatialJoinUseCase(conn);
    }

    /**
     * Executes the heatmap build pipeline: grid creation, spatial join, and compact raster materialization.
     */
    async exec(
        params: BuildHeatmapParams,
        tables: Array<Table>,
        boundingBox: BoundingBox | undefined,
        workspace: string,
        workspaceCoordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT,
    ): Promise<Table> {
        if (!boundingBox) {
            throw new Error('Bounding box is required to build a heatmap.');
        }

        const sourceTable = tables.find((t) => t.name === params.tableJoinName);
        if (!sourceTable) {
            throw new Error(`Table ${params.tableJoinName} not found.`);
        }

        const gridTableName = params.outputTableName;
        const gridTable = await this.createGridTable({
            boundingBox,
            rows: params.grid.rows,
            columns: params.grid.columns,
            outputTableName: gridTableName,
            workspace,
        });

        await this.spatialJoinUseCase.exec(
            {
                tableRootName: gridTableName,
                tableJoinName: params.tableJoinName,
                near: params.near,
                groupBy: params.groupBy,
            },
            [...tables, gridTable],
            workspace,
            { coordinateFormat: workspaceCoordinateFormat },
        );

        const rasterBands = this.getRasterBands(params);
        await this.transformToRasterFormat(gridTableName, rasterBands, workspace);
        await this.materializeCompactRaster(
            gridTableName,
            rasterBands,
            boundingBox,
            params.grid.rows,
            params.grid.columns,
            workspace,
            workspaceCoordinateFormat,
        );

        const describeTableResponse = await this.conn.query(`DESCRIBE ${workspace}.${gridTableName}`);
        const updatedColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

        return {
            source: 'user',
            type: 'raster',
            name: gridTableName,
            columns: updatedColumns,
            bands: rasterBands.map(({ id, label }) => ({ id, label })),
        };
    }

    /**
     * Creates a rectangular grid table with one point per cell center.
     */
    private async createGridTable(params: {
        boundingBox: BoundingBox;
        rows: number;
        columns: number;
        outputTableName: string;
        workspace: string;
    }): Promise<UserTable> {
        const { boundingBox, rows, columns, outputTableName, workspace } = params;
        const qualifiedTableName = `${workspace}.${outputTableName}`;

        if (rows <= 0 || columns <= 0) {
            throw new Error('Rows and columns must be positive integers.');
        }

        const { minLon, minLat, maxLon, maxLat } = boundingBox;

        await this.conn.query(`CREATE OR REPLACE TABLE ${qualifiedTableName} (
            row_index INTEGER,
            column_index INTEGER,
            geometry GEOMETRY,
            properties STRUCT(band_1 DOUBLE)
        );`);

        const lonStep = (maxLon - minLon) / columns;
        const latStep = (maxLat - minLat) / rows;

        const values: string[] = [];
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const centerLon = minLon + (column + 0.5) * lonStep;
                const centerLat = minLat + (row + 0.5) * latStep;
                values.push(`(${row}, ${column}, ST_Point(${centerLon}, ${centerLat}), {'band_1': 0::DOUBLE})`);
            }
        }

        await this.conn.query(`INSERT INTO ${qualifiedTableName} VALUES ${values.join(',')};`);
        await this.conn.query(`CREATE INDEX idx_${outputTableName}_geometry ON ${qualifiedTableName} USING RTREE (geometry);`);

        const describeTableResponse = await this.conn.query(`DESCRIBE ${qualifiedTableName}`);

        return {
            source: 'user',
            type: 'raster',
            name: outputTableName,
            columns: getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray()),
            bands: [{ id: 'band_1', label: 'band_1' }],
        };
    }

    /**
     * Replaces the `properties` column with explicit band values extracted from the join payload.
     */
    private async transformToRasterFormat(
        tableName: string,
        bands: Array<RasterBandMetadata & { jsonPath: string }>,
        workspace: string,
    ): Promise<void> {
        const qualifiedTableName = `${workspace}.${tableName}`;
        const bandAssignments = bands
            .map((band) => `                    '${band.id}': COALESCE(json_extract(properties, '${band.jsonPath}')::DOUBLE, 0)`) 
            .join(',\n');

        const transformQuery = `
            CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT 
                row_index,
                column_index,
                geometry,
                {
${bandAssignments}
                } AS properties
            FROM ${qualifiedTableName};
        `;

        await this.conn.query(transformQuery);
    }

    /**
     * Extracts the aggregated cell values into flat band arrays, stores them in the raster store,
     * and rewrites the DuckDB table to compact raster metadata only.
     */
    private async materializeCompactRaster(
        tableName: string,
        bands: Array<RasterBandMetadata & { jsonPath: string }>,
        boundingBox: BoundingBox,
        rows: number,
        columns: number,
        workspace: string,
        workspaceCoordinateFormat: string,
    ): Promise<void> {
        const qualifiedTableName = `${workspace}.${tableName}`;
        const bandSelect = bands.map((band) => `properties.${band.id} AS ${band.id}`).join(',\n          ');
        const result = await this.conn.query(`
          SELECT
            row_index,
            column_index,
            ${bandSelect}
          FROM ${qualifiedTableName}
          ORDER BY row_index ASC, column_index ASC;
        `);

        const flatSize = rows * columns;
        const values = Object.fromEntries(
            bands.map((band) => [band.id, new Float32Array(flatSize)])
        ) as Record<string, Float32Array>;

        for (const row of result.toArray()) {
            const plain = toPlain(row.toJSON() as Record<string, unknown>);
            const rowIndex = Number(plain.row_index);
            const columnIndex = Number(plain.column_index);
            const flatIndex = rowIndex * columns + columnIndex;

            for (const band of bands) {
                const numeric = Number(plain[band.id]);
                values[band.id][flatIndex] = Number.isFinite(numeric) ? numeric : 0;
            }
        }

        const { minLon, minLat, maxLon, maxLat } = boundingBox;
        const resX = (maxLon - minLon) / columns;
        const resY = (maxLat - minLat) / rows;

        setRasterPayload(workspace, tableName, {
            width: columns,
            height: rows,
            originalWidth: columns,
            originalHeight: rows,
            minX: minLon,
            minY: minLat,
            maxX: maxLon,
            maxY: maxLat,
            originX: minLon,
            originY: maxLat,
            sourceMinX: minLon,
            sourceMinY: minLat,
            resX,
            resY,
            sourceCrs: workspaceCoordinateFormat,
            targetCrs: workspaceCoordinateFormat,
            bands: bands.map(({ id, label }) => ({ id, label })),
            values,
        });

        await this.conn.query(`
          CREATE OR REPLACE TABLE ${qualifiedTableName} AS
          SELECT
            ${columns}::INTEGER AS width,
            ${rows}::INTEGER AS height,
            ${columns}::INTEGER AS original_width,
            ${rows}::INTEGER AS original_height,
            ${minLon}::DOUBLE AS min_x,
            ${minLat}::DOUBLE AS min_y,
            ${maxLon}::DOUBLE AS max_x,
            ${maxLat}::DOUBLE AS max_y,
            ${minLon}::DOUBLE AS origin_x,
            ${maxLat}::DOUBLE AS origin_y,
            ${resX}::DOUBLE AS res_x,
            ${resY}::DOUBLE AS res_y,
            '${workspaceCoordinateFormat}'::VARCHAR AS source_crs,
            '${workspaceCoordinateFormat}'::VARCHAR AS target_crs;
        `);
    }

    /**
     * Derives raster band metadata from the group-by configuration.
     */
    private getRasterBands(params: BuildHeatmapParams): Array<RasterBandMetadata & { jsonPath: string }> {
        const groupBy = params.groupBy && params.groupBy.length > 0
            ? params.groupBy
            : [{ column: '*', aggregateFn: 'count' as const }];

        return groupBy.map((column, index) => {
            const aggregateFn = (column.aggregateFn ?? 'value').toLowerCase();
            const sourceKey = aggregateFn === 'count' || aggregateFn === 'weighted'
                ? params.tableJoinName
                : `${params.tableJoinName}.${column.column}`;

            return {
                id: `band_${index + 1}`,
                label: `${aggregateFn}_${params.tableJoinName}`,
                jsonPath: `$.sjoin.${aggregateFn}.${sourceKey}`,
            };
        });
    }
}
