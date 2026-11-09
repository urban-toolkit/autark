// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { PlotOverlay, UnifiedPlotConfig } from '../src';

/** A feature for each of `rows`, holding its properties. */
function featuresOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties })),
    };
}

// Two categories, each split into two kinds.
const split = featuresOf([
    { bin: 'a', kind: 'x', count: 4 },
    { bin: 'a', kind: 'y', count: 2 },
    { bin: 'b', kind: 'x', count: 3 },
    { bin: 'b', kind: 'y', count: 5 },
]);
// Three categories, one row each.
const single = featuresOf([{ bin: 'a', count: 4 }, { bin: 'b', count: 2 }, { bin: 'c', count: 3 }]);

function draw(config: UnifiedPlotConfig): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return div;
}

/** Each bar's box and style, in the order of the bars. */
function bars(div: HTMLElement) {
    return Array.from(div.querySelectorAll<SVGRectElement>('.autkMark'), (bar) => ({
        x: Number(bar.getAttribute('x')),
        y: Number(bar.getAttribute('y')),
        width: Number(bar.getAttribute('width')),
        height: Number(bar.getAttribute('height')),
        opacity: bar.style.getPropertyValue('fill-opacity'),
        stroke: bar.style.getPropertyValue('stroke'),
    }));
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Bar chart groups', () => {
    const grouped: UnifiedPlotConfig = { type: 'barchart', collection: split, attributes: { axis: ['bin', 'count'], color: 'kind' } };

    it('overlays the groups of a category by default: one band each, translucent, unstroked', () => {
        const div = draw(grouped);
        const [ax, ay, bx, by] = bars(div);

        expect(Array.from(div.querySelectorAll('.x.axis .tick text'), (text) => text.textContent)).toEqual(['a', 'b']);
        expect(ay.x).toBe(ax.x);
        expect(ay.width).toBe(ax.width);
        expect(by.x).toBe(bx.x);
        expect(bx.x).toBeGreaterThan(ax.x + ax.width);
        expect([ax, ay, bx, by].map((bar) => [bar.opacity, bar.stroke])).toEqual(Array(4).fill(['0.5', 'none']));
    });

    it('sets the groups of a category side by side, each in a slice of the band', () => {
        const overlaid = bars(draw(grouped));
        const [ax, ay, bx, by] = bars(draw({ ...grouped, groupMode: 'side-by-side' }));

        expect(ax.x).toBe(overlaid[0].x);
        expect(ax.width).toBeCloseTo(overlaid[0].width / 2);
        expect(ay.x).toBeCloseTo(ax.x + ax.width);
        expect(by.x).toBeCloseTo(bx.x + bx.width);
        expect(ay.width).toBeCloseTo(ax.width);
        expect([ax, ay, bx, by].map((bar) => bar.opacity)).toEqual(['1', '1', '1', '1']);
    });

    it('draws a category with one row as one opaque, stroked bar, with or without a color attribute', () => {
        const plain = bars(draw({ type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'] } }));
        const colored = bars(draw({ type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'], color: 'count' } }));

        for (const drawn of [plain, colored]) {
            expect(drawn).toHaveLength(3);
            expect(drawn.map((bar) => [bar.opacity, bar.stroke])).toEqual(Array(3).fill(['1', '#2f2f2f']));
        }
        expect(colored.map((bar) => [bar.x, bar.width])).toEqual(plain.map((bar) => [bar.x, bar.width]));
    });
});

describe('Bar chart padding', () => {
    /** Each bar's width as a fraction of the step from one bar to the next. */
    function widthOverStep(barPadding?: number): number {
        const [a, b] = bars(draw({ type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'] }, barPadding }));
        return a.width / (b.x - a.x);
    }

    it('leaves a quarter of a band between bars by default', () => {
        expect(widthOverStep()).toBeCloseTo(0.75);
    });

    it('leaves the fraction of a band barPadding gives', () => {
        expect(widthOverStep(0)).toBeCloseTo(1);
        expect(widthOverStep(0.5)).toBeCloseTo(0.5);
    });
});

describe('x tick labels from xTickLabel', () => {
    it('writes a bar chart\'s ticks from the category key, upright and centered', () => {
        const div = draw({
            type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'] },
            xTickLabel: (key) => (key === 'b' ? '' : key.toUpperCase()),
        });

        const texts = Array.from(div.querySelectorAll<SVGTextElement>('.x.axis .tick text'));
        expect(texts.map((text) => text.textContent)).toEqual(['A', '', 'C']);
        expect(texts.every((text) => text.getAttribute('transform') === null && text.style.getPropertyValue('text-anchor') === 'middle')).toBe(true);
    });

    it('keeps a bar chart\'s rotated category labels without it', () => {
        const div = draw({ type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'] } });

        const texts = Array.from(div.querySelectorAll<SVGTextElement>('.x.axis .tick text'));
        expect(texts.map((text) => text.textContent)).toEqual(['a', 'b', 'c']);
        expect(texts.every((text) => text.getAttribute('transform') === 'rotate(-90)')).toBe(true);
    });

    it('writes a line chart\'s ticks from the bucket key', () => {
        const months = featuresOf([{ series: ['2024-01', '2024-02', '2024-03'].map((timestamp, i) => ({ timestamp, value: i })) }]);
        const div = draw({
            type: 'linechart', collection: months, attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' },
            xTickLabel: (key) => `M${Number(key.slice(5))}`,
        });

        expect(Array.from(div.querySelectorAll('.x.axis .tick text'), (text) => text.textContent)).toEqual(['M1', 'M2', 'M3']);
    });
});

describe('Bar chart overlay hook', () => {
    it('gives the layer behind the bars, the plot area, a category\'s band edge by index, and the y scale', () => {
        const calls: PlotOverlay[] = [];
        const div = draw({
            type: 'barchart', collection: single, attributes: { axis: ['bin', 'count'] },
            overlay: (overlay) => { calls.push(overlay); },
        });
        const overlay = calls[calls.length - 1];
        const layer = div.querySelector('.autkOverlay')!;
        const area = div.querySelector('.autkClear')!;
        const drawn = bars(div);

        expect(overlay.layer).toBe(layer);
        expect(layer.compareDocumentPosition(div.querySelector('.autkMarksGroup')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(overlay.width).toBe(Number(area.getAttribute('width')));
        expect(overlay.height).toBe(Number(area.getAttribute('height')));
        expect([0, 1, 2].map((i) => overlay.x(i))).toEqual(drawn.map((bar) => bar.x));
        // Out of range indexes keep to the first and last categories.
        expect(overlay.x(-1)).toBe(drawn[0].x);
        expect(overlay.x(7)).toBe(drawn[2].x);
        expect([4, 2, 3].map((count) => overlay.y(count))).toEqual(drawn.map((bar) => bar.y));
        expect(overlay.y(0)).toBeCloseTo(drawn[0].y + drawn[0].height);
        expect(overlay.rankOf).toBeUndefined();
    });
});
