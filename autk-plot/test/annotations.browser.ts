import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { AutkPlot, PlotEvent, registerPlot, unregisterPlot } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ x: 5, y: 6, category: 'mean' }, { x: 8, y: 9, category: 'other' }].map(properties => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties,
    })),
};

afterEach(() => {
    unregisterPlot('annotation-test');
    document.body.replaceChildren();
});

describe('Fixed plot annotations', () => {
    it('uses registered plot coordinates and replaces overlays without redrawing an active brush', () => {
        let draws = 0;
        registerPlot({
            name: 'annotation-test', annotations: 'reference', highlight: 'boolean',
            draw({ group, rows, value, axisX, axisY, width, height }) {
                draws++;
                const x = d3.scaleLinear([0, 10], [0, width]);
                const y = d3.scaleLinear([0, 10], [height, 0]);
                axisX(d3.axisBottom(x));
                axisY(d3.axisLeft(y));
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                    .attr('cx', row => x(Number(value(row, 0))))
                    .attr('cy', row => y(Number(value(row, 1)))).attr('r', 4);
            },
        });
        const host = document.body.appendChild(document.createElement('div'));
        const plot = new AutkPlot(host, {
            type: 'registered', plot: 'annotation-test', collection,
            attributes: { axis: ['x', 'y'] }, events: [PlotEvent.BRUSH],
        });
        const mark = host.querySelector('circle.autkMark')!;
        const brush = host.querySelector<SVGGElement>('.autkBrush')!;
        const rect = brush.getBoundingClientRect();
        const instance = plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> };
        instance._brushBehaviors.get('0')!.move(d3.select(brush), [[0, 0], [rect.width, rect.height]]);
        const selection = plot.selection;
        expect(selection).toEqual([0, 1]);
        const brushSelection = brush.querySelector('.selection')!;
        const before = draws;
        const provenance = plot.provenance;
        plot.setAnnotations([
            { id: 'x', type: 'line', x: 5 }, { id: 'y', type: 'line', y: 6 },
            { id: 'point', type: 'point', x: 5, y: 6, label: 'Target' },
            { id: 'band', type: 'band', y: [4, 7] },
            { id: 'outside', type: 'point', x: -1, y: 6 },
        ]);
        const point = host.querySelector('[data-annotation-id="point"] circle')!;
        const band = host.querySelector('[data-annotation-id="band"] rect')!;
        expect(Number(point.getAttribute('cx'))).toBeCloseTo(Number(mark.getAttribute('cx')));
        expect(Number(point.getAttribute('cy'))).toBeCloseTo(Number(mark.getAttribute('cy')));
        expect(band.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(mark.compareDocumentPosition(point) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(getComputedStyle(point).pointerEvents).toBe('none');
        expect(host.querySelector('[data-annotation-id="outside"]')).toBeNull();
        expect(() => plot.setAnnotations([{ id: 'x', type: 'line', x: 4 }, { id: 'x', type: 'line', y: 4 }])).toThrow(/x.*duplicate/i);
        expect(host.querySelector('[data-annotation-id="point"] circle')).toBe(point);
        plot.setAnnotations([]);
        expect(host.querySelector('[data-annotation-id]')).toBeNull();
        expect(host.querySelector('circle.autkMark')).toBe(mark);
        expect(brush.querySelector('.selection')).toBe(brushSelection);
        expect(plot.selection).toEqual(selection);
        expect(plot.provenance).toBe(provenance);
        expect(draws).toBe(before);
    });

    it('treats category labels literally and reinstalls hidden references after data replacement', () => {
        const host = document.body.appendChild(document.createElement('div'));
        const plot = new AutkPlot(host, { type: 'barchart', collection, attributes: { axis: ['category', 'y'] } });
        plot.setAnnotations([
            { id: 'guide', type: 'line', x: 'mean' },
            { id: 'band', type: 'band', x: ['other', 'mean'] },
        ]);
        const rect = host.querySelector<SVGRectElement>('rect.autkMark')!;
        const guide = () => host.querySelector('[data-annotation-id="guide"] line');
        expect(Number(guide()?.getAttribute('x1'))).toBeCloseTo(rect.x.baseVal.value + rect.width.baseVal.value / 2);
        expect(host.querySelector('[data-annotation-id="band"] rect')).not.toBeNull();
        plot.updateCollection({ ...collection, features: collection.features.slice(1) });
        expect(guide()).toBeNull();
        expect(host.querySelector('[data-annotation-id="band"]')).toBeNull();
        plot.updateCollection(collection);
        expect(guide()).not.toBeNull();
    });
});
