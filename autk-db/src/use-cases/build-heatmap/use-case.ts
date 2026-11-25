import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { BuildHeatmapParams, HeatmapAggregateFunction, HeatmapGroupBy } from './interfaces';
import type { BoundingBox } from '@urban-toolkit/autk-core';
import { RasterBandMetadata, Table, UserTable } from '../../interfaces';
import { SpatialJoinUseCase } from '../spatial-join/use-case';
import { countResultKeys } from '../spatial-join/queries';
import { getColumnsFromDuckDbTableDescribe, quoteJsonPathKey, toPlain } from '../../utils';
import { setRasterPayload } from '../../raster-store';
import { DEFAULT_WORKSPACE_CRS } from '../../consts';

type HeatmapBand = RasterBandMetadata & { jsonPath: string; normalize: boolean };

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
        workspaceCrs = DEFAULT_WORKSPACE_CRS,
    ): Promise<Table> {
        if (!boundingBox) {
            throw new Error('Bounding box is required to build a heatmap.');
        }

        const sigma = params.smoothingSigma === undefined ? 0 : params.smoothingSigma;
        if (!Number.isFinite(sigma) || sigma < 0 || sigma > 32) {
            throw new Error('Heatmap smoothingSigma must be a finite number between 0 and 32 grid cells.');
        }

        const sourceTable = tables.find((t) => t.name === params.tableJoinName);
        if (!sourceTable) {
            throw new Error(`Table ${params.tableJoinName} not found.`);
        }

        const groupBy: HeatmapGroupBy[] = params.groupBy?.length
            ? params.groupBy
            : [{ column: '*', aggregateFn: 'count' }];
        const supportedAggregates = {
            count: true, weighted: true, sum: true, avg: true, min: true, max: true,
        } satisfies Record<HeatmapAggregateFunction, true>;
        for (const { column, aggregateFn } of groupBy) {
            if (typeof aggregateFn !== 'string' || !Object.prototype.hasOwnProperty.call(supportedAggregates, aggregateFn)) {
                throw new Error(`Heatmap "${params.outputTableName}": "${column}" requires a valid aggregateFn (${Object.keys(supportedAggregates).join(', ')}).`);
            }
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
                // Normalize each output band separately, without adding keys to the joined properties.
                groupBy: groupBy.map(({ column, aggregateFn }) => ({ column, aggregateFn })),
            },
            [...tables, gridTable],
            workspace,
            { crs: workspaceCrs },
        );

        const rasterBands = this.getRasterBands(params, groupBy);
        await this.transformToRasterFormat(gridTableName, rasterBands, workspace);
        await this.materializeCompactRaster(
            gridTableName,
            rasterBands,
            boundingBox,
            params.grid.rows,
            params.grid.columns,
            workspace,
            workspaceCrs,
            sigma,
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
        bands: HeatmapBand[],
        workspace: string,
    ): Promise<void> {
        const qualifiedTableName = `${workspace}.${tableName}`;
        const bandAssignments = bands.map((band) => {
            const path = band.jsonPath.replace(/'/g, "''");
            const raw = `COALESCE(json_extract(properties, '${path}')::DOUBLE, 0)`;
            const min = `MIN(${raw}) OVER ()`;
            const max = `MAX(${raw}) OVER ()`;
            const value = band.normalize ? `COALESCE((${raw} - ${min}) / NULLIF(${max} - ${min}, 0), 0)` : raw;
            return `                    '${band.id}': ${value}`;
        }).join(',\n');

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
        bands: RasterBandMetadata[],
        boundingBox: BoundingBox,
        rows: number,
        columns: number,
        workspace: string,
        workspaceCrs: string,
        sigma: number,
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

        if (sigma > 0) this.smoothBands(values, rows, columns, sigma);

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
            sourceCrs: workspaceCrs,
            targetCrs: workspaceCrs,
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
            '${workspaceCrs}'::VARCHAR AS source_crs,
            '${workspaceCrs}'::VARCHAR AS target_crs;
        `);
    }

    /** Applies a separable Gaussian to each band, extending the edge cells at the raster boundary. */
    private smoothBands(values: Record<string, Float32Array>, rows: number, columns: number, sigma: number): void {
        const radius = Math.ceil(3 * sigma);
        const weights = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-0.5 * ((i - radius) / sigma) ** 2));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        const scratch = new Float32Array(rows * columns);

        // Write the vertical pass back into the band; only one temporary grid is needed.
        for (const band of Object.values(values)) {
            for (const horizontal of [true, false]) {
                const source = horizontal ? band : scratch;
                const target = horizontal ? scratch : band;
                for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < columns; col++) {
                        let sum = 0;
                        for (let offset = -radius; offset <= radius; offset++) {
                            const limit = horizontal ? columns : rows;
                            const index = Math.max(0, Math.min(limit - 1, (horizontal ? col : row) + offset));
                            const sample = horizontal ? row * columns + index : index * columns + col;
                            sum += source[sample] * weights[offset + radius];
                        }
                        target[row * columns + col] = sum / total;
                    }
                }
            }
        }
    }

    /**
     * Derives raster band metadata from the group-by configuration.
     *
     * A band is labelled `<aggregateFn>_<table>`, with `_norm` added when it is normalized. When bands of one
     * aggregate over different columns would share that label, each of them names its column too,
     * `<aggregateFn>_<table>_<column>` with the column's dots as underscores. Any remaining duplicates
     * receive a band-ID suffix without taking another band's preferred label.
     */
    private getRasterBands(params: BuildHeatmapParams, groupBy: HeatmapGroupBy[]): HeatmapBand[] {
        const countKeys = countResultKeys(params.tableJoinName, groupBy.filter(col => col.aggregateFn === 'count').map(col => col.column));
        const bands = groupBy.map((column, index) => {
            const aggregateFn = column.aggregateFn;
            const sourceKey = aggregateFn === 'count' ? countKeys.get(column.column)!
                : aggregateFn === 'weighted' ? params.tableJoinName
                : `${params.tableJoinName}.${column.column}`;
            const norm = column.normalize ? '_norm' : '';

            return {
                id: `band_${index + 1}`,
                label: `${aggregateFn}_${params.tableJoinName}${norm}`,
                // The join stores `<table>.<column>` as one key, so the path quotes it.
                jsonPath: `$.sjoin.${aggregateFn}.${quoteJsonPathKey(sourceKey)}`,
                normalize: column.normalize === true,
                columnLabel: sourceKey === params.tableJoinName
                    ? null
                    : `${aggregateFn}_${params.tableJoinName}_${column.column.replace(/\./g, '_')}${norm}`,
            };
        });

        const labelCounts = new Map<string, number>();
        for (const { label } of bands) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);

        const preferred = bands.map(({ columnLabel, ...band }) => ({
            ...band,
            label: columnLabel !== null && (labelCounts.get(band.label) ?? 0) > 1 ? columnLabel : band.label,
        }));
        const reserved = new Set(preferred.map(({ label }) => label));
        const used = new Set<string>();
        return preferred.map(band => {
            let label = band.label;
            if (used.has(label)) {
                const base = `${label}_${band.id}`;
                label = base;
                for (let suffix = 2; reserved.has(label) || used.has(label); suffix++) {
                    label = `${base}_${suffix}`;
                }
            }
            used.add(label);
            return { ...band, label };
        });
    }
}
