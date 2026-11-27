import * as d3 from 'd3';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { AutkPlot, PlotEvent, markId } from '../src';
import type { UnifiedPlotConfig } from '../src';

const months = ['2025-01', '2025-02', '2025-03'];
const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { scenario: 'Baseline', keep: 1, values: [10, 12, 14] },
        { scenario: 'Proposal', keep: 0, values: [900, 900, 900] },
        { scenario: 'Proposal', keep: 1, values: [20, 22, 24] },
        { scenario: 'Baseline', keep: 1, values: [14, 16, 18] },
        { scenario: 'Proposal', keep: 1, values: [24, 26, 28] },
    ].map(({ scenario, keep, values }) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { scenario, keep, monthly: values.map((value, i) => ({ timestamp: months[i], value })) },
    })),
};

function withoutFebruary(scenarios: string[]): FeatureCollection {
    return { ...collection, features: collection.features.map(feature => {
        const properties = feature.properties!;
        return scenarios.includes(properties.scenario) ? { ...feature, properties: {
            ...properties, monthly: properties.monthly.filter((point: { timestamp: string }) => point.timestamp !== months[1]),
        } } : feature;
    }) };
}

function draw(overrides: Partial<UnifiedPlotConfig> = {}) {
    const host = document.body.appendChild(document.createElement('div'));
    const plot = new AutkPlot(host, {
        type: 'linechart', collection, attributes: { axis: ['monthly'], series: 'scenario' },
        transform: { preset: 'reduce-series' }, filter: { attribute: 'keep', op: '==', value: 1 },
        events: [PlotEvent.CLICK, PlotEvent.BRUSH], ...overrides,
    } as UnifiedPlotConfig);
    return { host, plot };
}

function point(host: HTMLElement, contributors: number[], bucket: string) {
    return Array.from(host.querySelectorAll<SVGCircleElement>('circle.autkMark')).find(node => {
        const row = d3.select<SVGCircleElement, { autkIds: number[]; bucket: string }>(node).datum();
        return row.bucket === bucket && row.autkIds.join() === contributors.join();
    })!;
}

afterEach(() => document.body.replaceChildren());

describe('Grouped line charts', () => {
    it('keeps click, brush, and linked highlights within the correct series for a shared bucket', () => {
        const { host, plot } = draw();
        const baseline = point(host, [0, 3], months[1]);
        const proposal = point(host, [2, 4], months[1]);
        expect(proposal.cx.baseVal.value).toBe(baseline.cx.baseVal.value);
        expect(proposal.cy.baseVal.value).toBeLessThan(baseline.cy.baseVal.value);
        expect(proposal.style.fill).not.toBe(baseline.style.fill);
        expect(host.querySelectorAll('.autk-line')).toHaveLength(2);
        const id = proposal.getAttribute('data-autk-provenance')!;
        expect(id).not.toBe(baseline.getAttribute('data-autk-provenance'));
        expect(plot.provenance.inverse([id]).map(stage => stage.stage)).toEqual(['M', 'D3', 'D2', 'D1', 'D0']);
        expect(plot.provenance.inverse([id]).at(-1)?.ids).toEqual(['feature:2', 'feature:4']);
        expect(plot.provenance.stages[3].ids.map(markId)).toContain(id);

        let clicked: number[] = [];
        plot.events.on(PlotEvent.CLICK, ({ selection }) => { clicked = selection; });
        proposal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(clicked).toEqual([2, 4]);
        plot.setSelection([]);
        const instance = plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> };
        const x = proposal.cx.baseVal.value, y = proposal.cy.baseVal.value;
        instance._brushBehaviors.get('0')!.move(d3.select(host.querySelector<SVGGElement>('.autkBrush')!), [[x - 6, y - 6], [x + 6, y + 6]]);
        expect(plot.selection).toEqual([2, 4]);
        plot.setSelection([2]);
        const parts = Array.from(host.querySelectorAll('.autkPartialSeries'));
        expect(parts).toHaveLength(1);
        expect(parts[0].parentElement).toBe(proposal.parentElement);
    });

    it('leaves real gaps in the base and linked-highlight paths using observed or explicit bucket order', () => {
        const cases = [
            { collection: withoutFebruary(['Baseline']), domain: undefined },
            { collection: withoutFebruary(['Baseline', 'Proposal']), domain: [...months].reverse() },
        ];
        for (const { collection, domain } of cases) {
            const { host, plot } = draw({ collection, scales: domain && { x: { domain } } });
            const xTicks = Array.from(host.querySelectorAll('.x.axis .tick text'), tick => tick.textContent);
            expect(xTicks).toEqual(domain ?? months);
            const first = point(host, [0, 3], months[0]);
            const path = first.parentElement?.querySelector('.autk-line');
            expect(path?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
            expect(path?.getAttribute('d')).not.toContain('L');
            plot.setSelection([0]);
            expect(host.querySelector('.autkPartialSeries')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
            expect(host.querySelectorAll('.autkPartialSeries')).toHaveLength(1);
        }
    });

    it('aligns guides and callouts with the actual point in a one-bucket view and restores hidden callouts', () => {
        const { host, plot } = draw({ scales: { x: { domain: [months[1]] } } });
        plot.setAnnotations([
            { id: 'guide', type: 'line', x: months[1] },
            { id: 'callout', type: 'point', x: months[1], series: 'Proposal', label: 'Proposal' },
            { id: 'band', type: 'band', x: [months[1], months[1]] },
        ]);
        expect(() => plot.setAnnotations([
            { id: 'invalid', type: 'point', x: months[1], y: 24, series: 'Proposal' } as never,
        ])).toThrow(/invalid.*without y/i);
        const mark = point(host, [2, 4], months[1]);
        const guide = () => host.querySelector('[data-annotation-id="guide"] line');
        const ring = () => host.querySelector('[data-annotation-id="callout"] circle');
        expect(Number(guide()?.getAttribute('x1'))).toBeCloseTo(mark.cx.baseVal.value);
        expect(Number(ring()?.getAttribute('cx'))).toBeCloseTo(mark.cx.baseVal.value);
        expect(Number(ring()?.getAttribute('cy'))).toBeCloseTo(mark.cy.baseVal.value);
        expect(d3.color(ring()?.getAttribute('stroke') ?? '')?.formatRgb()).toBe(mark.style.fill);
        expect(Number(host.querySelector('[data-annotation-id="band"] rect')?.getAttribute('width'))).toBeGreaterThan(0);
        plot.updateCollection(withoutFebruary(['Proposal']));
        expect(ring()).toBeNull();
        expect(guide()).not.toBeNull();
        plot.updateCollection(collection);
        expect(ring()).not.toBeNull();
    });

    it('hides a series callout outside the manual Y window without snapping to the edge', () => {
        const { host, plot } = draw({ scales: { y: { domain: [10, 20] } } });
        plot.setAnnotations([
            { id: 'visible', type: 'point', x: months[1], series: 'Baseline' },
            { id: 'clipped', type: 'point', x: months[1], series: 'Proposal' },
        ]);
        expect(host.querySelector('[data-annotation-id="visible"]')).not.toBeNull();
        expect(host.querySelector('[data-annotation-id="clipped"]')).toBeNull();
    });

    it('accepts an empty grouped result but rejects lookups on ungrouped lines and grouped event transforms', () => {
        const { host, plot } = draw({ filter: { attribute: 'keep', op: '==', value: -1 } });
        plot.setAnnotations([{ id: 'future', type: 'point', x: months[1], series: 'Proposal' }]);
        expect(host.querySelectorAll('.autkMark')).toHaveLength(0);
        expect(host.querySelector('[data-annotation-id="future"]')).toBeNull();
        const ungrouped = draw({ attributes: { axis: ['monthly'] } }).plot;
        expect(() => ungrouped.setAnnotations([{ id: 'unsupported', type: 'point', x: months[1], series: 'Proposal' }])).toThrow(/unsupported.*series/i);
        expect(() => draw({ transform: { preset: 'binning-events' } })).toThrow(/series.*reduce-series/i);
    });
});
