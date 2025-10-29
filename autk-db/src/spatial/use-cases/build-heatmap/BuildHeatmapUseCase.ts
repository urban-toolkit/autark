/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import { BoundingBox, Table } from '../../../shared/interfaces';
import { LoadGridLayerUseCase } from '../load-grid-layer/LoadGridLayerUseCase';
import { SpatialJoinUseCase } from '../spatial-join/SpatialJoinUseCase';
import { getColumnsFromDuckDbTableDescribe } from '../../shared/utils';

export class BuildHeatmapUseCase {
    private loadGridLayerUseCase: LoadGridLayerUseCase;
    private spatialJoinUseCase: SpatialJoinUseCase;

    constructor(private conn: AsyncDuckDBConnection) {
        this.loadGridLayerUseCase = new LoadGridLayerUseCase(conn);
        this.spatialJoinUseCase = new SpatialJoinUseCase(conn);
    }

    async exec(
        params: BuildHeatmapParams,
        tables: Array<Table>,
        boundingBox?: BoundingBox,
    ): Promise<Table> {
        if (!boundingBox) {
            throw new Error('Bounding box is required to build a heatmap.');
        }

        const sourceTable = tables.find((t) => t.name === params.tableJoinName);
        if (!sourceTable) {
            throw new Error(`Table ${params.tableJoinName} not found.`);
        }

        const gridTableName = params.outputTableName;
        const gridTable = await this.loadGridLayerUseCase.exec({
            boundingBox,
            rows: params.grid.rows,
            columns: params.grid.columns,
            outputTableName: gridTableName,
        });

        const joinResult = await this.spatialJoinUseCase.exec(
            {
                tableRootName: gridTableName,
                tableJoinName: params.tableJoinName,
                joinType: 'LEFT',
                spatialPredicate: 'NEAR',
                nearDistance: params.nearDistance,
                groupBy: params.groupBy,
                output: {
                    type: 'MODIFY_ROOT',
                },
            },
            [...tables, gridTable],
        );

        await this.transformToRasterFormat(
            gridTableName,
            params.grid.rows,
            params.grid.columns
        );

        // Get updated columns after transformation
        const describeTableResponse = await this.conn.query(`DESCRIBE ${gridTableName}`);
        const updatedColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

        return {
            ...joinResult.table,
            columns: updatedColumns,
        };
    }

    private async transformToRasterFormat(
        tableName: string,
        rows: number,
        columns: number
    ): Promise<void> {
        // Transform the grid table into a single row with raster array
        // The raster will contain all aggregation results from properties.sjoin
        const transformQuery = `
            CREATE OR REPLACE TABLE ${tableName} AS
            SELECT 
                ST_Point(0, 0) AS geometry,
                {
                    'raster': list(properties.sjoin ORDER BY properties.row, properties."column"),
                    'rasterResX': ${columns},
                    'rasterResY': ${rows}
                } AS properties
            FROM ${tableName};
        `;

        await this.conn.query(transformQuery);
    }
}
