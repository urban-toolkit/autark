 
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import type { BoundingBox } from '../../types-core';
import { RasterBandMetadata, Table } from '../../interfaces';
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
                spatialPredicate: 'NEAR',
                nearDistance: params.nearDistance,
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

        // Get updated columns after transformation
        const describeTableResponse = await this.conn.query(`DESCRIBE ${workspace}.${gridTableName}`);
        const updatedColumns = getColumnsFromDuckDbTableDescribe(describeTableResponse.toArray());

        return {
            ...joinResult,
            columns: updatedColumns,
            bands: rasterBands.map(({ id, label }) => ({ id, label })),
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
        return (params.groupBy?.selectColumns ?? []).map((column, index) => {
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
