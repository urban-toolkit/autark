 
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import { BoundingBox, Table } from '../../interfaces';
import { LoadGridLayerUseCase } from '../load-grid-layer/load-grid-layer-use-case';
import { SpatialJoinUseCase } from '../spatial-join/spatial-join-use-case';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';

/**
 * Builds a heatmap grid by spatially joining source data into grid cells.
 */
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
        const gridTable = await this.loadGridLayerUseCase.exec({
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
                joinType: 'LEFT',
                spatialPredicate: 'NEAR',
                nearDistance: params.nearDistance,
                groupBy: params.groupBy,
                output: {
                    type: 'MODIFY_ROOT',
                },
            },
            [...tables, gridTable],
            workspace,
        );

        await this.transformToRasterFormat(
            gridTableName,
            params.grid.rows,
            params.grid.columns,
            workspace,
        );

        // Get updated columns after transformation
        const describeTableResponse = await this.conn.query(`DESCRIBE ${workspace}.${gridTableName}`);
        const updatedColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

        return {
            ...joinResult.table,
            columns: updatedColumns,
        };
    }

    private async transformToRasterFormat(
        tableName: string,
        rows: number,
        columns: number,
        workspace: string,
    ): Promise<void> {
        const qualifiedTableName = `${workspace}.${tableName}`;
        const transformQuery = `
            CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT 
                ST_Point(0, 0) AS geometry,
                {
                    'raster': list(properties.sjoin ORDER BY CAST(properties->>'row' AS INTEGER), CAST(properties->>'column' AS INTEGER)),
                    'rasterResX': ${columns},
                    'rasterResY': ${rows}
                } AS properties
            FROM ${qualifiedTableName};
        `;

        await this.conn.query(transformQuery);
    }
}
