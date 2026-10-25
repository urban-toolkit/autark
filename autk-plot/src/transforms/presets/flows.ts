/**
 * Flows transform preset.
 *
 * Every row follows a path through one category per column (e.g. NTA type →
 * land use → district). Categories become nodes and consecutive steps become
 * links, both reduced over the rows that pass through them.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { FlowsTransformConfig } from '../../api';
import type { ProvenanceId, TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import type { Row } from '../kernel';
import { flowProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runFlows`.
 */
export type ExecutedFlowsTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'flows';
    /** Nodes of every column, then links between consecutive columns. */
    rows: FlowRow[];
    /** Provenance `D0 features → D1 segments → D2 links → D3 nodes`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A category of one column. */
export type FlowNodeRow = {
    /** Row kind discriminator. */
    kind: 'node';
    /** Node key, `<column>:<category>`. */
    key: string;
    /** Column index, `0` for the first column. */
    column: number;
    /** Category label. */
    label: string;
    /** Reduced numeric result over the rows in the category. */
    value: number;
    /** How many rows are in the category. */
    count: number;
    /** Merged source feature ids of the category, used for selection linking. */
    autkIds: number[];
};

/** A step between categories of two consecutive columns. */
export type FlowLinkRow = {
    /** Row kind discriminator. */
    kind: 'link';
    /** Link key, `JSON.stringify([column, source category, target category])`. */
    key: string;
    /** Column index of the source node. */
    column: number;
    /** Readable label, `"<source> → <target>"`. */
    label: string;
    /** Key of the source node. */
    source: string;
    /** Key of the target node. */
    target: string;
    /** Reduced numeric result over the rows that take this step. */
    value: number;
    /** How many rows take this step. */
    count: number;
    /** Merged source feature ids taking this step, used for selection linking. */
    autkIds: number[];
};

/** Node or link row produced by the flows preset. */
export type FlowRow = FlowNodeRow | FlowLinkRow;

/** Unit row reduced into nodes or links. */
type FlowUnit = Row & { autkIds: number[]; __key: string; __value: number | null };

// ---- Runner -------------------------------------------------------------

/**
 * Runs a flows transform and returns plot-ready nodes and links.
 *
 * @param rows Input feature rows.
 * @param config Transform configuration with reducer and optional value column.
 * @param columns Ordered categorical columns, at least two.
 * @returns Executed flows transform payload.
 * @throws If fewer than two columns are given.
 */
export function runFlows(rows: AutkDatum[], config: FlowsTransformConfig, columns: string[]): ExecutedFlowsTransform {
    if (columns.length < 2) {
        throw new Error('flows: at least two columns are required.');
    }
    const reducer = config.options?.reducer ?? 'count';
    const valueAttr = config.options?.value ?? '';

    const nodeUnits: FlowUnit[] = [];
    const segments: FlowUnit[] = [];
    const segmentIds: ProvenanceId[] = [];
    const ends = new Map<string, [string, string]>();

    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) && row.autkIds.length > 0 ? row.autkIds : [rowIndex];
        const raw = reducer === 'count' ? 1 : Number(valueAtPath(row, valueAttr));
        const value = Number.isFinite(raw) ? raw : null;
        const labels = columns.map(column => String(valueAtPath(row, column) ?? ''));

        labels.forEach((label, column) => {
            nodeUnits.push({ autkIds: ids, __key: `${column}:${label}`, __value: value });
        });
        for (let column = 0; column < labels.length - 1; column++) {
            const source = `${column}:${labels[column]}`;
            const target = `${column + 1}:${labels[column + 1]}`;
            // Unambiguous even when labels contain separators such as "→".
            const key = JSON.stringify([column, labels[column], labels[column + 1]]);
            ends.set(key, [source, target]);
            segments.push({ autkIds: ids, __key: key, __value: value });
            segmentIds.push(`segment:${ids.join('+')}.${column}`);
        }
    });

    const reduce = (units: FlowUnit[]) => collectBuckets({
        rows: units,
        bucketOf: (unit) => String(unit.__key),
        valueOf: reducer === 'count' ? undefined : (unit) => (unit as FlowUnit).__value,
        reducer,
    });
    const nodeBuckets = reduce(nodeUnits);
    const linkBuckets = reduce(segments);

    const columnOf = (key: string) => Number(key.slice(0, key.indexOf(':')));
    const nodeRows: FlowNodeRow[] = nodeBuckets
        .map(bucket => ({
            kind: 'node' as const,
            key: bucket.key,
            column: columnOf(bucket.key),
            label: bucket.key.slice(bucket.key.indexOf(':') + 1),
            value: bucket.value,
            count: bucket.count,
            autkIds: bucket.autkIds,
        }))
        .sort((a, b) => a.column - b.column || b.value - a.value);
    const linkRows: FlowLinkRow[] = linkBuckets
        .map(bucket => {
            const [source, target] = ends.get(bucket.key)!;
            return {
                kind: 'link' as const,
                key: bucket.key,
                column: columnOf(source),
                label: `${source.slice(source.indexOf(':') + 1)} → ${target.slice(target.indexOf(':') + 1)}`,
                source,
                target,
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        })
        .sort((a, b) => a.column - b.column || b.value - a.value);

    const nodeId = (key: string) => `node:${key}`;
    const linkId = (key: string) => `link:${key}`;
    const flowRows: FlowRow[] = [...nodeRows, ...linkRows];

    return {
        preset: 'flows',
        rows: flowRows,
        provenance: flowProvenance({
            segments,
            segmentIds,
            linkBuckets,
            linkId,
            endsOf: (key) => ends.get(key)!.map(nodeId) as [ProvenanceId, ProvenanceId],
            linkGroup: (key) => `step:${columnOf(ends.get(key)![0])}`,
            nodeUnits,
            nodeBuckets,
            nodeId,
            nodeGroup: (key) => `column:${columnOf(key)}`,
            rowIds: flowRows.map(row => row.kind === 'node' ? nodeId(row.key) : linkId(row.key)),
            reducer,
        }),
    };
}
