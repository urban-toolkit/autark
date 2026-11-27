import * as d3 from 'd3';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { AutkPlot, registerPlot, unregisterPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

const collection = (rows: Record<string, unknown>[]): FeatureCollection => ({
    type: 'FeatureCollection', features: rows.map(properties => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties,
    })),
});

function draw(config: UnifiedPlotConfig) {
    const host = document.body.appendChild(document.createElement('div'));
    const plot = new AutkPlot(host, { ...config, width: 440, height: 340 });
    const guide = (id: string, attr: string) => Number(host.querySelector(`[data-annotation-id="${id}"] line`)?.getAttribute(attr));
    return { host, plot, guide };
}

afterEach(() => {
    unregisterPlot('statistical-observations');
    document.body.replaceChildren();
});

const points = collection([{ x: 0, y: 2 }, { x: '2', y: 6 }, { x: 4, y: '' }, { x: null, y: 10 }]);

describe('Statistical annotations', () => {
    it.each(['scatterplot', 'bubble'] as const)('uses marginal stats but complete pairs for the centroid and fit on %s', type => {
        const { host, plot, guide } = draw({ type, collection: points,
            attributes: { axis: type === 'bubble' ? ['x', 'y', 'y'] : ['x', 'y'] },
            scales: { x: { domain: [-2, 6] }, y: { domain: [0, 12] } },
        });
        plot.setAnnotations([
            { id: 'mean-x', type: 'line', x: 'mean' }, { id: 'mean-y', type: 'line', y: 'mean' },
            { id: 'min-x', type: 'line', x: 'min' }, { id: 'max-y', type: 'line', y: 'max' },
            { id: 'centroid', type: 'point', x: 'mean', y: 'mean' }, { id: 'fit', type: 'line', fit: 'linear' },
        ]);
        const extent = host.querySelector('.autkClear')!;
        const width = Number(extent.getAttribute('width')), height = Number(extent.getAttribute('height'));
        const centroid = host.querySelector('[data-annotation-id="centroid"] circle')!;
        expect(guide('mean-x', 'x1')).toBeCloseTo(width / 2);
        expect(guide('mean-y', 'y1')).toBeCloseTo(height / 2);
        expect(guide('min-x', 'x1')).toBeCloseTo(width / 4);
        expect(guide('max-y', 'y1')).toBeCloseTo(height / 6);
        expect(Number(centroid.getAttribute('cx'))).toBeCloseTo(width * 3 / 8);
        expect(Number(centroid.getAttribute('cy'))).toBeCloseTo(height * 2 / 3);
        expect(guide('fit', 'x1')).toBeCloseTo(width / 4);
        expect(guide('fit', 'x2')).toBeCloseTo(width / 2);
        expect(guide('fit', 'y1')).toBeCloseTo(height * 5 / 6);
        expect(guide('fit', 'y2')).toBeCloseTo(height / 2);
    });

    it('clips the fit without recalculating it for the display window and hides degenerate fits', () => {
        const data = collection([{ x: 0, y: 0 }, { x: 2, y: 8 }, { x: 4, y: 4 }]);
        const { host, plot, guide } = draw({ type: 'scatterplot', collection: data, attributes: { axis: ['x', 'y'] },
            scales: { x: { domain: [1, 3] }, y: { domain: [0, 8] } },
        });
        plot.setAnnotations([{ id: 'fit', type: 'line', fit: 'linear' }, { id: 'mean', type: 'line', y: 'mean' }]);
        const height = Number(host.querySelector('.autkClear')!.getAttribute('height'));
        const width = Number(host.querySelector('.autkClear')!.getAttribute('width'));
        // The full fit is y = x + 2; the window alone contains only one observation.
        expect(guide('fit', 'x1')).toBeCloseTo(0);
        expect(guide('fit', 'x2')).toBeCloseTo(width);
        expect(guide('fit', 'y1')).toBeCloseTo(height * 5 / 8);
        expect(guide('fit', 'y2')).toBeCloseTo(height * 3 / 8);
        expect(guide('mean', 'y1')).toBeCloseTo(height / 2);
        plot.updateCollection(collection([{ x: 2, y: 2 }, { x: 2, y: 4 }]));
        expect(host.querySelector('[data-annotation-id="fit"]')).toBeNull();
        expect(host.querySelector('[data-annotation-id="mean"]')).not.toBeNull();
        plot.updateCollection(collection([]));
        expect(host.querySelector('[data-annotation-id]')).toBeNull();
    });

    it('uses filtered bar observations before categorical omission and rejects unsupported stats atomically', () => {
        const { host, plot, guide } = draw({ type: 'barchart', collection: collection([
            { category: 'mean', y: 10, keep: 1 }, { category: 'hidden', y: 30, keep: 1 }, { category: 'dropped', y: 80, keep: 0 },
        ]), attributes: { axis: ['category', 'y'] }, filter: { attribute: 'keep', op: '==', value: 1 },
        scales: { x: { domain: ['mean'] }, y: { domain: [0, 40] } } });
        plot.setAnnotations([{ id: 'literal', type: 'line', x: 'mean' }, { id: 'average', type: 'line', y: 'mean' }]);
        expect(host.querySelector('[data-annotation-id="literal"]')).not.toBeNull();
        expect(guide('average', 'y1')).toBeCloseTo(Number(host.querySelector('.autkClear')!.getAttribute('height')) / 2);
        expect(() => plot.setAnnotations([{ id: 'bad-fit', type: 'line', fit: 'linear' }])).toThrow(/bad-fit.*numeric/i);
        expect(host.querySelector('[data-annotation-id="average"]')).not.toBeNull();
    });

    it('requires registered plots to declare observations separately from their axes', () => {
        registerPlot({ name: 'statistical-observations', annotations: 'reference',
            draw({ group, axisY, height, setAnnotationObservations, rows, value }) {
                axisY(d3.axisLeft(d3.scaleLinear([0, 10], [height, 0])));
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark').attr('r', 4);
                if (value(rows[0], 0) === 'enabled') {
                    setAnnotationObservations?.({ axes: ['y'], rows: [{ y: 2 }, { y: 8 }, { y: Infinity }] });
                }
            },
        });
        const config = { type: 'registered' as const, plot: 'statistical-observations', attributes: { axis: ['mode'] } };
        const { host, plot, guide } = draw({ ...config, collection: collection([{ mode: 'enabled' }]) });
        plot.setAnnotations([{ id: 'mean', type: 'line', y: 'mean' }]);
        expect(guide('mean', 'y1')).toBeCloseTo(Number(host.querySelector('.autkClear')!.getAttribute('height')) / 2);
        const unsupported = draw({ ...config, collection: collection([{ mode: 'disabled' }]) });
        expect(() => unsupported.plot.setAnnotations([{ id: 'mean', type: 'line', y: 'mean' }])).toThrow(/no numeric observations/i);
    });

    it('averages grouped line buckets rather than their source observations', () => {
        const { host, plot, guide } = draw({ type: 'linechart', collection: collection([
            { group: 'A', monthly: [0, 20] }, { group: 'A', monthly: [20] }, { group: 'B', monthly: [30] },
        ]), attributes: { axis: ['monthly'], series: 'group' }, transform: { preset: 'reduce-series' },
        scales: { x: { domain: ['0'] }, y: { domain: [0, 40] } } });
        plot.setAnnotations([{ id: 'average', type: 'line', y: 'mean' }]);
        expect(guide('average', 'y1')).toBeCloseTo(Number(host.querySelector('.autkClear')!.getAttribute('height')) / 2);
        expect(() => plot.setAnnotations([{ id: 'bad-fit', type: 'line', fit: 'linear' }])).toThrow(/bad-fit.*numeric/i);
    });
});
