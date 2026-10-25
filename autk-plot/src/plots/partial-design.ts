/**
 * @fileoverview Design space of the segregated view, inferred from the drawing.
 *
 * A base drawing never says which visual channel encodes the value of a mark:
 * a `<rect>` may be a bar (height), a heatmap cell (color), or a treemap leaf
 * (area). Since each mark binds its row, the channel can be found instead of
 * guessed: the geometric measure that is proportional (or linear) to the row
 * value across all marks of a kind is the channel, and its fit is the evidence.
 * Each channel has a natural way to show the selected part r of a mark:
 *
 * | Channel (evidence)                      | Rule       | Selected part                                        |
 * |-----------------------------------------|------------|------------------------------------------------------|
 * | one mark per unit (`data-autk-feature`) | `units`    | the units of the selected features, whole            |
 * | length ∝ value (rect side)              | `length`   | the mark scaled by r along that side, from its anchor |
 * | band thickness ∝ value (flow, ribbon)   | `band`     | the band narrowed to r from its leading edge         |
 * | sweep ∝ value (sector)                  | `angle`    | thick rings: the inner sector of area r; thin rings: the leading r of the sweep |
 * | stroke width ∝ value                    | `width`    | the stroke r times as wide                           |
 * | position linear in value (points)       | `position` | the point moved to the base by r, and the series line or area through the moved points |
 * | edges linear in two fields (interval)   | `members`  | each selected feature as a point at its own value    |
 * | area ∝ value                            | `area`     | a copy scaled by √r about its center (area r)        |
 * | none, stroke-only marks                 | `trace`    | the first fraction r of the stroke                   |
 * | none                                    | `glyph`    | a copy scaled by √r (shows the fraction, not the value) |
 *
 * Position and members are only used for aggregated rows: moving a one-to-one
 * mark by the share of its feature would draw a value that does not exist.
 * Fits need three distinct values and R² ≥ 0.99; otherwise the next rule applies.
 */

import type { AutkDatum } from '../types-plot';
import type { SegregatedPart } from '../plot-base-interactive';

/** Automatic rules of the design space. */
export type PartialRule = 'units' | 'length' | 'band' | 'angle' | 'width' | 'position' | 'members' | 'area' | 'trace' | 'glyph';

/** Mark families inferred separately (a Pareto chart has bars and points). */
export type MarkKind = 'rect' | 'point' | 'sector' | 'stroke' | 'shape' | 'html';

/** Design chosen for one mark family, with its evidence. */
export type PartialDesign = {
    kind: MarkKind;
    /** Number of marks of the family. */
    marks: number;
    rule: PartialRule;
    /** Axis of `length`, `position`, and `members`. */
    axis?: 'x' | 'y' | 'radial';
    /** Side `length` grows from: top/left (`start`), bottom/right (`end`), or `center`. */
    anchor?: 'start' | 'end' | 'center';
    /** Coordinate of the value 0 for `position` on x or y. */
    baseline?: number;
    /** `angle`: inner sector (`radial`) or leading part of the sweep (`sweep`). `band`: `flow` or `ribbon`. */
    mode?: 'radial' | 'sweep' | 'flow' | 'ribbon';
    /** `members`: coordinate of a value, `a + k·value`, and the two fields the mark spans. */
    scale?: { a: number; k: number; fields: [string, string] };
    /** R² of the fit that proved the channel. */
    fit?: number;
    /** Why this rule was chosen. */
    reason: string;
};

/** Minimum R² for a fit to prove a channel. */
const MIN_FIT = 0.99;

/** Rings thinner than this share of their radius show a part by its sweep. */
const THIN_RING = 0.25;

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

/** Own `transform` of an element (translate and scale; other functions are ignored). */
export function ownMatrix(element: Element): Matrix {
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    const text = element.getAttribute('transform') ?? '';
    for (const [, name, args] of text.matchAll(/(translate|scale)\s*\(([^)]*)\)/g)) {
        const [p, q] = args.split(/[\s,]+/).filter(Boolean).map(Number);
        matrix = multiply(matrix, name === 'translate' ? [1, 0, 0, 1, p || 0, q || 0] : [p, 0, 0, q ?? p, 0, 0]);
    }
    return matrix;
}

/** Local box of a mark, or `null` when the environment cannot measure it. */
function localBox(element: SVGGraphicsElement): Box | null {
    try {
        const box = element.getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
    } catch {
        return null;
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

/** Parses a d3.arc sector centered on the local origin. */
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

/** Path of a sector keeping its radii and start, with a new sweep. */
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

/** Parses a flow band whose second edge is the first one offset by a constant vector. */
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

/** Path of a flow band with a new offset of its second edge. */
export function flowPath(flow: Flow, ratio: number): string {
    const [ox, oy] = [flow.offset[0] * ratio, flow.offset[1] * ratio];
    const [p0, c1, c2, p1] = flow.edge;
    const shift = ([x, y]: Point) => `${x + ox},${y + oy}`;
    return `M${p0[0]},${p0[1]}C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p1[0]},${p1[1]}`
        + `L${shift(p1)}C${shift(c2)} ${shift(c1)} ${shift(p0)}Z`;
}

/** Parses a d3.ribbon path: source and target arcs (start and sweep) of one circle. */
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

/** Path of a ribbon keeping the leading `ratio` of both arcs. */
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
function intervalOf(infos: MarkInfo[], axis: 'x' | 'y'): { a: number; k: number; fields: [string, string]; r2: number } | null {
    const rows = infos.map(i => i.row as Record<string, unknown>);
    const fields = Object.keys(rows[0]).filter(key => rows.every(row => typeof row[key] === 'number' && Number.isFinite(row[key])));
    const edges = (low: boolean) => infos.map(({ box }) => axis === 'y'
        ? (low ? box!.y + box!.height : box!.y)
        : (low ? box!.x : box!.x + box!.width));
    const fitsOf = (low: boolean) => fields
        .map(field => ({ field, f: fit(rows.map(row => row[field] as number), edges(low), true) }))
        .filter((c): c is { field: string; f: NonNullable<ReturnType<typeof fit>> } => !!c.f && c.f.r2 >= MIN_FIT);
    for (const low of fitsOf(true)) {
        for (const high of fitsOf(false)) {
            if (low.field === high.field) continue;
            const sameScale = Math.abs(low.f.k - high.f.k) <= 1e-3 * Math.abs(low.f.k) && Math.abs(low.f.a - high.f.a) <= 0.5;
            if (sameScale) return { a: (low.f.a + high.f.a) / 2, k: (low.f.k + high.f.k) / 2, fields: [low.field, high.field], r2: Math.min(low.f.r2, high.f.r2) };
        }
    }
    return null;
}

const r2 = (value: number) => value.toFixed(3);

/** Infers the design of one mark family. */
function designOf(kind: MarkKind, infos: MarkInfo[], aggregated: boolean): PartialDesign {
    const base = { kind, marks: infos.length };
    const values = infos.map(i => i.value);
    const boxes = infos.map(i => i.box);
    const measured = boxes.every((b): b is Box => b !== null);

    if (aggregated && infos.every(i => i.feature !== null)) {
        return { ...base, rule: 'units', reason: 'each mark is one unit (data-autk-feature)' };
    }

    if ((kind === 'rect' || kind === 'html') && measured) {
        // A negative value is a bar on the other side of the baseline: its length is |value|.
        const sizes = values.map(Math.abs);
        const y = fit(sizes, boxes.map(b => b!.height), false);
        const x = fit(sizes, boxes.map(b => b!.width), false);
        const best = [y && { axis: 'y' as const, f: y }, x && { axis: 'x' as const, f: x }]
            .filter((c): c is { axis: 'x' | 'y'; f: NonNullable<typeof y> } => !!c && c.f.r2 >= MIN_FIT)
            .sort((p, q) => q.f.r2 - p.f.r2)[0];
        if (best) {
            // The anchor is that of positive bars; negative ones grow from the opposite side.
            const positive = (boxes as Box[]).filter((_b, i) => values[i] > 0);
            const anchor = positive.length > 0 ? anchorOf(positive, best.axis) : opposite(anchorOf(boxes as Box[], best.axis));
            return { ...base, rule: 'length', axis: best.axis, anchor, fit: best.f.r2, reason: `${best.axis === 'y' ? 'height' : 'width'} ∝ value (R² ${r2(best.f.r2)}), anchored at the ${anchor}` };
        }
        if (aggregated && kind === 'rect') {
            for (const axis of ['y', 'x'] as const) {
                const interval = intervalOf(infos, axis);
                if (interval) {
                    const { r2: quality, ...scale } = interval;
                    return { ...base, rule: 'members', axis, scale, fit: quality, reason: `edges linear in ${scale.fields.join(' and ')} (R² ${r2(quality)}): selected features drawn at their values` };
                }
            }
        }
    }

    if (kind === 'shape') {
        const elements = infos.map(i => i.element.getAttribute('d'));
        const flows = elements.map(parseFlow);
        if (flows.every(Boolean)) {
            const band = fit(values, flows.map(f => Math.hypot(...f!.offset)), false);
            if (band && band.r2 >= MIN_FIT) return { ...base, rule: 'band', mode: 'flow', fit: band.r2, reason: `band thickness ∝ value (R² ${r2(band.r2)})` };
        }
        const ribbons = elements.map(parseRibbon);
        if (ribbons.every(Boolean)) {
            const band = fit(values, ribbons.map(r => r!.source[1]), false);
            if (band && band.r2 >= MIN_FIT) return { ...base, rule: 'band', mode: 'ribbon', fit: band.r2, reason: `ribbon sweep ∝ value (R² ${r2(band.r2)})` };
        }
    }

    if (kind === 'sector') {
        const angle = fit(values, infos.map(i => i.sector!.sweep), false);
        if (angle && angle.r2 >= MIN_FIT) {
            const thin = infos.every(i => i.sector!.inner > 0 && (i.sector!.outer - i.sector!.inner) / i.sector!.outer < THIN_RING);
            return {
                ...base, rule: 'angle', mode: thin ? 'sweep' : 'radial', fit: angle.r2,
                reason: `sweep ∝ value (R² ${r2(angle.r2)}); ${thin ? 'thin ring: the part is the leading share of the sweep' : 'the part is the inner sector of the same area'}`,
            };
        }
    }

    if (kind === 'stroke') {
        const width = fit(values, infos.map(i => i.strokeWidth), false);
        if (width && width.r2 >= MIN_FIT) return { ...base, rule: 'width', fit: width.r2, reason: `stroke width ∝ value (R² ${r2(width.r2)})` };
        return { ...base, rule: 'trace', reason: 'stroke-only marks with no size channel: the stroke is traced to the fraction' };
    }

    if (aggregated && kind === 'point' && measured) {
        const cx = boxes.map(b => b!.x + b!.width / 2);
        const cy = boxes.map(b => b!.y + b!.height / 2);
        const candidates = [
            { axis: 'y' as const, f: fit(values, cy, true) },
            { axis: 'x' as const, f: fit(values, cx, true) },
            { axis: 'radial' as const, f: fit(values, cx.map((x, i) => Math.hypot(x, cy[i])), false) },
        ].filter(c => c.f && c.f.r2 >= MIN_FIT).sort((p, q) => q.f!.r2 - p.f!.r2);
        const best = candidates[0];
        if (best) {
            return {
                ...base,
                rule: 'position',
                axis: best.axis,
                ...(best.axis === 'radial' ? {} : { baseline: best.f!.a }),
                fit: best.f!.r2,
                reason: best.axis === 'radial'
                    ? `distance to the center ∝ value (R² ${r2(best.f!.r2)})`
                    : `${best.axis} linear in value (R² ${r2(best.f!.r2)}), value 0 at ${best.axis} = ${best.f!.a.toFixed(1)}`,
            };
        }
    }

    if (measured) {
        const area = fit(values, boxes.map(b => b!.width * b!.height), false);
        if (area && area.r2 >= MIN_FIT) return { ...base, rule: 'area', fit: area.r2, reason: `area ∝ value (R² ${r2(area.r2)})` };
    }
    return { ...base, rule: 'glyph', reason: measured ? 'no size or position channel follows the value (e.g. color)' : 'marks cannot be measured here' };
}

/**
 * Infers the segregated view design of each mark family from the marks.
 *
 * @param marks Mark elements, each bound to its rendered row.
 * @param valueOf Value of a row, the one its mark encodes.
 * @param aggregated Whether rows aggregate features (position and members are used only then).
 * @param colorProperty Mark property the plot colors.
 * @returns One design per mark family present.
 */
export function inferPartialDesign(
    marks: Element[],
    valueOf: (row: AutkDatum) => number,
    aggregated: boolean,
    colorProperty: 'fill' | 'stroke' = 'fill',
): PartialDesign[] {
    const families = new Map<MarkKind, MarkInfo[]>();
    for (const element of marks) {
        const row = (element as unknown as { __data__?: AutkDatum }).__data__;
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
        if (!families.has(kind)) families.set(kind, []);
        families.get(kind)!.push(info);
    }
    return Array.from(families, ([kind, infos]) => designOf(kind, infos, aggregated));
}

/** Kind of a mark, as `inferPartialDesign` classifies it. */
export function markKindOf(element: Element, colorProperty: 'fill' | 'stroke' = 'fill'): MarkKind {
    return kindOf(element, colorProperty);
}

/** Box of an HTML mark on the page, or `null` when it has no layout (as in jsdom). */
function htmlBox(element: Element): Box | null {
    const box = element.getBoundingClientRect();
    return box.width > 0 || box.height > 0 ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
}

/**
 * Background that paints the selected part of an HTML mark.
 *
 * HTML boxes cannot hold a scaled copy, so a part is a fill: from the
 * inferred anchor for `length`, and from the left for every other rule, which
 * covers the fraction of the box's area, as the glyph does.
 */
export function htmlFill(design: Pick<PartialDesign, 'rule' | 'axis' | 'anchor'>, ratio: number, color: string): string {
    const r = Math.min(1, Math.max(0, ratio));
    const at = (v: number) => `${(v * 100).toFixed(2)}%`;
    if (design.rule === 'length' && design.anchor === 'center') {
        const [a, b] = [(1 - r) / 2, (1 + r) / 2];
        return `linear-gradient(${design.axis === 'y' ? 'to top' : 'to right'}, transparent ${at(a)}, ${color} ${at(a)}, ${color} ${at(b)}, transparent ${at(b)})`;
    }
    const direction = design.rule !== 'length' ? 'to right'
        : design.axis === 'y' ? (design.anchor === 'start' ? 'to bottom' : 'to top')
        : (design.anchor === 'end' ? 'to left' : 'to right');
    return `linear-gradient(${direction}, ${color} ${at(r)}, transparent ${at(r)})`;
}

/** The other side of an anchor (a center stays a center). */
function opposite(anchor: 'start' | 'end' | 'center'): 'start' | 'end' | 'center' {
    return anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'center';
}

/**
 * Ratio the part shows. Length and position show the selected value over the
 * row value, for any reducer: it may exceed 1 (an average above the row's, or
 * a sum with negative units elsewhere), and a position may even cross the
 * baseline. Other rules show the fraction in `[0, 1]`, since a copy cannot be
 * larger than its mark.
 */
export function ratioOf(part: SegregatedPart, rule: PartialRule): number {
    const { value, totalValue } = part.part;
    if ((rule === 'length' || rule === 'position') && value !== null && totalValue) {
        const ratio = value / totalValue;
        return rule === 'length' ? Math.max(0, ratio) : ratio;
    }
    return part.fraction;
}

/** Stroke width of a mark: its inline style wins over its attribute, as when rendering. */
function strokeWidthOf(element: Element): number {
    const style = (element as SVGElement).style?.strokeWidth;
    const width = parseFloat(style || element.getAttribute('stroke-width') || '1');
    return Number.isFinite(width) ? width : 1;
}

/** Horizontal offset of a member point inside its mark, spread by the golden ratio. */
export function memberOffset(feature: number, band: number): number {
    return ((feature * 0.618034) % 1 - 0.5) * band * 0.6;
}

/** Context for drawing automatic parts. */
export type AutoPartContext = {
    /** Color of the selected part. */
    color: string;
    /** Clip path container. */
    clips: { append: (id: string, build: (clip: SVGClipPathElement) => void) => void };
    /** Selected features, for the `units` rule. */
    selected: Set<number>;
    /** Selected features of a part with their values, for the `members` rule. */
    membersOf: (part: SegregatedPart) => { feature: number; value: number }[];
};

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Draws the selected part of one mark with an automatic rule.
 *
 * @param copy A copy of the mark, already colored, that most rules reshape.
 * @returns The elements to insert after the mark (none when the rule draws nothing for it).
 */
export function drawAutoPart(mark: SVGGraphicsElement, part: SegregatedPart, design: PartialDesign, copy: SVGGraphicsElement, context: AutoPartContext): SVGGraphicsElement[] {
    const own = mark.getAttribute('transform') ?? '';
    const r = ratioOf(part, design.rule);
    const clamped = Math.min(1, Math.max(0, r));

    switch (design.rule) {
        case 'units': {
            const feature = Number(mark.getAttribute('data-autk-feature'));
            return context.selected.has(feature) ? [copy] : [];
        }
        case 'length': {
            // Scaled in the parent's coordinates, where the anchor was inferred,
            // so a mark flipped by its own transform keeps its base.
            const box = parentBox(mark);
            if (!box) return [];
            const axis = design.axis === 'x' ? 'x' : 'y';
            const size = axis === 'y' ? box.height : box.width;
            const start = axis === 'y' ? box.y : box.x;
            const anchor = (part.part.totalValue ?? 0) < 0 ? opposite(design.anchor ?? 'end') : design.anchor;
            const pivot = anchor === 'start' ? start : anchor === 'center' ? start + size / 2 : start + size;
            const [px, py] = axis === 'y' ? [0, pivot] : [pivot, 0];
            const [sx, sy] = axis === 'y' ? [1, r] : [r, 1];
            copy.setAttribute('transform', `translate(${px}, ${py}) scale(${sx}, ${sy}) translate(${-px}, ${-py}) ${own}`.trim());
            copy.style.setProperty('vector-effect', 'non-scaling-stroke');
            return [copy];
        }
        case 'band': {
            const d = mark.getAttribute('d');
            const flow = design.mode === 'flow' ? parseFlow(d) : null;
            const ribbon = design.mode === 'ribbon' ? parseRibbon(d) : null;
            if (!flow && !ribbon) return [];
            copy.setAttribute('d', flow ? flowPath(flow, clamped) : ribbonPath(ribbon!, clamped));
            return [copy];
        }
        case 'angle': {
            const sector = parseSector(mark.getAttribute('d'));
            if (!sector) return [];
            if (design.mode === 'sweep') {
                copy.setAttribute('d', sectorPath(sector, sector.sweep * clamped));
                return [copy];
            }
            const { inner, outer } = sector;
            const radius = Math.sqrt(inner * inner + clamped * (outer * outer - inner * inner));
            const id = `autk-part-radial-${++radialCount}`;
            context.clips.append(id, clip => {
                const circle = clip.ownerDocument.createElementNS(SVG, 'circle');
                circle.setAttribute('cx', '0');
                circle.setAttribute('cy', '0');
                circle.setAttribute('r', String(radius));
                clip.append(circle);
            });
            copy.setAttribute('clip-path', `url(#${id})`);
            return [copy];
        }
        case 'width': {
            const width = strokeWidthOf(mark);
            copy.style.setProperty('stroke-width', String(width * clamped));
            return [copy];
        }
        case 'trace':
            copy.setAttribute('pathLength', '1');
            copy.style.setProperty('stroke-dasharray', `${clamped} 1`);
            return [copy];
        case 'position': {
            const box = parentBox(mark);
            if (!box) return [];
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const [dx, dy] = design.axis === 'radial'
                ? [(r - 1) * cx, (r - 1) * cy]
                : design.axis === 'x'
                    ? [(r - 1) * (cx - (design.baseline ?? 0)), 0]
                    : [0, (r - 1) * (cy - (design.baseline ?? 0))];
            copy.setAttribute('transform', `translate(${dx}, ${dy}) ${own}`.trim());
            return [copy];
        }
        case 'members': {
            const box = parentBox(mark);
            if (!box || !design.scale) return [];
            const { a, k } = design.scale;
            const band = design.axis === 'y' ? box.width : box.height;
            const middle = design.axis === 'y' ? box.x + box.width / 2 : box.y + box.height / 2;
            return context.membersOf(part).map(({ feature, value }) => {
                const dot = mark.ownerDocument.createElementNS(SVG, 'circle') as SVGCircleElement;
                const across = middle + memberOffset(feature, band);
                const along = a + k * value;
                dot.setAttribute('class', 'autkPartial');
                dot.setAttribute('data-autk-provenance', part.mark);
                dot.setAttribute('data-autk-feature', String(feature));
                dot.setAttribute('cx', String(design.axis === 'y' ? across : along));
                dot.setAttribute('cy', String(design.axis === 'y' ? along : across));
                dot.setAttribute('r', '3.5');
                dot.style.setProperty('fill', context.color);
                dot.style.setProperty('pointer-events', 'none');
                return dot;
            });
        }
        case 'area':
        case 'glyph': {
            const box = localBox(mark);
            if (!box) return [];
            const ox = box.x + box.width / 2;
            const oy = box.y + box.height / 2;
            const s = Math.sqrt(clamped);
            copy.setAttribute('transform', `${own} translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`.trim());
            return [copy];
        }
    }
}

/** Ids of radial clip paths, unique across plots on the page. */
let radialCount = 0;

/**
 * Path of the series through the moved points of a `position` design: a
 * line, or an area down to the baseline when the series is filled.
 *
 * @param points Moved centers of every mark of the family, in parent coordinates.
 * @returns Path data, or `null` with fewer than two points.
 */
export function seriesPath(points: [number, number][], design: PartialDesign, filled: boolean): string | null {
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

/** Center of a mark in its parent's coordinates. */
export function centerOf(mark: SVGGraphicsElement): [number, number] | null {
    const box = parentBox(mark);
    return box ? [box.x + box.width / 2, box.y + box.height / 2] : null;
}
