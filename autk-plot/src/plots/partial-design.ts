/**
 * The highlight of a selection from another view, in three modes, and the channel each mark
 * family repeats, inferred from the drawing.
 *
 * `boolean` highlights the whole mark. `subset` draws the mark again with the value of the
 * selected subset, through the plot's own encoding (the same channel, the scales of the whole
 * data), in the highlight color. `custom` draws another metaphor: a plot's own function, or a
 * preset for marks whose encoding cannot show a part (`glyph`, `trace`, `members`).
 *
 * A drawing never says which channel encodes the value of a mark (a `<rect>` may be a bar, a heat
 * matrix cell, or a treemap leaf), but each mark binds its row, so the channel is found by
 * fitting: the measure proportional (or linear) to the row value across the marks of a kind, with
 * three distinct values and R² ≥ 0.99, is the channel a subset render repeats. When no measure
 * follows the value (it is in the color), the `glyph` preset shows the part. With avg, min, or
 * max, the subset value is a statistic drawn on the same channel, or as a half-size mark of the
 * statistic's color when the color encodes the value. `position` and `members` apply only to
 * aggregated rows: a one-to-one mark has no partial value to show.
 */

import { format, select } from 'd3';

import type { AutkDatum } from '../types-plot';
import type { SegregatedPart } from '../plot-base-interactive';

/** The three ways a mark shows the part of it that a selection produces. */
export type HighlightMode = 'boolean' | 'subset' | 'custom';

/** Channels a subset render repeats: the plot's own encoding, with the value of the subset. */
export type SubsetChannel = 'length' | 'position' | 'band' | 'angle' | 'width' | 'area' | 'units';

/** Ready-made custom highlights, for marks whose encoding cannot show a part. */
export type CustomPreset = 'glyph' | 'trace' | 'members';

/** Mark families, resolved separately (a Pareto chart has bars and points). */
export type MarkKind = 'rect' | 'point' | 'sector' | 'stroke' | 'shape' | 'html';

/**
 * Highlight of one mark family, as a plot declares it.
 *
 * - `{ mode: 'boolean' }`: the whole mark.
 * - `{ mode: 'subset', channel }`: the mark drawn with the subset's value on `channel`.
 * - `{ mode: 'custom', preset }`: a ready-made metaphor (a plot's own one is `highlight` as a function).
 */
export type HighlightRule =
    | { mode: 'boolean' }
    | {
        mode: 'subset';
        channel: SubsetChannel;
        /** Axis of `length` and `position`. */
        axis?: 'x' | 'y' | 'radial';
        /** Side `length` grows from: top/left (`start`), bottom/right (`end`), or `center`. */
        anchor?: 'start' | 'end' | 'center';
        /** Coordinate of the value 0 for `position` on x or y. */
        baseline?: number;
        /** Path of a `band`: a flow (`flow`, as a Sankey link) or a ribbon (`ribbon`, as a chord). */
        shape?: 'flow' | 'ribbon';
    }
    | {
        mode: 'custom';
        preset: CustomPreset;
        /** Axis of `members`. */
        axis?: 'x' | 'y';
        /** `members`: coordinate of a value, `a + k·value`, and the two fields the mark spans. */
        scale?: { a: number; k: number; fields: [string, string] };
    };

/** Highlight resolved for one mark family, declared or inferred, with its evidence. */
export type HighlightDesign = HighlightRule & {
    kind: MarkKind;
    /** Number of marks of the family. */
    marks: number;
    /** R² of the fit that proved the channel. */
    fit?: number;
    /**
     * The glyph preset stands in because the drawing gives no evidence for a channel (fewer than
     * three distinct values), not because none follows the value: declaring the channel would
     * draw a subset render. Never set on a declared highlight.
     */
    unproven?: true;
    /** Why this highlight was chosen. */
    reason: string;
};

/** What a design draws: its channel, its preset, or the whole mark. */
export type HighlightRuleName = SubsetChannel | CustomPreset | 'whole';

/**
 * What a highlight draws, whatever its mode.
 *
 * @param rule Declared or resolved highlight.
 * @returns The channel of a subset render, the preset of a custom one, or `whole` for boolean.
 */
export function ruleOf(rule: HighlightRule): HighlightRuleName {
    return rule.mode === 'subset' ? rule.channel : rule.mode === 'custom' ? rule.preset : 'whole';
}

/** Minimum R² for a fit to prove a channel. */
const MIN_FIT = 0.99;

/** Affine matrix `[a, b, c, d, e, f]`, as in SVG. */
type Matrix = [number, number, number, number, number, number];
type Box = { x: number; y: number; width: number; height: number };
type Point = [number, number];

/** One mark measured in its parent's coordinates. */
type MarkInfo = {
    element: SVGGraphicsElement;
    row: AutkDatum;
    kind: MarkKind;
    value: number;
    box: Box | null;
    sector: Sector | null;
    strokeWidth: number;
    feature: number | null;
};

/** Annular sector around the local origin: d3.arc output `M A L [A] Z`. */
export type Sector = { inner: number; outer: number; sweep: number; start: number; clockwise: boolean };

/** Flow band: two parallel cubic edges (`M C L C Z`), the second offset from the first. */
type Flow = { edge: Point[]; offset: Point };

/** Ribbon between two arcs of one circle (d3.ribbon output `M A Q A Q Z`). */
type Ribbon = { radius: number; source: [number, number]; target: [number, number] };

const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * Own `transform` of an element (translate and scale; other functions are ignored).
 *
 * @param element Element to read.
 * @returns Affine matrix of the transform.
 */
export function ownMatrix(element: Element): Matrix {
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    const text = element.getAttribute('transform') ?? '';
    for (const [, name, args] of text.matchAll(/(translate|scale)\s*\(([^)]*)\)/g)) {
        const [p, q] = args.split(/[\s,]+/).filter(Boolean).map(Number);
        matrix = multiply(matrix, name === 'translate' ? [1, 0, 0, 1, p || 0, q || 0] : [p, 0, 0, q ?? p, 0, 0]);
    }
    return matrix;
}

/** Number in a geometry attribute (`0` when absent, as SVG reads it). */
const attribute = (element: Element, name: string) => Number(element.getAttribute(name) ?? 0) || 0;

/** Local box of a basic shape from its geometry attributes, or `null` for other elements. */
function attributeBox(element: Element): Box | null {
    switch (element.tagName.toLowerCase()) {
        case 'rect':
            return { x: attribute(element, 'x'), y: attribute(element, 'y'), width: attribute(element, 'width'), height: attribute(element, 'height') };
        case 'circle': {
            const r = attribute(element, 'r');
            return { x: attribute(element, 'cx') - r, y: attribute(element, 'cy') - r, width: 2 * r, height: 2 * r };
        }
        case 'ellipse': {
            const [rx, ry] = [attribute(element, 'rx'), attribute(element, 'ry')];
            return { x: attribute(element, 'cx') - rx, y: attribute(element, 'cy') - ry, width: 2 * rx, height: 2 * ry };
        }
        case 'line': {
            const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(name => attribute(element, name));
            return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        }
        case 'polygon':
        case 'polyline':
            return boxOfPoints((element.getAttribute('points') ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []);
        case 'path': {
            // Polygons only (absolute M and L, as a hexagon): curves have no box from their numbers.
            const parsed = commandsOf(element.getAttribute('d'));
            if (!parsed || !/^M[ML]*Z?$/.test(parsed.letters)) return null;
            return boxOfPoints(parsed.numbers.flat());
        }
        default:
            return null;
    }
}

/** Box of a flat list of coordinates `x0, y0, x1, y1, ...`. */
function boxOfPoints(numbers: number[]): Box | null {
    if (numbers.length < 2) return null;
    const xs = numbers.filter((_n, i) => i % 2 === 0);
    const ys = numbers.filter((_n, i) => i % 2 === 1);
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
    return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/**
 * Local box of a mark, or `null` when the environment cannot measure it.
 *
 * Without layout (jsdom has no `getBBox`; a browser measures an empty box
 * outside the document), basic shapes are measured from their attributes,
 * which is the box a browser gives them.
 */
function localBox(element: SVGGraphicsElement): Box | null {
    const fallback = attributeBox(element);
    try {
        const box = element.getBBox();
        const empty = box.width === 0 && box.height === 0 && box.x === 0 && box.y === 0;
        if (empty && fallback && (fallback.width > 0 || fallback.height > 0)) return fallback;
        return { x: box.x, y: box.y, width: box.width, height: box.height };
    } catch {
        return fallback;
    }
}

/** Box of a mark in its parent's coordinates. */
function parentBox(element: SVGGraphicsElement): Box | null {
    const box = localBox(element);
    if (!box) return null;
    const [a, , , d, e, f] = ownMatrix(element);
    const x0 = a * box.x + e;
    const y0 = d * box.y + f;
    const x1 = a * (box.x + box.width) + e;
    const y1 = d * (box.y + box.height) + f;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

/** Commands of a path: their letters, and the numbers of each. */
function commandsOf(d: string | null): { letters: string; numbers: number[][] } | null {
    if (!d) return null;
    // Command letters only: an exponent (5e-15) is part of a number.
    const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) ?? [];
    return {
        letters: commands.map(c => c[0]).join(''),
        numbers: commands.map(c => (c.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)),
    };
}

const TURN = 2 * Math.PI;
const angleOf = ([x, y]: Point) => Math.atan2(y, x);

/** Sweep of an arc from `p0` to `p1` with SVG flags. */
function sweepOf(p0: Point, p1: Point, large: number, clockwise: boolean): number {
    const raw = angleOf(p1) - angleOf(p0);
    let sweep = ((clockwise ? raw : -raw) % TURN + TURN) % TURN;
    if (large && sweep < Math.PI) sweep = TURN - sweep;
    return sweep;
}

/**
 * Parses a d3.arc sector centered on the local origin.
 *
 * @param d Path data.
 * @returns The sector, or `null` when the path is not one.
 */
export function parseSector(d: string | null): Sector | null {
    const parsed = commandsOf(d);
    if (!parsed || !/^MA(LA?)?Z?$/.test(parsed.letters)) return null;
    const { numbers } = parsed;
    const p0: Point = [numbers[0][0], numbers[0][1]];
    const [outer, , , large, sweepFlag, x1, y1] = numbers[1];
    if (!(outer > 0) || Math.abs(Math.hypot(...p0) - outer) > 1e-3 * outer) return null;
    const clockwise = sweepFlag === 1;
    const inner = parsed.letters.length >= 4 && parsed.letters[3] === 'A' ? numbers[3][0] : 0;
    return { inner, outer, sweep: sweepOf(p0, [x1, y1], large, clockwise), start: angleOf(p0), clockwise };
}

/**
 * Path of a sector keeping its radii and start, with a new sweep.
 *
 * @param sector Sector to redraw.
 * @param sweep New sweep, in radians.
 * @returns Path data.
 */
export function sectorPath(sector: Sector, sweep: number): string {
    const end = sector.start + (sector.clockwise ? sweep : -sweep);
    const at = (r: number, a: number) => `${r * Math.cos(a)},${r * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const flag = sector.clockwise ? 1 : 0;
    const outer = `M${at(sector.outer, sector.start)}A${sector.outer},${sector.outer},0,${large},${flag},${at(sector.outer, end)}`;
    return sector.inner > 0
        ? `${outer}L${at(sector.inner, end)}A${sector.inner},${sector.inner},0,${large},${1 - flag},${at(sector.inner, sector.start)}Z`
        : `${outer}L0,0Z`;
}

/**
 * Parses a flow band whose second edge is the first one offset by a constant vector.
 *
 * @param d Path data.
 * @returns The band, or `null` when the path is not one.
 */
export function parseFlow(d: string | null): Flow | null {
    const parsed = commandsOf(d);
    if (!parsed || parsed.letters !== 'MCLCZ') return null;
    const [m, c1, l, c2] = parsed.numbers;
    const edge: Point[] = [[m[0], m[1]], [c1[0], c1[1]], [c1[2], c1[3]], [c1[4], c1[5]]];
    const back: Point[] = [[c2[4], c2[5]], [c2[2], c2[3]], [c2[0], c2[1]], [l[0], l[1]]];
    const offset: Point = [back[0][0] - edge[0][0], back[0][1] - edge[0][1]];
    const scale = Math.max(1, ...edge.flat().map(Math.abs));
    const parallel = back.every(([x, y], i) => Math.abs(x - edge[i][0] - offset[0]) <= 1e-6 * scale && Math.abs(y - edge[i][1] - offset[1]) <= 1e-6 * scale);
    return parallel ? { edge, offset } : null;
}

/**
 * Path of a flow band with a new offset of its second edge.
 *
 * @param flow Band to redraw.
 * @param ratio Fraction of the offset to keep.
 * @returns Path data.
 */
export function flowPath(flow: Flow, ratio: number): string {
    const [ox, oy] = [flow.offset[0] * ratio, flow.offset[1] * ratio];
    const [p0, c1, c2, p1] = flow.edge;
    const shift = ([x, y]: Point) => `${x + ox},${y + oy}`;
    return `M${p0[0]},${p0[1]}C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p1[0]},${p1[1]}`
        + `L${shift(p1)}C${shift(c2)} ${shift(c1)} ${shift(p0)}Z`;
}

/**
 * Parses a d3.ribbon path: source and target arcs (start and sweep) of one circle.
 *
 * @param d Path data.
 * @returns The ribbon, or `null` when the path is not one.
 */
export function parseRibbon(d: string | null): Ribbon | null {
    const parsed = commandsOf(d);
    if (!parsed || parsed.letters !== 'MAQAQZ') return null;
    const [m, a1, q1, a2] = parsed.numbers;
    const radius = a1[0];
    const s0: Point = [m[0], m[1]];
    const t0: Point = [q1[2], q1[3]];
    return {
        radius,
        source: [angleOf(s0), sweepOf(s0, [a1[5], a1[6]], a1[3], a1[4] === 1)],
        target: [angleOf(t0), sweepOf(t0, [a2[5], a2[6]], a2[3], a2[4] === 1)],
    };
}

/**
 * Path of a ribbon keeping the leading `ratio` of both arcs.
 *
 * @param ribbon Ribbon to redraw.
 * @param ratio Leading fraction of both arcs to keep.
 * @returns Path data.
 */
export function ribbonPath(ribbon: Ribbon, ratio: number): string {
    const at = (a: number) => `${ribbon.radius * Math.cos(a)},${ribbon.radius * Math.sin(a)}`;
    const arc = ([start, sweep]: [number, number]) => {
        const s = sweep * ratio;
        return { from: at(start), to: `${ribbon.radius},${ribbon.radius},0,${s > Math.PI ? 1 : 0},1,${at(start + s)}` };
    };
    const source = arc(ribbon.source);
    const target = arc(ribbon.target);
    return `M${source.from}A${source.to}Q0,0,${target.from}A${target.to}Q0,0,${source.from}Z`;
}

/** Whether a mark is drawn by its stroke only. */
function strokeOnly(element: SVGElement, colorProperty: 'fill' | 'stroke'): boolean {
    const tag = element.tagName.toLowerCase();
    if (tag === 'line' || tag === 'polyline') return true;
    const fill = element.getAttribute('fill') ?? element.style.fill;
    return fill === 'none' || (colorProperty === 'stroke' && tag === 'path');
}

function kindOf(element: Element, colorProperty: 'fill' | 'stroke'): MarkKind {
    // HTML marks (table rows, divs) form their own family, drawn by filling.
    if (!(element instanceof SVGElement)) return 'html';
    const tag = element.tagName.toLowerCase();
    if (tag === 'rect') return 'rect';
    if (tag === 'circle' || tag === 'ellipse') return 'point';
    if (strokeOnly(element, colorProperty)) return 'stroke';
    if (tag === 'path' && parseSector(element.getAttribute('d'))) return 'sector';
    return 'shape';
}

/** Least squares `m ≈ k·v` (through the origin) or `m ≈ a + k·v`. */
function fit(values: number[], measures: number[], intercept: boolean): { a: number; k: number; r2: number } | null {
    const pairs = values.map((v, i) => [v, measures[i]]).filter(([v, m]) => Number.isFinite(v) && Number.isFinite(m) && (intercept || v > 0));
    if (new Set(pairs.map(([v]) => v)).size < 3) return null;
    const n = pairs.length;
    const mean = (k: 0 | 1) => pairs.reduce((s, p) => s + p[k], 0) / n;
    let a = 0;
    let k: number;
    if (intercept) {
        const mv = mean(0);
        const mm = mean(1);
        const sxx = pairs.reduce((s, [v]) => s + (v - mv) ** 2, 0);
        k = pairs.reduce((s, [v, m]) => s + (v - mv) * (m - mm), 0) / sxx;
        a = mm - k * mv;
    } else {
        k = pairs.reduce((s, [v, m]) => s + v * m, 0) / pairs.reduce((s, [v]) => s + v * v, 0);
    }
    const mm = mean(1);
    const total = pairs.reduce((s, [, m]) => s + (m - mm) ** 2, 0);
    if (total <= 1e-12 * Math.max(1, mm * mm) || Math.abs(k) < 1e-12) return null;
    const residual = pairs.reduce((s, [v, m]) => s + (m - (a + k * v)) ** 2, 0);
    return { a, k, r2: 1 - residual / total };
}

/** Side the marks grow from: the one where the fewest distinct coordinates occur. */
function anchorOf(boxes: Box[], axis: 'x' | 'y'): 'start' | 'end' | 'center' {
    const distinct = (f: (b: Box) => number) => new Set(boxes.map(b => Math.round(f(b) * 2))).size;
    const start = distinct(b => (axis === 'y' ? b.y : b.x));
    const end = distinct(b => (axis === 'y' ? b.y + b.height : b.x + b.width));
    const center = distinct(b => (axis === 'y' ? b.y + b.height / 2 : b.x + b.width / 2));
    // Ties: bars grow up from the bottom (y) and right from the left (x).
    const order: ('start' | 'end' | 'center')[] = axis === 'y' ? ['end', 'start', 'center'] : ['start', 'end', 'center'];
    const counts = { start, end, center };
    return order.reduce((best, side) => (counts[side] < counts[best] ? side : best), order[0]);
}

/**
 * Interval marks: both edges along an axis are the same linear function of
 * two numeric fields of the row (a box from q1 to q3, an error bar), which
 * gives the coordinate of any value.
 */
function intervalOf(infos: MarkInfo[], boxes: Box[], axis: 'x' | 'y'): { a: number; k: number; fields: [string, string]; r2: number } | null {
    const rows = infos.map(i => i.row as Record<string, unknown>);
    const fields = Object.keys(rows[0]).filter(key => rows.every(row => typeof row[key] === 'number' && Number.isFinite(row[key])));
    const edges = (low: boolean) => boxes.map(box => axis === 'y'
        ? (low ? box.y + box.height : box.y)
        : (low ? box.x : box.x + box.width));
    const fitsOf = (low: boolean) => fields
        .map(field => ({ field, f: fit(rows.map(row => row[field] as number), edges(low), true) }))
        .filter((c): c is { field: string; f: NonNullable<ReturnType<typeof fit>> } => !!c.f && c.f.r2 >= MIN_FIT);
    for (const low of fitsOf(true)) {
        for (const high of fitsOf(false)) {
            if (low.field === high.field) continue;
            const sameScale = Math.abs(low.f.k - high.f.k) <= 1e-3 * Math.abs(low.f.k) && Math.abs(low.f.a - high.f.a) <= 0.5;
            if (sameScale) {
                return {
                    a: (low.f.a + high.f.a) / 2,
                    k: (low.f.k + high.f.k) / 2,
                    fields: [low.field, high.field],
                    r2: Math.min(low.f.r2, high.f.r2),
                };
            }
        }
    }
    return null;
}

const r2 = (value: number) => value.toFixed(3);

/** Infers the highlight of one mark family. */
function designOf(kind: MarkKind, infos: MarkInfo[], aggregated: boolean): HighlightDesign {
    const base = { kind, marks: infos.length };
    const values = infos.map(i => i.value);
    const all = infos.map(i => i.box);
    const boxes = all.every((b): b is Box => b !== null) ? all : null;
    const measured = boxes !== null;
    // Aggregated marks with fewer than three distinct values cannot prove any channel; one-to-one
    // marks show a covered share, never a value, so a preset is their answer anyway.
    const distinct = new Set(values.filter(Number.isFinite)).size;
    const unproven = aggregated && distinct < 3
        ? {
            unproven: true as const,
            reason: `${distinct} distinct value${distinct === 1 ? '' : 's'}: a channel needs three to be proven, `
                + 'so a preset draws the part; declare the channel for a subset render',
        }
        : null;

    if (aggregated && infos.every(i => i.feature !== null)) {
        return { ...base, mode: 'subset', channel: 'units', reason: 'each mark is one unit (data-autk-feature)' };
    }

    if ((kind === 'rect' || kind === 'html') && boxes) {
        // A negative value is a bar on the other side of the baseline: its length is |value|.
        const sizes = values.map(Math.abs);
        const y = fit(sizes, boxes.map(b => b.height), false);
        const x = fit(sizes, boxes.map(b => b.width), false);
        const best = [y && { axis: 'y' as const, f: y }, x && { axis: 'x' as const, f: x }]
            .filter((c): c is { axis: 'x' | 'y'; f: NonNullable<typeof y> } => !!c && c.f.r2 >= MIN_FIT)
            .sort((p, q) => q.f.r2 - p.f.r2)[0];
        if (best) {
            // The anchor is that of positive bars; negative ones grow from the opposite side.
            const positive = boxes.filter((_b, i) => values[i] > 0);
            const anchor = positive.length > 0 ? anchorOf(positive, best.axis) : opposite(anchorOf(boxes, best.axis));
            return {
                ...base, mode: 'subset', channel: 'length', axis: best.axis, anchor, fit: best.f.r2,
                reason: `${best.axis === 'y' ? 'height' : 'width'} ∝ value (R² ${r2(best.f.r2)}), anchored at the ${anchor}`,
            };
        }
        if (aggregated && kind === 'rect') {
            for (const axis of ['y', 'x'] as const) {
                const interval = intervalOf(infos, boxes, axis);
                if (interval) {
                    const { r2: quality, ...scale } = interval;
                    return {
                        ...base, mode: 'custom', preset: 'members', axis, scale, fit: quality,
                        reason: `edges linear in ${scale.fields.join(' and ')} (R² ${r2(quality)}): selected features drawn at their values`,
                    };
                }
            }
        }
    }

    if (kind === 'shape') {
        const elements = infos.map(i => i.element.getAttribute('d'));
        const flows = elements.map(parseFlow);
        if (flows.every((f): f is NonNullable<typeof f> => f !== null)) {
            const band = fit(values, flows.map(f => Math.hypot(...f.offset)), false);
            if (band && band.r2 >= MIN_FIT) {
                return { ...base, mode: 'subset', channel: 'band', shape: 'flow', fit: band.r2, reason: `band thickness ∝ value (R² ${r2(band.r2)})` };
            }
        }
        const ribbons = elements.map(parseRibbon);
        if (ribbons.every((r): r is NonNullable<typeof r> => r !== null)) {
            const band = fit(values, ribbons.map(r => r.source[1]), false);
            if (band && band.r2 >= MIN_FIT) {
                return { ...base, mode: 'subset', channel: 'band', shape: 'ribbon', fit: band.r2, reason: `ribbon sweep ∝ value (R² ${r2(band.r2)})` };
            }
        }
    }

    const sectors = infos.map(i => i.sector);
    if (kind === 'sector' && sectors.every((sector): sector is Sector => sector !== null)) {
        const angle = fit(values, sectors.map(sector => sector.sweep), false);
        if (angle && angle.r2 >= MIN_FIT) {
            return {
                ...base, mode: 'subset', channel: 'angle', fit: angle.r2,
                reason: `sweep ∝ value (R² ${r2(angle.r2)}): the part is the leading share of the sweep`,
            };
        }
    }

    if (kind === 'stroke') {
        const width = fit(values, infos.map(i => i.strokeWidth), false);
        if (width && width.r2 >= MIN_FIT) {
            return { ...base, mode: 'subset', channel: 'width', fit: width.r2, reason: `stroke width ∝ value (R² ${r2(width.r2)})` };
        }
        return {
            ...base, mode: 'custom', preset: 'trace',
            ...(unproven ?? { reason: 'stroke-only marks with no size channel: the stroke is traced to the fraction' }),
        };
    }

    if (aggregated && kind === 'point' && boxes) {
        const cx = boxes.map(b => b.x + b.width / 2);
        const cy = boxes.map(b => b.y + b.height / 2);
        const candidates = [
            { axis: 'y' as const, f: fit(values, cy, true) },
            { axis: 'x' as const, f: fit(values, cx, true) },
            { axis: 'radial' as const, f: fit(values, cx.map((x, i) => Math.hypot(x, cy[i])), false) },
        ]
            .filter((c): c is { axis: 'x' | 'y' | 'radial'; f: NonNullable<ReturnType<typeof fit>> } => c.f !== null && c.f.r2 >= MIN_FIT)
            .sort((p, q) => q.f.r2 - p.f.r2);
        const best = candidates[0];
        if (best) {
            return {
                ...base,
                mode: 'subset',
                channel: 'position',
                axis: best.axis,
                ...(best.axis === 'radial' ? {} : { baseline: best.f.a }),
                fit: best.f.r2,
                reason: best.axis === 'radial'
                    ? `distance to the center ∝ value (R² ${r2(best.f.r2)})`
                    : `${best.axis} linear in value (R² ${r2(best.f.r2)}), value 0 at ${best.axis} = ${best.f.a.toFixed(1)}`,
            };
        }
    }

    if (boxes) {
        const area = fit(values, boxes.map(b => b.width * b.height), false);
        if (area && area.r2 >= MIN_FIT) return { ...base, mode: 'subset', channel: 'area', fit: area.r2, reason: `area ∝ value (R² ${r2(area.r2)})` };
    }
    if (unproven) return { ...base, mode: 'custom', preset: 'glyph', ...unproven };
    return {
        ...base, mode: 'custom', preset: 'glyph',
        reason: measured ? 'no size or position channel follows the value (e.g. color)' : 'marks cannot be measured here',
    };
}

/**
 * Infers the highlight of each mark family from the marks: a subset render on the channel that
 * follows the value, or the `glyph` (or `trace`) preset when none does.
 *
 * @param marks Mark elements, each bound to its rendered row.
 * @param valueOf Value of a row, the one its mark encodes.
 * @param aggregated Whether rows aggregate features (position and members are used only then).
 * @param colorProperty Mark property the plot colors.
 * @returns One design per mark family present.
 */
export function inferHighlight(
    marks: Element[],
    valueOf: (row: AutkDatum) => number,
    aggregated: boolean,
    colorProperty: 'fill' | 'stroke' = 'fill',
): HighlightDesign[] {
    const families = new Map<MarkKind, MarkInfo[]>();
    for (const element of marks) {
        const row = select<Element, AutkDatum | undefined>(element).datum();
        if (!row) continue;
        const kind = kindOf(element, colorProperty);
        const feature = element.getAttribute('data-autk-feature');
        const info: MarkInfo = {
            element: element as SVGGraphicsElement,
            row,
            kind,
            value: valueOf(row),
            box: kind === 'html' ? htmlBox(element) : kind === 'sector' || kind === 'stroke' ? null : parentBox(element as SVGGraphicsElement),
            sector: kind === 'sector' ? parseSector(element.getAttribute('d')) : null,
            strokeWidth: strokeWidthOf(element),
            feature: feature !== null && Number.isFinite(Number(feature)) ? Number(feature) : null,
        };
        const family = families.get(kind) ?? [];
        family.push(info);
        families.set(kind, family);
    }
    return Array.from(families, ([kind, infos]) => designOf(kind, infos, aggregated));
}

/**
 * Replaces inferred highlights by the declared ones.
 *
 * A plot that knows its channel declares it, since inference needs evidence (three distinct
 * values) that a small drawing may lack, such as a bar chart of two categories. Parameters a
 * declaration leaves out are taken from the inferred design when it found the same rule.
 * `'boolean'` makes every family highlight its whole marks.
 *
 * @param inferred Designs inferred for the mark families present.
 * @param declared Declared highlight of each mark family, or `'boolean'` for all.
 * @returns One design per mark family present.
 */
export function withDeclaredHighlight(
    inferred: HighlightDesign[],
    declared: 'boolean' | Partial<Record<MarkKind, HighlightRule>> | undefined,
): HighlightDesign[] {
    if (!declared) return inferred;
    return inferred.map(design => {
        const own: HighlightRule | undefined = declared === 'boolean' ? { mode: 'boolean' } : declared[design.kind];
        if (!own) return design;
        const agrees = ruleOf(design) === ruleOf(own) && !design.unproven;
        const { kind, marks } = design;
        const merged = {
            ...(agrees ? design : { kind, marks }),
            ...own,
            kind,
            marks,
            reason: agrees ? `declared by the plot; the geometry agrees (${design.reason})` : 'declared by the plot',
        } as HighlightDesign;
        delete merged.unproven;
        return merged;
    });
}

/**
 * Kind of a mark, as `inferHighlight` classifies it.
 *
 * @param element Mark element.
 * @param colorProperty Mark property the plot colors.
 * @returns Mark family of the element.
 */
export function markKindOf(element: Element, colorProperty: 'fill' | 'stroke' = 'fill'): MarkKind {
    return kindOf(element, colorProperty);
}

/** Box of an HTML mark on the page, or `null` when it has no layout (as in jsdom). */
function htmlBox(element: Element): Box | null {
    const box = element.getBoundingClientRect();
    return box.width > 0 || box.height > 0 ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
}

/**
 * Background that highlights the selected part of an HTML mark.
 *
 * HTML boxes cannot hold a scaled copy, so a part is a fill: from the inferred anchor for
 * `length`, from the left for every other rule, which covers the fraction of the box's area, as
 * the glyph does, and the whole box for `boolean`.
 *
 * @param design Highlight of the HTML marks.
 * @param ratio Ratio the part shows.
 * @param color Color of the part.
 * @returns CSS background of the mark.
 */
export function htmlFill(design: HighlightRule, ratio: number, color: string): string {
    const r = design.mode === 'boolean' ? 1 : Math.min(1, Math.max(0, ratio));
    const at = (v: number) => `${(v * 100).toFixed(2)}%`;
    const length = design.mode === 'subset' && design.channel === 'length' ? design : null;
    if (length && length.anchor === 'center') {
        const [a, b] = [(1 - r) / 2, (1 + r) / 2];
        const to = length.axis === 'y' ? 'to top' : 'to right';
        return `linear-gradient(${to}, transparent ${at(a)}, ${color} ${at(a)}, ${color} ${at(b)}, transparent ${at(b)})`;
    }
    const direction = !length ? 'to right'
        : length.axis === 'y' ? (length.anchor === 'start' ? 'to bottom' : 'to top')
        : (length.anchor === 'end' ? 'to left' : 'to right');
    return `linear-gradient(${direction}, ${color} ${at(r)}, transparent ${at(r)})`;
}

/** The other side of an anchor (a center stays a center). */
function opposite(anchor: 'start' | 'end' | 'center'): 'start' | 'end' | 'center' {
    return anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'center';
}

/**
 * Ratio the part shows.
 *
 * Length, area, and position encode the value, so they show the selected value over the row
 * value, for any reducer: it may exceed 1 (an average above the row's, or a sum with negative
 * units elsewhere), and a position may even cross the baseline. Other rules show the fraction in
 * `[0, 1]`.
 *
 * @param part Selected part of the mark.
 * @param rule What the mark family's highlight draws (`ruleOf`).
 * @returns Ratio of the part to the mark.
 */
export function ratioOf(part: SegregatedPart, rule: HighlightRuleName): number {
    const { value, totalValue } = part.part;
    if ((rule === 'length' || rule === 'area' || rule === 'position') && value !== null && totalValue) {
        const ratio = value / totalValue;
        return rule === 'position' ? ratio : Math.max(0, ratio);
    }
    return part.fraction;
}

/** Stroke width of a mark: its inline style wins over its attribute, as when rendering. */
function strokeWidthOf(element: Element): number {
    const style = (element as SVGElement).style?.strokeWidth;
    const width = parseFloat(style || element.getAttribute('stroke-width') || '1');
    return Number.isFinite(width) ? width : 1;
}

/**
 * Horizontal offset of a member point inside its mark, spread by the golden ratio.
 *
 * @param feature Feature id of the point.
 * @param band Width of the mark in pixels.
 * @returns Offset from the center of the mark, in pixels.
 */
export function memberOffset(feature: number, band: number): number {
    return ((feature * 0.618034) % 1 - 0.5) * band * 0.6;
}

/** Context for drawing automatic parts. */
export type AutoPartContext = {
    /** Color of the selected part. */
    color: string;
    /** Color of the outline added to parts that the fill does not set apart. */
    outline: string;
    /** Selected features, for the `units` rule. */
    selected: ReadonlySet<number>;
    /** Class of the part elements (defaults to `autkPartial`). */
    className?: string;
    /** Selected features of a part with their values, for the `members` rule. */
    membersOf: (part: SegregatedPart) => { feature: number; value: number }[];
};

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Draws the selected part of one mark with its family's highlight (a boolean, a subset render,
 * or a custom preset).
 *
 * @param mark Mark element.
 * @param part Selected part of the mark.
 * @param design Highlight of the mark family.
 * @param copy A copy of the mark, already colored, that most rules reshape.
 * @param context Colors, outline, and selected features.
 * @param statistic Whether the copy is filled with the color of the subset statistic.
 * @returns The elements to insert after the mark (none when the rule draws nothing for it).
 */
export function drawAutoPart(
    mark: SVGGraphicsElement,
    part: SegregatedPart,
    design: HighlightDesign,
    copy: SVGGraphicsElement,
    context: AutoPartContext,
    statistic = false,
): SVGGraphicsElement[] {
    const own = mark.getAttribute('transform') ?? '';
    const rule = ruleOf(design);
    const r = ratioOf(part, rule);
    const clamped = Math.min(1, Math.max(0, r));
    const axis = 'axis' in design ? design.axis : undefined;

    switch (rule) {
        case 'whole':
            return [copy];
        case 'units': {
            const feature = Number(mark.getAttribute('data-autk-feature'));
            return context.selected.has(feature) ? [copy] : [];
        }
        case 'length': {
            // Scaled in the parent's coordinates, where the anchor was inferred,
            // so a mark flipped by its own transform keeps its base.
            const box = parentBox(mark);
            if (!box) return [];
            const along = axis === 'x' ? 'x' : 'y';
            const size = along === 'y' ? box.height : box.width;
            const start = along === 'y' ? box.y : box.x;
            const declared = 'anchor' in design ? design.anchor : undefined;
            const anchor = (part.part.totalValue ?? 0) < 0 ? opposite(declared ?? 'end') : declared;
            const pivot = anchor === 'start' ? start : anchor === 'center' ? start + size / 2 : start + size;
            // A statistic of the subset (avg, min, max) is not a slice of the mark:
            // it is drawn as an inner mark, half as wide, centered across the axis.
            const across = part.part.additive ? 1 : 0.5;
            const middle = along === 'y' ? box.x + box.width / 2 : box.y + box.height / 2;
            const [px, py] = along === 'y' ? [middle, pivot] : [pivot, middle];
            const [sx, sy] = along === 'y' ? [across, r] : [r, across];
            copy.setAttribute('transform', `translate(${px}, ${py}) scale(${sx}, ${sy}) translate(${-px}, ${-py}) ${own}`.trim());
            copy.style.setProperty('vector-effect', 'non-scaling-stroke');
            return [copy];
        }
        case 'band': {
            const d = mark.getAttribute('d');
            const shape = 'shape' in design ? design.shape : undefined;
            // An undeclared shape is whichever the path is.
            const flow = shape !== 'ribbon' ? parseFlow(d) : null;
            const ribbon = !flow && shape !== 'flow' ? parseRibbon(d) : null;
            if (flow) copy.setAttribute('d', flowPath(flow, clamped));
            else if (ribbon) copy.setAttribute('d', ribbonPath(ribbon, clamped));
            else return [];
            return [copy];
        }
        case 'angle': {
            // The same encoding as the mark: the sector of the subset's value, from the same start.
            const sector = parseSector(mark.getAttribute('d'));
            if (!sector) return [];
            copy.setAttribute('d', sectorPath(sector, sector.sweep * clamped));
            return [copy];
        }
        case 'width': {
            const width = strokeWidthOf(mark);
            copy.style.setProperty('stroke-width', String(width * clamped));
            return [copy];
        }
        case 'trace':
            // A filled mark is traced along its outline: its fill would show the whole mark.
            if (design.kind !== 'stroke') {
                const color = copy.style.getPropertyValue('fill') || copy.style.getPropertyValue('stroke');
                copy.style.setProperty('fill', 'none');
                copy.style.setProperty('stroke', color);
                copy.style.setProperty('stroke-width', String(Math.max(2, strokeWidthOf(mark))));
            }
            copy.setAttribute('pathLength', '1');
            copy.style.setProperty('stroke-dasharray', `${clamped} 1`);
            return [copy];
        case 'position': {
            const box = parentBox(mark);
            if (!box) return [];
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const baseline = 'baseline' in design ? design.baseline ?? 0 : 0;
            const [dx, dy] = axis === 'radial'
                ? [(r - 1) * cx, (r - 1) * cy]
                : axis === 'x'
                    ? [(r - 1) * (cx - baseline), 0]
                    : [0, (r - 1) * (cy - baseline)];
            copy.setAttribute('transform', `translate(${dx}, ${dy}) ${own}`.trim());
            outline(copy, context.outline);
            return [copy];
        }
        case 'members': {
            const box = parentBox(mark);
            const scale = 'scale' in design ? design.scale : undefined;
            if (!box || !scale) return [];
            const { a, k } = scale;
            const band = axis === 'y' ? box.width : box.height;
            const middle = axis === 'y' ? box.x + box.width / 2 : box.y + box.height / 2;
            return context.membersOf(part).map(({ feature, value }) => {
                const dot = mark.ownerDocument.createElementNS(SVG, 'circle') as SVGCircleElement;
                const across = middle + memberOffset(feature, band);
                const along = a + k * value;
                dot.setAttribute('class', context.className ?? 'autkPartial');
                dot.setAttribute('data-autk-provenance', part.mark);
                dot.setAttribute('data-autk-feature', String(feature));
                dot.setAttribute('data-autk-value', String(value));
                dot.setAttribute('cx', String(axis === 'y' ? across : along));
                dot.setAttribute('cy', String(axis === 'y' ? along : across));
                dot.setAttribute('r', '3.5');
                dot.style.setProperty('fill', context.color);
                dot.style.setProperty('pointer-events', 'none');
                outline(dot, context.outline);
                const title = mark.ownerDocument.createElementNS(SVG, 'title');
                title.textContent = `feature ${feature}: ${format('~s')(value)}`;
                dot.append(title);
                return dot;
            });
        }
        case 'area':
        case 'glyph': {
            const box = localBox(mark);
            if (!box) return [];
            const ox = box.x + box.width / 2;
            const oy = box.y + box.height / 2;
            // Area shows the value (a statistic may exceed the mark); a glyph shows
            // the fraction or, when its color shows the statistic, is an inner mark
            // half the size whatever the fraction, so that this color can be read.
            const s = statistic ? 0.5 : Math.sqrt(rule === 'area' ? r : clamped);
            copy.setAttribute('transform', `${own} translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`.trim());
            copy.style.setProperty('vector-effect', 'non-scaling-stroke');
            return [copy];
        }
    }
}

/**
 * Gives a part the outline added where its fill does not set it apart.
 *
 * @param element Part element.
 * @param color Outline color.
 */
export function outline(element: SVGElement, color: string): void {
    element.style.setProperty('stroke', color);
    element.style.setProperty('stroke-width', '1');
}

/**
 * Path of the series through the moved points of a `position` render: a line, or an area down to
 * the baseline when the series is filled.
 *
 * @param points Moved centers of every mark of the family, in parent coordinates.
 * @param design Axis and baseline of the `position` render.
 * @param filled Whether the series is an area.
 * @returns Path data, or `null` with fewer than two points.
 */
export function seriesPath(points: [number, number][], design: { axis?: 'x' | 'y' | 'radial'; baseline?: number }, filled: boolean): string | null {
    if (points.length < 2 || design.axis === 'radial') return null;
    const along = design.axis === 'y' ? 0 : 1;
    const sorted = points.slice().sort((p, q) => p[along] - q[along]);
    const line = sorted.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join('');
    if (!filled) return line;
    const b = design.baseline ?? 0;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return design.axis === 'y'
        ? `${line}L${last[0]},${b}L${first[0]},${b}Z`
        : `${line}L${b},${last[1]}L${b},${first[1]}Z`;
}

/**
 * Center of a mark in its parent's coordinates.
 *
 * @param mark Mark element.
 * @returns The center, or `null` when the mark cannot be measured.
 */
export function centerOf(mark: SVGGraphicsElement): [number, number] | null {
    const box = parentBox(mark);
    return box ? [box.x + box.width / 2, box.y + box.height / 2] : null;
}
