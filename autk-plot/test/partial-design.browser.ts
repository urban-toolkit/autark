/**
 * The design space of the segregated view, inferred from plain D3 drawings.
 *
 * Each drawing below encodes the row value in a different channel and has no
 * painting code. The inference must find the channel from the marks alone, and
 * the part must follow it: a bar grows from its base, a sector keeps the area
 * of its share, a point slides to the value of the selection, and so on.
 */

import * as d3 from 'd3';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PartialDesign, PlotDefinition, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';
import { installSvgBBox } from './svg-geometry';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const BY_DISTRICT = { attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' as const } };
const WIDTH = 400;
const HEIGHT = 200;

const registered: string[] = [];
afterEach(() => {
    registered.splice(0).forEach(name => next.unregisterPlot(name));
    document.body.innerHTML = '';
});
beforeAll(() => installSvgBBox());

/** Registers a drawing and mounts it, with a selection of every other feature. */
function mount(draw: PlotDefinition['draw'], config: Omit<UnifiedPlotConfig, 'type' | 'collection'> = BY_DISTRICT, extra: Partial<PlotDefinition> = {}, collection = regions()) {
    const name = `design-${registered.length}`;
    next.registerPlot({ name, draw, ...extra });
    registered.push(name);
    const div = document.createElement('div');
    document.body.append(div);
    const plot = new next.AutkPlot(div, {
        type: 'registered', plot: name, collection, width: WIDTH + 80, height: HEIGHT + 80,
        margins: { left: 40, right: 40, top: 40, bottom: 40 }, ...config,
    } as UnifiedPlotConfig);
    const instance = plot.instance as unknown as { partialDesigns: PartialDesign[]; segregatedParts(): next.SegregatedPart[] };
    const select = (features: number[], shares?: next.FeatureShare[]) => plot.setSelection(features, shares);
    const half = collection.features.map((_f, i) => i).filter(i => i % 2 === 0);
    const marks = () => Array.from(div.querySelectorAll<SVGGraphicsElement>('.autkMark'));
    const partOf = (mark: Element) => Array.from(div.querySelectorAll<SVGGraphicsElement>('.autkPartial'))
        .find(p => p.getAttribute('data-autk-provenance') === mark.getAttribute('data-autk-provenance'));
    const ratio = (mark: Element) => {
        const part = instance.segregatedParts().find(p => p.mark === mark.getAttribute('data-autk-provenance'))!;
        return part.part.additive || part.part.value === null ? part.fraction : part.part.value / part.part.totalValue!;
    };
    return { div, plot, designs: () => instance.partialDesigns, select, half, marks, partOf, ratio };
}

/** Point through an element's own transform (translate and scale). */
function through(element: Element, x: number, y: number): [number, number] {
    const [a, , , d, e, f] = next.ownMatrix(element);
    return [a * x + e, d * y + f];
}

/** Rect of a `<rect>` after its own transform. */
function rectOf(element: Element): { x: number; y: number; w: number; h: number } {
    const n = (name: string) => Number(element.getAttribute(name));
    const [x0, y0] = through(element, n('x'), n('y'));
    const [x1, y1] = through(element, n('x') + n('width'), n('y') + n('height'));
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** Center of a `<circle>` after its own transform. */
const centerOf = (element: Element) => through(element, Number(element.getAttribute('cx')), Number(element.getAttribute('cy')));

/** Vertical bars from the bottom: value in the height. */
function verticalBars(rows: AutkDatum[], group: d3.Selection<SVGGElement, unknown, null, undefined>) {
    const x = d3.scaleBand(rows.map(r => String(r.label)), [0, WIDTH]).padding(0.1);
    const y = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [HEIGHT, 0]);
    group.selectAll('rect.bar').data(rows).join('rect').attr('class', 'bar autkMark')
        .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
        .attr('y', r => y(Number(r.value))).attr('height', r => HEIGHT - y(Number(r.value)));
}

describe('the channel is inferred from the marks', () => {
    test('length: vertical bars grow from the bottom, and the part keeps the base', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => verticalBars(rows, group));
        expect(designs()).toMatchObject([{ kind: 'rect', rule: 'length', axis: 'y', anchor: 'end' }]);
        expect(designs()[0].fit).toBeCloseTo(1, 9);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const m = rectOf(mark);
            const p = rectOf(copy);
            expect(p.h).toBeCloseTo(m.h * ratio(mark), 9);
            expect(p.y + p.h).toBeCloseTo(m.y + m.h, 9);
            expect(p.w).toBeCloseTo(m.w, 9);
        }
    });

    test('length: horizontal bars grow from the left; centered strips grow from the center', () => {
        const left = mount(({ group, rows }) => {
            const y = d3.scaleBand(rows.map(r => String(r.label)), [0, HEIGHT]);
            const x = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, WIDTH]);
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', 0).attr('width', r => x(Number(r.value))).attr('y', r => y(String(r.label))!).attr('height', y.bandwidth());
        });
        expect(left.designs()).toMatchObject([{ rule: 'length', axis: 'x', anchor: 'start' }]);

        const centered = mount(({ group, rows }) => {
            const y = d3.scaleBand(rows.map(r => String(r.label)), [0, HEIGHT]);
            const half = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, WIDTH / 2]);
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', r => WIDTH / 2 - half(Number(r.value))).attr('width', r => 2 * half(Number(r.value)))
                .attr('y', r => y(String(r.label))!).attr('height', y.bandwidth());
        });
        expect(centered.designs()).toMatchObject([{ rule: 'length', axis: 'x', anchor: 'center' }]);
        centered.select(centered.half);
        for (const mark of centered.marks()) {
            const copy = centered.partOf(mark);
            if (!copy) continue;
            const m = rectOf(mark);
            const p = rectOf(copy);
            expect(p.x + p.w / 2).toBeCloseTo(m.x + m.w / 2, 9);
            expect(p.w).toBeCloseTo(m.w * centered.ratio(mark), 9);
        }
    });

    test('angle: pie and donut sectors keep the area of the part, as the built-in pie does', () => {
        for (const inner of [0, 50]) {
            const { designs, select, half, marks, div, ratio } = mount(({ group, rows }) => {
                const arcs = d3.pie<AutkDatum>().value(r => Number(r.value)).sort(null)(rows);
                const arc = d3.arc<d3.PieArcDatum<AutkDatum>>().innerRadius(inner).outerRadius(100);
                const g = group.append('g').attr('transform', `translate(${WIDTH / 2}, ${HEIGHT / 2})`);
                g.selectAll('path').data(arcs).join('path').attr('d', arc).attr('class', 'autkMark').each(function (a) {
                    d3.select(this).datum(a.data);
                });
            });
            expect(designs()).toMatchObject([{ kind: 'sector', rule: 'angle' }]);
            select(half);
            for (const mark of marks()) {
                const copy = Array.from(div.querySelectorAll('.autkPartial')).find(p => p.getAttribute('data-autk-provenance') === mark.getAttribute('data-autk-provenance'));
                if (!copy) continue;
                const radius = Number(div.querySelector(`${copy.getAttribute('clip-path')!.slice(4, -1)} circle`)!.getAttribute('r'));
                expect((radius ** 2 - inner ** 2) / (100 ** 2 - inner ** 2)).toBeCloseTo(ratio(mark), 9);
            }
        }
    });

    test('width: links whose stroke width follows the value get a thinner stroke', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => {
            const w = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, 20]);
            group.selectAll('line').data(rows).join('line').attr('class', 'autkMark')
                .attr('x1', 0).attr('x2', WIDTH).attr('y1', (_r, i) => i * 15).attr('y2', (_r, i) => i * 15)
                .attr('stroke-width', r => w(Number(r.value)));
        }, BY_DISTRICT, { color: 'stroke' });
        expect(designs()).toMatchObject([{ kind: 'stroke', rule: 'width' }]);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (copy) expect(Number(copy.style.strokeWidth)).toBeCloseTo(Number(mark.getAttribute('stroke-width')) * ratio(mark), 9);
        }
    });

    test('trace: polylines of the same width are traced to the share (one per region)', () => {
        const { designs, select, half, marks, partOf } = mount(({ group, rows, value }) => {
            const y = d3.scaleLinear(d3.extent(rows, r => Number(value(r))) as [number, number], [HEIGHT, 0]);
            group.selectAll('polyline').data(rows).join('polyline').attr('class', 'autkMark')
                .attr('fill', 'none').attr('points', r => `0,${y(Number(value(r)))} ${WIDTH},${HEIGHT - y(Number(value(r)))}`);
        }, { attributes: { axis: ['shape_area'] } }, { color: 'stroke' });
        expect(designs()).toMatchObject([{ kind: 'stroke', rule: 'trace' }]);
        select(half, regions().features.map((_f, feature) => ({ feature, selectedUnits: 1, totalUnits: 4 })));
        const copy = partOf(marks()[0])!;
        expect(copy.getAttribute('pathLength')).toBe('1');
        // Browsers serialize the list with commas.
        expect(copy.style.strokeDasharray.replace(/,\s*/g, ' ')).toBe('0.25 1');
    });

    test('position: points of a series slide to the value of the selection, and the line follows them', () => {
        const events = withSyntheticEvents(regions());
        const { designs, select, half, marks, partOf, ratio, div } = mount(({ group, rows }) => {
            const x = d3.scalePoint(rows.map(r => String(r.bucket)), [0, WIDTH]);
            const y = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [HEIGHT, 0]);
            group.append('path').attr('class', 'autkSeries').attr('fill', 'none')
                .attr('d', d3.line<AutkDatum>(r => x(String(r.bucket))!, r => y(Number(r.value)))(rows));
            group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                .attr('cx', r => x(String(r.bucket))!).attr('cy', r => y(Number(r.value))).attr('r', 4);
        }, { attributes: { axis: ['sjoin.collect.noise', '@transform'] }, transform: { preset: 'binning-events', options: { timestamp: 'date' } } }, {}, events);
        expect(designs()).toMatchObject([{ kind: 'point', rule: 'position', axis: 'y' }]);
        expect(designs()[0].baseline).toBeCloseTo(HEIGHT, 6);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const [, cy] = centerOf(mark);
            expect(centerOf(copy)[1]).toBeCloseTo(HEIGHT - ratio(mark) * (HEIGHT - cy), 6);
        }
        const line = div.querySelector('.autkPartialSeries')!;
        expect(line.getAttribute('d')!.match(/[ML]/g)).toHaveLength(marks().length);
    });

    test('position: a lollipop point slides along its stick; radial points slide to the center', () => {
        const lollipop = mount(({ group, rows }) => {
            const y = d3.scaleBand(rows.map(r => String(r.label)), [0, HEIGHT]);
            const x = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, WIDTH]);
            group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                .attr('cx', r => x(Number(r.value))).attr('cy', r => y(String(r.label))!).attr('r', 5);
        });
        expect(lollipop.designs()).toMatchObject([{ rule: 'position', axis: 'x' }]);
        expect(lollipop.designs()[0].baseline).toBeCloseTo(0, 6);

        const radial = mount(({ group, rows }) => {
            const r = d3.scaleLinear([0, d3.max(rows, row => Number(row.value))!], [0, 90]);
            const g = group.append('g').attr('transform', 'translate(200, 100)');
            g.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark').attr('r', 3)
                .attr('cx', (row, i) => Math.sin((2 * Math.PI * i) / rows.length) * r(Number(row.value)))
                .attr('cy', (row, i) => -Math.cos((2 * Math.PI * i) / rows.length) * r(Number(row.value)));
        });
        expect(radial.designs()).toMatchObject([{ rule: 'position', axis: 'radial' }]);
        radial.select(radial.half);
        for (const mark of radial.marks()) {
            const copy = radial.partOf(mark);
            if (!copy) continue;
            const [x, y] = centerOf(mark);
            const [px, py] = centerOf(copy);
            expect(Math.hypot(px, py)).toBeCloseTo(Math.hypot(x, y) * radial.ratio(mark), 5);
        }
    });

    test('glyph: when the value is in the color, the part is a copy with the area of the fraction', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => {
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', (_r, i) => (i % 5) * 60).attr('y', (_r, i) => Math.floor(i / 5) * 60).attr('width', 50).attr('height', 50);
        });
        expect(designs()).toMatchObject([{ kind: 'rect', rule: 'glyph' }]);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const p = rectOf(copy);
            expect(p.w * p.h).toBeCloseTo(2500 * ratio(mark), 6);
            expect(p.x + p.w / 2).toBeCloseTo(rectOf(mark).x + 25, 9);
        }
    });

    test('units: with one mark per feature, the part is the selected units, whole', () => {
        const { designs, select, div } = mount(({ group, rows }) => {
            rows.forEach((row, i) => (row.autkIds ?? []).forEach((feature, k) => {
                group.append('rect').datum(row).attr('class', 'autkMark').attr('data-autk-feature', feature)
                    .attr('x', k * 12).attr('y', i * 12).attr('width', 10).attr('height', 10);
            }));
        });
        expect(designs()).toMatchObject([{ rule: 'units' }]);
        const picked = [0, 1, 2, 5, 8];
        select(picked);
        const painted = Array.from(div.querySelectorAll('.autkPartial')).map(p => Number(p.getAttribute('data-autk-feature'))).sort((a, b) => a - b);
        expect(painted).toEqual(picked);
    });

    test('one-to-one points never use position: a share is not a value', () => {
        const { designs } = mount(({ group, rows, value }) => {
            const y = d3.scaleLinear(d3.extent(rows, r => Number(value(r, 1))) as [number, number], [HEIGHT, 0]);
            group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                .attr('cx', (_r, i) => i * 10).attr('cy', r => y(Number(value(r, 1)))).attr('r', 4);
        }, { attributes: { axis: ['shape_area', 'shape_leng'] } });
        expect(designs()).toMatchObject([{ kind: 'point', rule: 'glyph' }]);
    });

    test('averages: a bar shows the average of the subset, which may exceed the bar', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => verticalBars(rows, group),
            { attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_area' } } });
        expect(designs()[0].rule).toBe('length');
        select(half);
        const ratios = marks().filter(m => partOf(m)).map(m => ratio(m));
        expect(ratios.some(r => r > 1)).toBe(true);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (copy) expect(rectOf(copy).h).toBeCloseTo(rectOf(mark).h * ratio(mark), 6);
        }
    });

    test('band: a flow whose thickness follows the value narrows from its upper edge', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => {
            const w = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, 25]);
            group.selectAll('path').data(rows).join('path').attr('class', 'autkMark').attr('d', (r, i) => {
                const [sy, ty, t] = [i * 14, 200 - i * 14, w(Number(r.value))];
                return `M0,${sy}C200,${sy} 200,${ty} 400,${ty}L400,${ty + t}C200,${ty + t} 200,${sy + t} 0,${sy + t}Z`;
            });
        });
        expect(designs()).toMatchObject([{ kind: 'shape', rule: 'band', mode: 'flow' }]);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const m = next.parseFlow(mark.getAttribute('d'))!;
            const p = next.parseFlow(copy.getAttribute('d'))!;
            expect(p.edge).toEqual(m.edge);
            expect(p.offset[1]).toBeCloseTo(m.offset[1] * ratio(mark), 9);
        }
    });

    test('band: a chord ribbon keeps the leading share of both of its arcs', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => {
            const total = d3.sum(rows, r => Number(r.value));
            let angle = 0;
            const g = group.append('g').attr('transform', 'translate(200, 100)');
            const ribbon = d3.ribbon<unknown, { startAngle: number; endAngle: number; radius: number }>();
            for (const row of rows) {
                const sweep = (Math.PI * Number(row.value)) / total;
                const source = { startAngle: angle, endAngle: angle + sweep, radius: 90 };
                const target = { startAngle: angle + Math.PI, endAngle: angle + Math.PI + sweep, radius: 90 };
                g.append('path').datum(row).attr('class', 'autkMark').attr('d', ribbon({ source, target }) as unknown as string);
                angle += sweep;
            }
        });
        expect(designs()).toMatchObject([{ kind: 'shape', rule: 'band', mode: 'ribbon' }]);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const m = next.parseRibbon(mark.getAttribute('d'))!;
            const p = next.parseRibbon(copy.getAttribute('d'))!;
            expect(p.source[0]).toBeCloseTo(m.source[0], 9);
            expect(p.source[1]).toBeCloseTo(m.source[1] * ratio(mark), 9);
            expect(p.target[1]).toBeCloseTo(m.target[1] * ratio(mark), 9);
        }
    });

    test('angle: on a thin ring, the part is the leading share of the sweep', () => {
        const { designs, select, half, marks, partOf, ratio } = mount(({ group, rows }) => {
            const arcs = d3.pie<AutkDatum>().value(r => Number(r.value)).sort(null)(rows);
            const arc = d3.arc<d3.PieArcDatum<AutkDatum>>().innerRadius(90).outerRadius(100);
            const g = group.append('g').attr('transform', `translate(${WIDTH / 2}, ${HEIGHT / 2})`);
            g.selectAll('path').data(arcs).join('path').attr('d', arc).attr('class', 'autkMark').each(function (a) {
                d3.select(this).datum(a.data);
            });
        });
        expect(designs()).toMatchObject([{ kind: 'sector', rule: 'angle', mode: 'sweep' }]);
        select(half);
        for (const mark of marks()) {
            const copy = partOf(mark);
            if (!copy) continue;
            const m = next.parseSector(mark.getAttribute('d'))!;
            const p = next.parseSector(copy.getAttribute('d'))!;
            expect(p.start).toBeCloseTo(m.start, 9);
            expect([p.inner, p.outer]).toEqual([m.inner, m.outer]);
            expect(p.sweep).toBeCloseTo(m.sweep * ratio(mark), 9);
        }
    });

    test('members: a box spans two fields, which gives the scale, and each selected region is drawn at its value', () => {
        const y = d3.scaleLinear([0, 4e7], [HEIGHT, 0]);
        const { designs, select, div } = mount(({ group, rows }) => {
            const x = d3.scaleBand(rows.map(r => String(r.category)), [0, WIDTH]).padding(0.3);
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', r => x(String(r.category))!).attr('width', x.bandwidth())
                .attr('y', r => y(Number(r.q3))).attr('height', r => y(Number(r.q1)) - y(Number(r.q3)));
        }, { attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'box-stats' } });
        expect(designs()).toMatchObject([{ kind: 'rect', rule: 'members', axis: 'y', scale: { fields: ['q1', 'q3'] } }]);
        const picked = [0, 3, 7, 11, 20];
        select(picked);
        const dots = Array.from(div.querySelectorAll('circle.autkPartial'));
        expect(dots.map(d => Number(d.getAttribute('data-autk-feature'))).sort((a, b) => a - b)).toEqual(picked);
        for (const dot of dots) {
            const area = regions().features[Number(dot.getAttribute('data-autk-feature'))].properties!.shape_area as number;
            expect(Number(dot.getAttribute('cy'))).toBeCloseTo(y(area), 5);
        }
    });

    test('HTML: table rows (one per region) fill from the left to the share they receive', () => {
        const { designs, select, half, marks, plot } = mount(({ html, rows }) => {
            html.append('table').append('tbody').selectAll('tr').data(rows).join('tr').attr('class', 'autkMark')
                .selectAll('td').data(r => [r.ntaname]).join('td').text(String);
        }, { attributes: { axis: ['ntaname', 'shape_area'] }, events: [next.PlotEvent.CLICK] });
        expect(designs()).toMatchObject([{ kind: 'html', rule: 'glyph' }]);
        select(half, half.map(feature => ({ feature, selectedUnits: 1, totalUnits: 4 })));
        const first = marks()[0] as unknown as HTMLElement;
        // Browsers serialize 25.00% as 25%.
        expect(first.style.backgroundImage).toMatch(/linear-gradient\(to right, .+ 25(\.0+)?%, transparent 25(\.0+)?%\)/);
        expect(marks()[1].getAttribute('data-autk-filled')).toBeNull();
        // Rows are selected by click, like any mark.
        let selection: number[] = [];
        plot.events.on(next.PlotEvent.CLICK, data => { selection = data.selection; });
        select([]);
        marks()[2].dispatchEvent(new MouseEvent('click'));
        expect(selection).toEqual([2]);
    });

    test('HTML: div bars whose width follows the value fill from the left by the part', () => {
        // jsdom has no layout: boxes come from the inline sizes, as a browser would lay them out.
        const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value(this: HTMLElement) {
                const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
                return new DOMRect(0, index * 12, parseFloat(this.style.width) || 0, parseFloat(this.style.height) || 0);
            },
        });
        try {
            const { designs, select, half, marks, ratio } = mount(({ html, rows }) => {
                const w = d3.scaleLinear([0, d3.max(rows, r => Number(r.value))!], [0, WIDTH]);
                html.selectAll('div').data(rows).join('div').attr('class', 'autkMark')
                    .style('width', r => `${w(Number(r.value))}px`).style('height', '10px');
            });
            expect(designs()).toMatchObject([{ kind: 'html', rule: 'length', axis: 'x', anchor: 'start' }]);
            select(half);
            for (const mark of marks()) {
                const fill = (mark as unknown as HTMLElement).style.backgroundImage;
                if (!fill) continue;
                const stops = Array.from(fill.matchAll(/([\d.]+)%/g), match => Number(match[1]));
                expect(stops[0]).toBeCloseTo(ratio(mark) * 100, 2);
                expect(fill).toMatch(/^linear-gradient\(to right/);
            }
        } finally {
            if (original) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', original);
        }
    });

    test('an explicit data-autk-part overrides the inferred rule', () => {
        const { designs, select, half, marks, partOf } = mount(({ group, rows }) => {
            verticalBars(rows, group);
            group.selectAll('rect.bar').attr('data-autk-part', 'shrink');
        });
        expect(designs()[0].rule).toBe('length');
        select(half);
        const copy = marks().map(partOf).find(Boolean)!;
        expect(copy.getAttribute('transform')).toMatch(/scale\([\d.]+\)/);
    });
});
