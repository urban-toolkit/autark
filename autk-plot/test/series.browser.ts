import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import { AutkPlot, PlotEvent, registerPlot, unregisterPlot } from '../src';
import type { PlotEventData, UnifiedPlotConfig } from '../src';
import { effectiveBox } from './svg-geometry';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { category: 'North', group: '2025', x: 2, y: 4 },
        { category: 'North', group: '2026', x: 6, y: 8 },
        { category: 'South', group: '2026', x: 8, y: 6 },
    ].map(properties => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties })),
};

function draw(config: Omit<UnifiedPlotConfig, 'collection'>, data = collection) {
    const host = document.body.appendChild(document.createElement('div'));
    const plot = new AutkPlot(host, { collection: data, ...config });
    return { host, plot };
}

afterEach(() => {
    unregisterPlot('group-test');
    document.body.replaceChildren();
});

describe('Plot series', () => {
    it('keeps registered rows and source indexes through brushes, hover, and filtering', () => {
        registerPlot({
            name: 'group-test', series: true, highlight: 'boolean', baseColor: () => () => 'black',
            draw({ group, rows, seriesGroups, value, color, width, height }) {
                const x = d3.scaleLinear([0, 10], [0, width]);
                const y = d3.scaleLinear([0, 10], [height, 0]);
                for (const series of seriesGroups ?? []) {
                    expect(series.rows.every(row => rows.includes(row))).toBe(true);
                    group.append('g').attr('data-group', series.key).selectAll('circle').data(series.rows).join('circle')
                        .attr('class', 'autkMark').attr('r', 5).attr('fill', color)
                        .attr('cx', row => x(Number(value(row, 0)))).attr('cy', row => y(Number(value(row, 1))));
                }
            },
        });
        const config = { type: 'registered', plot: 'group-test', attributes: { axis: ['x', 'y'], series: 'group' },
            events: [PlotEvent.CLICK, PlotEvent.BRUSH] } as const;
        const mutable = { ...config, attributes: { ...config.attributes, axis: [...config.attributes.axis] }, events: [...config.events] };
        const all = draw(mutable);
        const { host, plot } = draw({ ...mutable, filter: { attribute: 'group', op: '==', value: '2026' } });
        const markOf = (div: HTMLElement, key: string) => div.querySelector<SVGCircleElement>(`[data-group="${key}"] circle`)!;
        const mark = markOf(host, '2026');
        const fill = mark.style.fill;
        expect(fill).toBe(markOf(all.host, '2026').style.fill);
        expect(fill).not.toBe(markOf(all.host, '2025').style.fill);
        expect(host.querySelector('.autk-legend')?.textContent).toBe('2026');
        plot.setHover([1]);
        expect(mark.style.fill).not.toBe(fill);
        plot.setHover([]);
        expect(mark.style.fill).toBe(fill);
        const behavior = (plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> })._brushBehaviors.get('0')!;
        const brush = d3.select(host.querySelector<SVGGElement>('.autkBrush')!);
        const { value: x } = mark.cx.baseVal;
        const { value: y } = mark.cy.baseVal;
        brush.call(behavior.move, [[x - 6, y - 6], [x + 6, y + 6]]);
        expect(plot.selection).toEqual([1]);
        plot.setSelection([1], { 1: { series: [{ id: '2025' }] } });
        expect(mark.classList.contains('autkSeriesSelected')).toBe(false);
        plot.setSelection([1], { 1: { series: [{ id: '2026', selectedUnits: 1, totalUnits: 4 }] } });
        expect(mark.classList.contains('autkSeriesSelected')).toBe(true);
        expect(host.querySelector('.autkPartial')).toBeNull();
    });

    it('reserves grouped bar slots across filters and keeps palette order separate from geometry', () => {
        const config = { type: 'barchart', attributes: { axis: ['category', 'y'], series: 'group' }, events: [PlotEvent.CLICK],
            style: { colorMap: { type: 'categorical', colors: ['#ff0000', '#0000ff'],
                domainSpec: { type: ColorMapDomainStrategy.USER, params: ['2026', '2025'] } } } } satisfies Omit<UnifiedPlotConfig, 'collection'>;
        const { host, plot } = draw(config);
        const bars = Array.from(host.querySelectorAll<SVGRectElement>('rect.autkMark'));
        expect(bars).toHaveLength(3);
        const [first, second] = bars;
        expect(first.x.baseVal.value + first.width.baseVal.value).toBeLessThanOrEqual(second.x.baseVal.value + 0.01);
        expect(second.style.fill).toBe('rgb(255, 0, 0)');
        let clicked: PlotEventData | undefined;
        plot.events.on(PlotEvent.CLICK, event => { clicked = event; });
        second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(clicked).toEqual({ selection: [1], shares: { 1: { series: [{ id: '2026' }] } } });
        const filtered = draw({ ...config, filter: { attribute: 'group', op: '==', value: '2026' } }).host;
        expect(filtered.querySelector('rect.autkMark')?.getAttribute('x')).toBe(second.getAttribute('x'));
        const windowed = draw({ ...config, scales: { x: { domain: ['South'] } } }).host;
        expect(Array.from(windowed.querySelectorAll('.autk-legend text'), text => text.textContent)).toEqual(['2026']);
    });

    it.each(['scatterplot', 'bubble', 'barchart'] as const)('uses matching series coverage and boolean membership in %s', type => {
        const axis = type === 'barchart' ? ['category', 'y'] : type === 'bubble' ? ['x', 'y', 'y'] : ['x', 'y'];
        const { host, plot } = draw({ type, attributes: { axis, series: 'group' } });
        const mark = (id: number) => host.querySelector<SVGGraphicsElement>(`.autkMark[data-autk-provenance="mark:feature:${id}"]`)!;
        const fill = mark(0).style.fill;
        plot.setSelection([0, 1, 2], {
            0: { feature: { selectedUnits: 3, totalUnits: 3 }, series: [
                { id: '2025', selectedUnits: 1, totalUnits: 4 }, { id: '2026', selectedUnits: 2, totalUnits: 2 },
            ] },
            1: { feature: { selectedUnits: 1, totalUnits: 5 }, series: [{ id: '2026' }] },
            2: { feature: { selectedUnits: 1, totalUnits: 4 }, series: [{ id: '2025' }] },
        });
        const partials = host.querySelectorAll<SVGGraphicsElement>('.autkPartial');
        expect(partials).toHaveLength(1);
        expect(partials[0].getAttribute('data-autk-provenance')).toBe('mark:feature:0');
        expect(partials[0].getAttribute('data-autk-units')).toBe('1/4');
        expect(partials[0].style.fill).toBe(fill);
        expect(effectiveBox(partials[0])!.height / effectiveBox(mark(0))!.height).toBeCloseTo(type === 'barchart' ? 0.25 : 0.5);
        expect(mark(1).classList.contains('autkSeriesSelected')).toBe(true);
        expect(mark(2).classList.contains('autkSeriesSelected')).toBe(false);

        plot.setSelection([2], { 0: { feature: { selectedUnits: 1, totalUnits: 2 } } });
        expect(host.querySelector('.autkPartial')).toBeNull();
        expect(mark(2).classList.contains('autkSeriesSelected')).toBe(true);
        plot.setSelection([]);
        expect(host.querySelector('.autkSeriesSelected, .autkPartial')).toBeNull();
    });

    it('gives custom partial renderers only matching parts and the row colors', () => {
        let parts: string[][] = [];
        registerPlot({
            name: 'group-test', series: true,
            draw({ group, rows }) {
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                    .attr('r', 5).attr('cx', (_, i) => 20 + i * 12).attr('cy', 20);
            },
            highlight({ parts: selected, colorOf, drawAuto }) {
                parts = selected.map(part => [part.mark, d3.color(colorOf(part.datum))!.formatRgb()]);
                drawAuto();
            },
        });
        const { plot, host } = draw({ type: 'registered', plot: 'group-test', attributes: { axis: ['x'], series: 'group' } });
        const color = host.querySelector<SVGCircleElement>('.autkMark')!.style.fill;
        plot.setSelection([0, 1], {
            0: { series: [{ id: '2025', selectedUnits: 1, totalUnits: 2 }] },
            1: { series: [{ id: '2025', selectedUnits: 1, totalUnits: 2 }] },
        });
        expect(parts).toEqual([['mark:feature:0', color]]);
        expect(host.querySelectorAll('.autkPartial')).toHaveLength(1);
    });

    it('rejects unsupported configurations, repeated bar pairs, and invalid values', () => {
        const config = { type: 'barchart', attributes: { axis: ['category', 'y'], series: 'group' } } satisfies Omit<UnifiedPlotConfig, 'collection'>;
        expect(() => draw({ ...config, attributes: { ...config.attributes, color: 'y' } })).toThrow(/series.*color/i);
        expect(() => draw({ ...config, transform: { preset: 'binning-1d' } })).toThrow(/series.*transform/i);
        expect(() => draw({ ...config, scales: { x: { domain: ['South'] } } }, { ...collection,
            features: [...collection.features, collection.features[0]] })).toThrow(/duplicate.*North.*2025/i);
        expect(() => draw(config, { ...collection, features: [{ ...collection.features[0], properties: { category: 'North', group: '2025', y: -1 } }] }))
            .toThrow(/North.*2025.*nonnegative/i);
        expect(() => draw(config, { ...collection, features: [{ ...collection.features[0], properties: { category: 'North', y: 1 } }] }))
            .toThrow(/group.*feature 0/i);
    });
});
