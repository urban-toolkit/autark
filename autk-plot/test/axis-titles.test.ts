// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

// happy-dom lays out no text, so the test measures it: each character 6 px wide, a line 10 px high
// (8 above the baseline, 2 below), placed by the text's x, y, dx and dy (an em is 10 px) and its anchor.
const CHAR = 6;
const EM = 10;
const ASCENT = 8;
const DESCENT = 2;

type Box = { left: number; top: number; right: number; bottom: number };

function px(value: string | null): number {
    if (!value) return 0;
    const n = parseFloat(value);
    return value.trim().endsWith('em') ? n * EM : n;
}

function anchorOf(element: Element): string {
    for (let node: Element | null = element; node; node = node.parentElement) {
        const anchor = (node as SVGElement).style?.getPropertyValue('text-anchor') || node.getAttribute('text-anchor');
        if (anchor) return anchor;
    }
    return 'start';
}

/** A text's box in its own coordinates, as the stand-in lays it out. */
function textBox(text: Element) {
    const width = CHAR * (text.textContent ?? '').length;
    const x = px(text.getAttribute('x')) + px(text.getAttribute('dx'));
    const y = px(text.getAttribute('y')) + px(text.getAttribute('dy'));
    const anchor = anchorOf(text);
    const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    return { x: left, y: y - ASCENT, width, height: ASCENT + DESCENT };
}

/** A point through a transform attribute's translates and rotations, the last one first. */
function transformed(transform: string | null, [x, y]: [number, number]): [number, number] {
    const steps = [...(transform ?? '').matchAll(/(translate|rotate)\(([^)]*)\)/g)].reverse();
    for (const [, kind, args] of steps) {
        const [p = 0, q = 0] = args.split(/[\s,]+/).filter(Boolean).map(Number);
        if (kind === 'translate') {
            [x, y] = [x + p, y + q];
        } else {
            const r = (p * Math.PI) / 180;
            [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
        }
    }
    return [x, y];
}

/** A text's box in the coordinates of its ancestor `frame`, through the transforms between them. */
function boxIn(frame: Element, text: Element): Box {
    const { x, y, width, height } = textBox(text);
    let corners: [number, number][] = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
    for (let node: Element | null = text; node && node !== frame; node = node.parentElement) {
        const transform = node.getAttribute('transform');
        corners = corners.map((corner) => transformed(transform, corner));
    }
    const xs = corners.map(([cx]) => cx);
    const ys = corners.map(([, cy]) => cy);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** The box all the tick labels of an axis group take, in its coordinates. */
function labelsBox(axis: Element): Box {
    const boxes = Array.from(axis.querySelectorAll('.tick text'), (label) => boxIn(axis, label));
    return {
        left: Math.min(...boxes.map((box) => box.left)),
        top: Math.min(...boxes.map((box) => box.top)),
        right: Math.max(...boxes.map((box) => box.right)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
}

/** The title of an axis group. */
function titleOf(axis: Element): Element {
    const title = Array.from(axis.children).find((child) => child.classList.contains('axis-label'));
    if (!title) throw new Error('The axis has no title.');
    return title;
}

/** Where an axis group sits in its svg. */
function originOf(axis: Element): [number, number] {
    return transformed(axis.getAttribute('transform'), [0, 0]);
}

/** Draws a plot in a container of its own and returns its svg and its x and y axis groups. */
function draw(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, config);
    const svg = div.querySelector('svg');
    const x = svg?.querySelector('.x.axis');
    const y = svg?.querySelector('.y.axis');
    if (!svg || !x || !y) throw new Error('The plot drew no svg with two axes.');
    return { plot, svg, x, y };
}

function collectionOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [i, i] },
            properties,
        })),
    };
}

// Land uses with long names, as the rotated tick labels of autarkjs.org's examples.
const landUses = collectionOf([
    { landuse: 'Commercial', kind: 'k1', area: 10 },
    { landuse: 'Residential', kind: 'k2', area: 20 },
    { landuse: 'Industrial', kind: 'k1', area: 30 },
    { landuse: 'Institutional', kind: 'k2', area: 40 },
]);

beforeEach(() => {
    vi.spyOn(SVGGraphicsElement.prototype, 'getBBox').mockImplementation(function (this: SVGGraphicsElement) {
        const box = this.tagName.toLowerCase() === 'text' ? textBox(this) : { x: 0, y: 0, width: 0, height: 0 };
        return { ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height, toJSON: () => box } as DOMRect;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('Axis titles clear of their tick labels', () => {
    it('puts a bar chart\'s x title, drawn over its rotated tick labels, below them, inside the svg', () => {
        // 300 px wide, so the title, at the right end, sits over the last label.
        const { svg, x } = draw({
            type: 'barchart',
            collection: landUses,
            attributes: { axis: ['landuse', 'area'] },
            labels: { axis: ['Land use', 'Area'] },
            width: 300,
        });
        const title = boxIn(x, titleOf(x));

        expect(title.top).toBeGreaterThan(labelsBox(x).bottom);
        expect(originOf(x)[1] + title.bottom).toBeLessThanOrEqual(Number(svg.getAttribute('height')));
    });

    it('puts a heat matrix\'s y title, drawn over its tick labels, beyond the widest, inside the svg', () => {
        // A title long enough to reach down to the second label, "Residential".
        const { y } = draw({
            type: 'heatmatrix',
            collection: landUses,
            attributes: { axis: ['kind', 'landuse'], color: '@transform' },
            transform: { preset: 'binning-2d' },
            labels: { axis: ['Kind', 'Land use of the parcel'] },
        });
        const title = boxIn(y, titleOf(y));

        expect(title.right).toBeLessThan(labelsBox(y).left);
        expect(originOf(y)[0] + title.left).toBeGreaterThanOrEqual(0);
    });

    it('keeps a bar chart\'s x title in place when it is drawn over none of its tick labels', () => {
        // 800 px wide: the short title, at the right end, is right of the last rotated label.
        const { x } = draw({
            type: 'barchart',
            collection: landUses,
            attributes: { axis: ['landuse', 'area'] },
            labels: { axis: ['Use', 'Area'] },
        });

        expect(x.getAttribute('transform')).toBe('translate(40, 450)');
        expect(titleOf(x).getAttribute('y')).toBe('35');
    });

    it('keeps the titles of a scatterplot whose titles are clear where they were', () => {
        const { x, y } = draw({
            type: 'scatterplot',
            collection: collectionOf([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }]),
            attributes: { axis: ['a', 'b'] },
        });

        // The default margins (left 40, top 80, bottom 50) of an 800 by 500 plot, and main's places.
        expect(x.getAttribute('transform')).toBe('translate(40, 450)');
        expect(y.getAttribute('transform')).toBe('translate(40, 80)');
        expect(titleOf(x).getAttribute('y')).toBe('35');
        expect(titleOf(y).getAttribute('y')).toBe('-27');
    });

    it('keeps the x titles of a bar chart and a line chart unrotated through a redraw', () => {
        const bars = draw({ type: 'barchart', collection: landUses, attributes: { axis: ['kind', 'area'] } });
        const lines = draw({
            type: 'linechart',
            collection: collectionOf([{ series: [1, 2, 3] }]),
            attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series' },
        });
        bars.plot.draw();
        lines.plot.draw();

        expect(titleOf(bars.x).getAttribute('transform')).toBeNull();
        expect(titleOf(lines.x).getAttribute('transform')).toBeNull();
    });
});
