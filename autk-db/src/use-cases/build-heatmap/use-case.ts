
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams } from './interfaces';
import type { BoundingBox } from '../../types-core';
import { RasterBandMetadata, Table, UserTable } from '../../interfaces';
import { SpatialJoinUseCase } from '../spatial-join/use-case';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';

/**
 * Builds a heatmap by creating a spatial grid, aggregating source data into cells via NEAR join,
 * and converting the result to a raster table with bands.
 *
 * @note Creates an RTREE index on the grid geometry for efficient spatial joins.
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
     * Executes the heatmap build pipeline: grid creation, spatial join, and raster conversion.
     *
     * @param params - Heatmap configuration including grid size, aggregation columns, and NEAR distance.
     * @param tables - Available tables in the workspace; must include the source table referenced by `params.tableJoinName`.
     * @param boundingBox - Spatial extent defining the grid boundaries. Required.
     * @param workspace - DuckDB schema name where tables are created and queried.
     * @returns The resulting heatmap table with updated columns and raster band metadata.
     * @throws {Error} If `boundingBox` is not provided or the source table is missing from `tables`.
     * @example
     * const result = await useCase.exec(
     *   { tableJoinName: 'points', near: { distance: 50 }, outputTableName: 'heatmap', grid: { rows: 100, columns: 100 } },
     *   [pointsTable],
     *   { minLon: -74.1, minLat: 40.6, maxLon: -73.8, maxLat: 40.9 },
     *   'workspace',
     * );
     * console.log(result.bands); // [{ id: 'band_1', label: 'sum_points' }]
     */
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

    /**
     * Creates a rectangular grid table with one cell per row/column intersection,
     * centered within the given bounding box.
     *
     * @param params - Grid configuration including bounding box, dimensions, and table name.
     * @returns The created grid table metadata with geometry column and initial band structure.
     * @throws {Error} If `rows` or `columns` are zero or negative.
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

    /**
     * Replaces the `properties` column with explicit band columns extracted from JSON,
     * coalescing missing values to zero.
     *
     * @param tableName - Name of the table to transform in-place.
     * @param bands - Band metadata including JSON paths for value extraction.
     * @param workspace - DuckDB schema containing the table.
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
                geometry,
                {
${bandAssignments}
                } AS properties
            FROM ${qualifiedTableName};
        `;

        await this.conn.query(transformQuery);
    }

    /**
     * Derives raster band metadata from the group-by configuration, mapping each
     * aggregation column to a named band with its JSON extraction path.
     *
     * @param params - Heatmap parameters containing the group-by definitions.
     * @returns Array of band objects with `id`, `label`, and `jsonPath` for each aggregation column.
     */
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
