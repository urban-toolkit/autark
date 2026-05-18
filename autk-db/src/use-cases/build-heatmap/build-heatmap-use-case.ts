
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import type { BoundingBox } from '../../types-core';
import { RasterBandMetadata, Table, UserTable } from '../../interfaces';
import { SpatialJoinUseCase } from '../spatial-join/spatial-join-use-case';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';

/**
 * Builds a heatmap table by creating a grid, aggregating source values into it, and converting the result to raster bands.
 */
export class BuildHeatmapUseCase {
    private spatialJoinUseCase: SpatialJoinUseCase;

    constructor(private conn: AsyncDuckDBConnection) {
        this.spatialJoinUseCase = new SpatialJoinUseCase(conn);
    }

    async exec(
        params: BuildHeatmapParams,
        tables: Array<Table>,
        boundingBox: BoundingBox | undefined,
        workspace: string,
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

        const joinResult = await this.spatialJoinUseCase.exec(
            {
                tableRootName: gridTableName,
                tableJoinName: params.tableJoinName,
                near: params.near,
                groupBy: params.groupBy,
            },
            [...tables, gridTable],
            workspace,
        );

        const rasterBands = this.getRasterBands(params);
        await this.transformToRasterFormat(
            gridTableName,
            rasterBands,
            workspace,
        );

        const describeTableResponse = await this.conn.query(`DESCRIBE ${workspace}.${gridTableName}`);
        const updatedColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

        return {
            ...joinResult,
            columns: updatedColumns,
            bands: rasterBands.map(({ id, label }) => ({ id, label })),
        };
    }

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
                values.push(`(ST_Point(${centerLon}, ${centerLat}), {'band_1': 0::DOUBLE})`);
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
                geometry,
                {
${bandAssignments}
                } AS properties
            FROM ${qualifiedTableName};
        `;

        await this.conn.query(transformQuery);
    }

    private getRasterBands(params: BuildHeatmapParams): Array<RasterBandMetadata & { jsonPath: string }> {
        return (params.groupBy ?? []).map((column, index) => {
            const aggregateFn = (column.aggregateFn ?? 'value').toLowerCase();
            const sourceKey = aggregateFn === 'count' || aggregateFn === 'weighted' || aggregateFn === 'collect'
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
