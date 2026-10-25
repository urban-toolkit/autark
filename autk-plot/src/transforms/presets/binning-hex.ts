/**
 * Hexagonal binning transform preset.
 *
 * Maps two numeric columns to a `width × height` pixel area, inset by one
 * hexagon radius so edge hexagons stay inside it, assigns every row
 * to the hexagon of a regular pointy-top grid that contains it, and reduces a
 * value column within each hexagon. Rows with a non-finite x or y are skipped.
 *
 * Each row is one feature and falls in exactly one hexagon, so features and
 * hexagons relate `N:1`, like `binning-2d` with hexagonal cells.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { BinningHexTransformConfig } from '../../api';
import type { TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { binnedProvenance, indexedBins } from '../provenance';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runBinningHex`.
 */
export type ExecutedBinningHexTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'binning-hex';
    /** Aggregated hexagon rows ready for hexbin rendering. */
    rows: BinningHexRow[];
    /** Data extent mapped to the pixel area inset by `radius`, `[min, max]` per axis. */
    extent: { x: [number, number]; y: [number, number] };
    /** Hexagon radius in pixels. */
    radius: number;
    /** Provenance `D0 features → D1 hexagons → D2 aggregates`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/**
 * A single aggregated hexagon ready for plot rendering.
 */
export type BinningHexRow = {
    /** Readable hexagon label: its center in data units, e.g. `"12M · 20k"`. */
    label: string;
    /** Center x in pixels of the binned area. */
    cx: number;
    /** Center y in pixels of the binned area, growing downward. */
    cy: number;
    /** The reduced numeric result (count, sum, avg, min, or max) for this hexagon. */
    value: number;
    /** How many rows fell into this hexagon. */
    count: number;
    /** Merged source feature ids from all rows in this hexagon, used for selection linking. */
    autkIds: number[];
};

// ---- Hexagon grid -------------------------------------------------------

/**
 * Returns the grid coordinates `[i, j]` of the hexagon containing a point.
 *
 * Pointy-top hexagons of radius `r`: rows are `1.5 r` apart and odd rows are
 * shifted by half a column. The point is tested against the two nearest
 * candidate centers, as in d3-hexbin.
 */
function hexagonOf(x: number, y: number, r: number): [number, number] {
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;

    let py = y / dy;
    let pj = Math.round(py);
    const px = x / dx - (pj & 1) / 2;
    let pi = Math.round(px);
    const py1 = py - pj;

    if (Math.abs(py1) * 3 > 1) {
        const px1 = px - pi;
        const pi2 = pi + (px < pi ? -1 : 1) / 2;
        const pj2 = pj + (py < pj ? -1 : 1);
        const px2 = px - pi2;
        const py2 = py - pj2;
        if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) {
            pi = pi2 + (pj & 1 ? 1 : -1) / 2;
            pj = pj2;
        }
    }
    py = pj;
    return [pi, py];
}

/** Center in pixels of hexagon `[i, j]`. */
function centerOf(i: number, j: number, r: number): [number, number] {
    return [(i + (j & 1) / 2) * r * Math.sqrt(3), j * r * 1.5];
}

/** Numeric extent of a column, `[0, 1]` when it has no finite value. */
function extentOf(rows: AutkDatum[], attr: string): [number, number] {
    const values = rows.map(row => Number(valueAtPath(row, attr))).filter(Number.isFinite);
    const [lo, hi] = d3.extent(values) as [number | undefined, number | undefined];
    return [lo ?? 0, hi ?? 1];
}

// ---- Runner -------------------------------------------------------------

/**
 * Runs a hexagonal binning transform and returns plot-ready hexagon rows.
 *
 * @param rows Input feature data to aggregate.
 * @param config Transform configuration: reducer, value column, radius, and pixel area.
 * @param columns Ordered attribute names; `columns[0]` is x and `columns[1]` is y.
 * @returns Hexagon rows sorted by grid position, with the data extent used.
 */
export function runBinningHex(rows: AutkDatum[], config: BinningHexTransformConfig, columns: string[]): ExecutedBinningHexTransform {
    const xAttr = columns[0] ?? '';
    const yAttr = columns[1] ?? '';
    const valueAttr = config.options?.value;
    const reducer = config.options?.reducer ?? 'count';
    const radius = config.options?.radius ?? 14;
    const width = config.options?.width ?? 800;
    const height = config.options?.height ?? 500;

    const xExtent = extentOf(rows, xAttr);
    const yExtent = extentOf(rows, yAttr);
    const toPixels = (row: AutkDatum): [number, number] | null => {
        const x = Number(valueAtPath(row, xAttr));
        const y = Number(valueAtPath(row, yAttr));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const u = (x - xExtent[0]) / (xExtent[1] - xExtent[0] || 1);
        const v = (y - yExtent[0]) / (yExtent[1] - yExtent[0] || 1);
        return [radius + u * (width - 2 * radius), radius + (1 - v) * (height - 2 * radius)];
    };

    const reduced = collectBuckets({
        rows,
        bucketOf: (row) => {
            const point = toPixels(row as AutkDatum);
            return point ? hexagonOf(point[0], point[1], radius).join(',') : null;
        },
        valueOf: (reducer === 'count' || !valueAttr) ? undefined : (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    // Row by row, then column by column, so ids and output follow the grid.
    const gridOf = (key: string) => key.split(',').map(Number) as [number, number];
    reduced.sort((a, b) => {
        const [ai, aj] = gridOf(a.key);
        const [bi, bj] = gridOf(b.key);
        return aj - bj || ai - bi;
    });
    const keys = reduced.map(bucket => bucket.key);

    const format = d3.format('~s');
    const dataAt = (cx: number, cy: number): [number, number] => [
        xExtent[0] + ((cx - radius) / (width - 2 * radius)) * (xExtent[1] - xExtent[0]),
        yExtent[0] + (1 - (cy - radius) / (height - 2 * radius)) * (yExtent[1] - yExtent[0]),
    ];

    return {
        preset: 'binning-hex',
        extent: { x: xExtent, y: yExtent },
        radius,
        provenance: binnedProvenance({
            rows,
            buckets: reduced,
            bins: indexedBins(keys, keys, 'hex'),
            binLabel: 'hexagons',
            rowKeys: keys,
            reducer,
        }),
        rows: reduced.map(bucket => {
            const [cx, cy] = centerOf(...gridOf(bucket.key), radius);
            const [x, y] = dataAt(cx, cy);
            return {
                label: `${format(x)} · ${format(y)}`,
                cx,
                cy,
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        }),
    };
}
