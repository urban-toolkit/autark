/**
 * Evaluation of the automatic design space against the built-in catalog.
 *
 * Every built-in plot paints the selected part with code written for it. Here
 * the inference looks only at each plot's marks (its DOM), as it would for a
 * plain D3 drawing, and every built-in partial mark is measured against the
 * part the automatic rule would draw. A plot agrees when all its measured
 * parts match; the table documents where the automatic design reproduces the
 * hand-made one and where it does not.
 */

import { beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PartialDesign, PlotType, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';
import { installSvgBBox } from './svg-geometry';

const collection = () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj_landuse.geojson'));
const events = { axis: ['sjoin.collect.noise', '@transform'] };
const daily = { preset: 'binning-events' as const, options: { timestamp: 'date', resolution: 'day' as const } };
type Config = Omit<UnifiedPlotConfig, 'type' | 'collection'>;

/** The catalog configurations (as in the filter test), built-in types only. */
const CONFIGS: Record<Exclude<PlotType, 'registered'>, Config> = {
    scatterplot: { attributes: { axis: ['shape_area', 'shape_leng'] } },
    barchart: { attributes: { axis: ['shape_area', '@transform'] }, transform: { preset: 'binning-1d' } },
    'parallel-coordinates': { attributes: { axis: ['shape_area', 'shape_leng', 'landuse'] } },
    table: { attributes: { axis: ['ntaname', 'landuse'] } },
    linechart: { attributes: events, transform: { preset: 'binning-events', options: { timestamp: 'date' } } },
    heatmatrix: { attributes: { axis: ['shape_area', 'landuse'], color: '@transform' }, transform: { preset: 'binning-2d' } },
    boxplot: { attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'box-stats' } },
    sankey: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' } },
    pie: { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
    donut: { attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' } },
    areachart: { attributes: events, transform: { preset: 'binning-events', options: { timestamp: 'date' } } },
    bubble: { attributes: { axis: ['shape_area', 'shape_leng', 'shape_area'] } },
    hexbin: { attributes: { axis: ['shape_area', 'shape_leng'] }, transform: { preset: 'binning-hex', options: { radius: 24 } } },
    calendar: { attributes: events, transform: daily },
    waffle: { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
    stackedbar: { attributes: { axis: ['cdta2020', 'landuse'] }, transform: { preset: 'hierarchy' } },
    treemap: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' } },
    sunburst: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' } },
    radar: { attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] }, transform: { preset: 'fold' } },
    ecdf: { attributes: { axis: ['shape_leng'] }, transform: { preset: 'cumulative' } },
    pareto: { attributes: { axis: ['cdta2020'] }, transform: { preset: 'cumulative' } },
    chord: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' } },
    density: { attributes: { axis: ['shape_leng'] }, transform: { preset: 'density' } },
    violin: { attributes: { axis: ['landuse', 'shape_leng'] }, transform: { preset: 'density' } },
};

/** Exact agreement (relative 1e-3), or within 2 px, which tells a cosmetic inset from another design. */
const EXACT = { relative: 1e-3, pixels: 0 };
const NEAR = { relative: 1e-3, pixels: 2 };
let tolerance = EXACT;
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(tolerance.relative * Math.max(1, Math.abs(b)), tolerance.pixels);

/** Point through an element's own transform. */
function through(element: Element, x: number, y: number): [number, number] {
    const [a, , , d, e, f] = next.ownMatrix(element);
    return [a * x + e, d * y + f];
}
const num = (element: Element, name: string) => Number(element.getAttribute(name));

/** Box of a rect or circle in its parent's coordinates. */
function boxOf(element: Element): { x: number; y: number; w: number; h: number } | null {
    const tag = element.tagName.toLowerCase();
    const [x0, y0, x1, y1] = tag === 'rect'
        ? [num(element, 'x'), num(element, 'y'), num(element, 'x') + num(element, 'width'), num(element, 'y') + num(element, 'height')]
        : tag === 'circle'
            ? [num(element, 'cx') - num(element, 'r'), num(element, 'cy') - num(element, 'r'), num(element, 'cx') + num(element, 'r'), num(element, 'cy') + num(element, 'r')]
            : [NaN, NaN, NaN, NaN];
    if (!Number.isFinite(x0)) return null;
    const [ax, ay] = through(element, x0, y0);
    const [bx, by] = through(element, x1, y1);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Vertices of an `M…L…Z` polygon path. */
function polygonOf(element: Element): [number, number][] | null {
    const d = element.getAttribute('d') ?? '';
    if (!/^M[^A-Za-z]*(L[^A-Za-z]*)+Z?$/i.test(d.replace(/\s+/g, ''))) return null;
    const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push(through(element, numbers[i], numbers[i + 1]));
    return points;
}
const polygonArea = (p: [number, number][]) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;
const polygonCenter = (p: [number, number][]) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** Whether a built-in partial mark draws the part the automatic rule would draw. */
function agrees(mark: Element, partial: Element, design: PartialDesign, r: number, selected: Set<number>, unitValue: (feature: number) => number): boolean {
    const clamped = Math.min(1, Math.max(0, r));
    if (!(partial instanceof SVGElement)) {
        // HTML: the same fill direction and stops as the automatic fill.
        const parse = (fill: string) => [/linear-gradient\((to \w+)/.exec(fill)?.[1], ...Array.from(fill.matchAll(/([\d.]+)%/g), m => Number(m[1]))];
        const [direction, ...stops] = parse((partial as HTMLElement).style.backgroundImage);
        const [expected, ...expectedStops] = parse(next.htmlFill(design, r, 'red'));
        return direction === expected && stops.length === expectedStops.length && stops.every((s, i) => close(s as number, expectedStops[i] as number));
    }
    switch (design.rule) {
        case 'units':
            return selected.has(Number(partial.getAttribute('data-autk-feature')));
        case 'length': {
            const m = boxOf(mark);
            const p = boxOf(partial);
            if (!m || !p) return false;
            const [start, size, pStart, pSize, cross, pCross] = design.axis === 'y'
                ? [m.y, m.h, p.y, p.h, m.w, p.w]
                : [m.x, m.w, p.x, p.w, m.h, p.h];
            const anchor = design.anchor === 'start' ? start : design.anchor === 'center' ? start + size / 2 : start + size;
            const pAnchor = design.anchor === 'start' ? pStart : design.anchor === 'center' ? pStart + pSize / 2 : pStart + pSize;
            return close(pSize, size * r) && close(pAnchor, anchor) && close(pCross, cross);
        }
        case 'angle': {
            const m = next.parseSector(mark.getAttribute('d'));
            const p = next.parseSector(partial.getAttribute('d'));
            if (!m || !p) return false;
            if (design.mode === 'sweep') {
                return close(p.start, m.start) && close(p.inner, m.inner) && close(p.outer, m.outer) && close(p.sweep, m.sweep * clamped);
            }
            return close(p.sweep, m.sweep) && close(p.inner, m.inner)
                && close((p.outer ** 2 - m.inner ** 2) / (m.outer ** 2 - m.inner ** 2), clamped);
        }
        case 'band': {
            if (design.mode === 'flow') {
                const m = next.parseFlow(mark.getAttribute('d'));
                const p = next.parseFlow(partial.getAttribute('d'));
                if (!m || !p) return false;
                return m.edge.flat().every((v, i) => close(p.edge.flat()[i], v)) && close(p.offset[0], m.offset[0] * clamped) && close(p.offset[1], m.offset[1] * clamped);
            }
            const m = next.parseRibbon(mark.getAttribute('d'));
            const p = next.parseRibbon(partial.getAttribute('d'));
            if (!m || !p) return false;
            return close(p.radius, m.radius)
                && close(p.source[0], m.source[0]) && close(p.source[1], m.source[1] * clamped)
                && close(p.target[0], m.target[0]) && close(p.target[1], m.target[1] * clamped);
        }
        case 'members': {
            const m = boxOf(mark);
            if (!m || !design.scale || partial.tagName.toLowerCase() !== 'circle') return false;
            const feature = Number(partial.getAttribute('data-autk-feature'));
            const [band, middle] = design.axis === 'y' ? [m.w, m.x + m.w / 2] : [m.h, m.y + m.h / 2];
            const along = design.scale.a + design.scale.k * unitValue(feature);
            const across = middle + next.memberOffset(feature, band);
            const [cx, cy] = [num(partial, 'cx'), num(partial, 'cy')];
            return selected.has(feature) && close(design.axis === 'y' ? cy : cx, along) && close(design.axis === 'y' ? cx : cy, across);
        }
        case 'width':
            return close(Number(partial.getAttribute('stroke-width') ?? (partial as SVGElement).style.strokeWidth), Number(mark.getAttribute('stroke-width') ?? (mark as SVGElement).style.strokeWidth) * clamped);
        case 'trace':
            return close(Number(((partial.getAttribute('stroke-dasharray') ?? (partial as SVGElement).style.strokeDasharray) || 'NaN').split(/[\s,]+/)[0]), clamped);
        case 'position': {
            const m = boxOf(mark);
            const p = boxOf(partial);
            if (!m || !p) return false;
            const [cx, cy, px, py] = [m.x + m.w / 2, m.y + m.h / 2, p.x + p.w / 2, p.y + p.h / 2];
            const b = design.baseline ?? 0;
            if (design.axis === 'radial') return close(px, r * cx) && close(py, r * cy);
            return design.axis === 'y' ? close(py, b + r * (cy - b)) && close(px, cx) : close(px, b + r * (cx - b)) && close(py, cy);
        }
        case 'area':
        case 'glyph': {
            const m = boxOf(mark);
            const p = boxOf(partial);
            if (m && p) return close(p.w * p.h, m.w * m.h * clamped) && close(p.x + p.w / 2, m.x + m.w / 2) && close(p.y + p.h / 2, m.y + m.h / 2);
            const mp = polygonOf(mark);
            const pp = polygonOf(partial);
            if (!mp || !pp) return false;
            const [mx, my] = polygonCenter(mp);
            const [px, py] = polygonCenter(pp);
            return close(polygonArea(pp), polygonArea(mp) * clamped) && close(px, mx) && close(py, my);
        }
    }
}

/** Parts measured and parts that agree, per mark family. */
type Family = { design: PartialDesign; measured: number; agreed: number; near: number };
type Row = { type: string; families: Family[]; measured: number; agreed: number };

function evaluate(type: Exclude<PlotType, 'registered'>): Row {
    const div = document.createElement('div');
    document.body.append(div);
    const data = collection();
    const plot = new next.AutkPlot(div, { type, collection: data, events: [next.PlotEvent.CLICK], ...CONFIGS[type] } as UnifiedPlotConfig);
    const instance = plot.instance as unknown as {
        renderAxisAttributes: string[];
        aggregatesRows: boolean;
        _colorProperty: 'fill' | 'stroke';
        segregatedParts(): next.SegregatedPart[];
        _provenance: next.ProvenanceModel;
    };
    const marks = Array.from(div.querySelectorAll<SVGGraphicsElement>('.autkMark'));
    const field = instance.renderAxisAttributes[1] ?? 'value';
    const valueOf = (row: AutkDatum) => {
        const value = Number((row as Record<string, unknown>)[field]);
        return Number.isFinite(value) ? value : Number((row as Record<string, unknown>).value);
    };
    const designs = next.inferPartialDesign(marks, valueOf, instance.aggregatesRows, instance._colorProperty);

    const half = data.features.map((_f, i) => i).filter(i => i % 2 === 0);
    if (instance.aggregatesRows) plot.setSelection(half);
    else plot.setSelection(half, data.features.map((_f, feature) => ({ feature, selectedUnits: 1, totalUnits: 2 })));
    const parts = new Map(instance.segregatedParts().map(p => [p.mark, p]));

    const families = designs.map(design => ({ design, measured: 0, agreed: 0, near: 0 }));
    // SVG parts are elements of their own; an HTML mark is filled to its part.
    const filled = marks.filter(m => !(m instanceof SVGElement) && /linear-gradient/.test((m as unknown as HTMLElement).style.backgroundImage));
    for (const partial of [...Array.from(div.querySelectorAll('svg .autkPartial')), ...filled]) {
        const id = partial.getAttribute('data-autk-provenance');
        const sameId = marks.filter(m => m.getAttribute('data-autk-provenance') === id);
        const mark = sameId.find(m => m.tagName === partial.tagName) ?? sameId[0];
        const part = id ? parts.get(id) : undefined;
        if (!mark || !part) continue;
        const family = families.find(f => f.design.kind === next.markKindOf(mark, instance._colorProperty));
        if (!family) continue;
        family.measured += 1;
        const unitValue = (feature: number) => instance._provenance.contributions.find(u => u.target === id!.slice('mark:'.length) && u.source === `feature:${feature}`)?.value ?? NaN;
        const check = () => agrees(mark, partial, family.design, next.ratioOf(part, family.design.rule), new Set(half), unitValue);
        tolerance = EXACT;
        if (check()) family.agreed += 1;
        tolerance = NEAR;
        if (check()) family.near += 1;
        tolerance = EXACT;
    }
    const sum = (key: 'measured' | 'agreed') => families.reduce((s, f) => s + f[key], 0);
    return { type, families, measured: sum('measured'), agreed: sum('agreed') };
}

const near = (row: Row) => row.families.reduce((s, f) => s + f.near, 0);
const verdict = (row: Row) => row.measured === 0 ? 'not comparable'
    : row.agreed === row.measured ? 'same'
    : near(row) === row.measured ? 'same within 2 px'
    : row.agreed === 0 ? 'different' : 'partly';

describe('automatic designs against the built-in catalog', () => {
    const rows: Row[] = [];
    beforeAll(() => {
        installSvgBBox();
        for (const type of Object.keys(CONFIGS) as Exclude<PlotType, 'registered'>[]) rows.push(evaluate(type));
    });

    test('all 24 hand-made designs are reproduced exactly, part by part, from the marks alone', () => {
        const same = rows.filter(r => verdict(r) === 'same').map(r => r.type);
        expect(same).toHaveLength(24);
        expect(rows.reduce((s, r) => s + r.measured, 0)).toBe(608);
    });

    test('each plot gets the expected rule', () => {
        const rules = Object.fromEntries(rows.map(r => [r.type, r.families.map(f => `${f.design.kind}:${f.design.rule}`).sort().join(' ')]));
        expect(rules).toMatchObject({
            barchart: 'rect:length', stackedbar: 'rect:length', violin: 'rect:length', pareto: 'point:position rect:length',
            linechart: 'point:position', areachart: 'point:position', ecdf: 'point:position', density: 'point:position', radar: 'point:position',
            pie: 'sector:angle', donut: 'sector:angle', sunburst: 'sector:angle',
            sankey: 'rect:length shape:band', chord: 'sector:angle shape:band', boxplot: 'rect:members',
            'parallel-coordinates': 'stroke:trace', waffle: 'rect:units', table: 'html:glyph',
            scatterplot: 'point:glyph', bubble: 'point:glyph', heatmatrix: 'rect:glyph', calendar: 'rect:glyph', treemap: 'rect:glyph', hexbin: 'shape:glyph',
        });
        // Thick rings show the inner sector; the thin chord arcs show the leading share of the sweep.
        const angle = (type: string) => rows.find(r => r.type === type)!.families.find(f => f.design.rule === 'angle')!.design.mode;
        expect(['pie', 'donut', 'sunburst', 'chord'].map(angle)).toEqual(['radial', 'radial', 'radial', 'sweep']);
    });

    test('Sankey nodes grow from the top, and HTML table rows fill from the left to their share', () => {
        const sankey = rows.find(r => r.type === 'sankey')!;
        expect(sankey.families.find(f => f.design.kind === 'rect')!.design).toMatchObject({ rule: 'length', axis: 'y', anchor: 'start' });
        const table = rows.find(r => r.type === 'table')!;
        expect(table.families).toMatchObject([{ design: { kind: 'html', rule: 'glyph' }, measured: 38, agreed: 38 }]);
    });
});
