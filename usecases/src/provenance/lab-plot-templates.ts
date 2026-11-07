/**
 * Starting points of Try it Yourself (D3 chart). Each one is the body of a
 * function of `d3`, `autk` and `core` (`lab-scope.ts`) that returns a plot
 * definition. Two groups:
 * - D3 examples: ordinary D3 charts, where the lines the editor highlights
 *   (`code-editor.ts`) are the only changes from the plain D3 version;
 * - the 24 built-in charts: the very code autk-plot registers
 *   (`lab-builtin-templates.ts`, generated from `src/plots`), with the fields
 *   and data of the same chart on this page. They use the same contract as any
 *   D3 chart: a developer's chart is written like them.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { PlotMargins, PlotTransformConfig, TopKConfig } from '@urban-toolkit/autk-plot';

import { BUILT_IN_TEMPLATES } from './lab-builtin-templates';
import { evaluateChart } from './lab-scope';
import { PLOTS } from './plot';

/** How the lab chart selects. */
export type LabEvent = 'click' | 'brush' | 'brush-x' | 'brush-y';

/** One plot lab template: its code and the config it is drawn with. */
export type PlotLabTemplate = {
    title: string;
    /** Group of the Start from list. */
    group: 'example' | 'built-in';
    /** Title of the chart drawn, when it is not the template title. */
    chartTitle?: string;
    columns: string;
    transform: PlotTransformConfig | null;
    event: LabEvent;
    margins: PlotMargins;
    /** Top-k cut of the chart on the page, kept so the chart draws what its title says. */
    topK?: TopKConfig;
    /** Axis labels of the chart on the page, kept while the fields are the template's. */
    axisLabels?: string[];
    code: string;
};

const LOLLIPOP = `// Lollipop in plain D3: the regions of each district (N:1).
// No painting code: Autark finds that the x of each dot follows the value,
// and slides the dot along its stick to the value of the selection.
return {
  draw({ group, rows, width, height }) { // Autark: receives the rows and the marks group
    const data = rows;                   // Autark: instead of d3.csv(...)

    const y = d3.scaleBand(data.map(d => d.label), [0, height]).padding(1);
    const x = d3.scaleLinear([0, d3.max(data, d => d.value)], [0, width]).nice();

    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x).ticks(5));
    group.append('g').call(d3.axisLeft(y));

    group.selectAll('line.stick').data(data).join('line')
      .attr('class', 'stick')
      .attr('x1', x(0)).attr('x2', d => x(d.value))
      .attr('y1', d => y(d.label)).attr('y2', d => y(d.label))
      .attr('stroke', '#bbb');

    group.selectAll('circle').data(data).join('circle')
      .attr('class', 'autkMark')         // Autark: the dot is the selectable mark
      .attr('cx', d => x(d.value))
      .attr('cy', d => y(d.label))
      .attr('r', 7);
  },
};
`;

const LINE = `// Line in plain D3: the complaints per day (N:N), points and the line through them.
// No painting code: Autark finds that the height of each point follows the
// value, and draws the line of the selection itself.
return {
  draw({ group, rows, width, height }) { // Autark: receives the rows and the marks group
    const data = rows.slice().sort((a, b) => a.bucket.localeCompare(b.bucket));
    const x = d3.scalePoint(data.map(d => d.bucket), [0, width]);
    const y = d3.scaleLinear([0, d3.max(data, d => d.value)], [height, 0]).nice();

    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x).tickValues(x.domain().filter((_d, i) => i % 7 === 0)));
    group.append('g').call(d3.axisLeft(y).ticks(5));

    group.append('path')
      .attr('class', 'autkSeries')       // Autark: the line through the marks
      .attr('fill', 'none')
      .attr('stroke', '#bbb')
      .attr('stroke-width', 2)
      .attr('d', d3.line(d => x(d.bucket), d => y(d.value))(data));

    group.selectAll('circle').data(rows).join('circle')
      .attr('class', 'autkMark')         // Autark: each point is a selectable mark
      .attr('cx', d => x(d.bucket))
      .attr('cy', d => y(d.value))
      .attr('r', 3.5);
  },
};
`;

const BOXPLOT = `// Box plot in plain D3: the areas of the regions of each land use (N:1).
// No painting code: Autark finds that the edges of each box follow q1 and q3,
// and draws each selected region at its own value.
return {
  draw({ group, rows, width, height }) { // Autark: receives the rows and the marks group
    const x = d3.scaleBand(rows.map(d => d.category), [0, width]).padding(0.35);
    const y = d3.scaleLinear([0, d3.max(rows, d => d.whiskerHigh)], [height, 0]).nice();
    const middle = d => x(d.category) + x.bandwidth() / 2;

    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x));
    group.append('g').call(d3.axisLeft(y).ticks(5, '~s'));

    group.selectAll('line.whisker').data(rows).join('line')
      .attr('class', 'whisker')
      .attr('x1', middle).attr('x2', middle)
      .attr('y1', d => y(d.whiskerLow)).attr('y2', d => y(d.whiskerHigh))
      .attr('stroke', '#999');

    group.selectAll('rect.box').data(rows).join('rect')
      .attr('class', 'box autkMark')     // Autark: each box is a selectable mark
      .attr('x', d => x(d.category))
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.q3))
      .attr('height', d => y(d.q1) - y(d.q3));

    group.selectAll('line.median').data(rows).join('line')
      .attr('class', 'median')
      .attr('x1', d => x(d.category)).attr('x2', d => x(d.category) + x.bandwidth())
      .attr('y1', d => y(d.median)).attr('y2', d => y(d.median))
      .attr('stroke', '#333').attr('stroke-width', 2);
  },
};
`;

const TABLE = `// Table in plain D3, as HTML: one row per region (1:1).
// No painting code: each row fills from the left up to the part of its
// region that a selection in another chart covers.
return {
  draw({ html, rows, fields }) {          // Autark: HTML marks go in the html container (with no SVG marks, it takes the place of the SVG)
    const table = html.append('table')
      .style('border-collapse', 'collapse')
      .style('width', '100%')
      .style('font-size', '12px');
    table.append('thead').append('tr')
      .selectAll('th').data(fields).join('th')
      .style('text-align', 'left').style('padding', '2px 6px')
      .text(d => d);
    table.append('tbody')
      .selectAll('tr').data(rows).join('tr')
      .attr('class', 'autkMark')          // Autark: each row is a mark
      .style('cursor', 'pointer')
      .selectAll('td').data(row => fields.map(field => row[field])).join('td')
      .style('padding', '2px 6px')
      .text(v => (typeof v === 'number' ? d3.format('.3~s')(v) : v));
  },
};
`;

const BEESWARM = `// Beeswarm in plain D3: one dot per region (1:1), spread by area without overlapping.
// No painting code: each dot paints the part of its region that a selection
// in another chart covers.
return {
  draw({ group, rows, width, height, value }) { // Autark: receives the rows and the marks group
    const area = d => +value(d);                 // Autark: reads the first of the "Fields"

    const x = d3.scaleLog(d3.extent(rows, area), [0, width]).nice();
    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x).ticks(5, '~s'));

    // Autark: the simulation works on copies, so the rows stay untouched.
    const nodes = rows.map(d => ({ x: x(area(d)), y: height / 2 }));
    d3.forceSimulation(nodes)
      .force('x', d3.forceX((_n, i) => x(area(rows[i]))).strength(1))
      .force('y', d3.forceY(height / 2))
      .force('collide', d3.forceCollide(5))
      .stop()
      .tick(200);

    group.selectAll('circle').data(rows).join('circle')
      .attr('class', 'autkMark')                 // Autark: each dot is a selectable mark
      .attr('transform', (_d, i) => 'translate(' + nodes[i].x + ',' + nodes[i].y + ')')
      .attr('r', 4.5);
    // Placed with transform, as is common in D3: the brush follows them.
  },
};
`;

const BROKEN = `// Bars in plain D3, sorted by value, with a common mistake on purpose.
// Click "Check and draw" to see the contract refuse it, then fix it.
return {
  draw({ group, rows, width, height }) { // Autark: receives the rows and the marks group
    // MISTAKE: "{ ...d }" binds copies to the marks. Autark finds the regions
    // of a mark by the row object it receives, so a copy links to nothing.
    // Fix: const data = rows.slice().sort((a, b) => b.value - a.value);
    const data = rows.map(d => ({ ...d })).sort((a, b) => b.value - a.value);

    const x = d3.scaleBand(data.map(d => d.label), [0, width]).padding(0.15);
    const y = d3.scaleLinear([0, d3.max(data, d => d.value)], [height, 0]).nice();
    group.append('g').call(d3.axisLeft(y).ticks(5));

    group.selectAll('rect.autkMark').data(data).join('rect')
      .attr('class', 'autkMark')         // Autark: each bar is a selectable mark
      .attr('x', d => x(d.label)).attr('width', x.bandwidth())
      .attr('y', d => y(d.value)).attr('height', d => height - y(d.value));
  },
};
`;

/** Ordinary D3 charts adapted to Autark. */
const EXAMPLES: PlotLabTemplate[] = [
    {
        group: 'example',
        title: 'Lollipop by district (N:1)',
        columns: 'cdta2020, @transform',
        transform: { preset: 'binning-1d' },
        event: 'click',
        margins: { left: 60, right: 20, top: 40, bottom: 30 },
        code: LOLLIPOP,
    },
    {
        group: 'example',
        title: 'Line of complaints per day (N:N)',
        columns: 'sjoin.collect.noise, @transform',
        transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'monthday' } },
        event: 'click',
        margins: { left: 40, right: 20, top: 40, bottom: 30 },
        code: LINE,
    },
    {
        group: 'example',
        title: 'Box plot of areas by land use (N:1)',
        columns: 'landuse, shape_area',
        transform: { preset: 'box-stats' },
        event: 'click',
        margins: { left: 50, right: 20, top: 40, bottom: 30 },
        code: BOXPLOT,
    },
    {
        group: 'example',
        title: 'HTML table of the regions (1:1)',
        columns: 'ntaname, landuse, shape_area',
        transform: null,
        event: 'click',
        margins: { left: 10, right: 10, top: 30, bottom: 10 },
        code: TABLE,
    },
    {
        group: 'example',
        title: 'Beeswarm of areas (1:1)',
        columns: 'shape_area',
        transform: null,
        event: 'brush',
        margins: { left: 20, right: 20, top: 40, bottom: 30 },
        code: BEESWARM,
    },
    {
        group: 'example',
        title: 'A common mistake (the contract refuses it)',
        columns: 'landuse, @transform',
        transform: { preset: 'binning-1d' },
        event: 'click',
        margins: { left: 40, right: 20, top: 40, bottom: 20 },
        code: BROKEN,
    },
];

/** Event of the lab chart for the event of a chart on the page. */
const LAB_EVENTS: Partial<Record<next.PlotEvent, LabEvent>> = {
    [next.PlotEvent.CLICK]: 'click',
    [next.PlotEvent.BRUSH]: 'brush',
    [next.PlotEvent.BRUSH_X]: 'brush-x',
    [next.PlotEvent.BRUSH_Y]: 'brush-y',
};

/** The definition a built-in template returns. */
const definitionOf = (code: string) => evaluateChart(code) as { name: string; label?: string };

/** The 24 built-in charts, in the order of the page, each with the fields and data of its chart there. */
const BUILT_INS: PlotLabTemplate[] = PLOTS.map(plot => {
    const template = BUILT_IN_TEMPLATES.find(t => definitionOf(t.code).name === plot.config.type);
    if (!template) throw new Error(`No built-in template for ${plot.config.type}.`);
    const label = definitionOf(template.code).label ?? plot.config.type;
    const title = plot.config.labels?.title;
    return {
        group: 'built-in',
        title: title ? `${label}: ${title}` : label,
        chartTitle: title ?? label,
        columns: (plot.config.attributes?.axis ?? []).join(', '),
        transform: plot.config.transform ?? null,
        event: LAB_EVENTS[plot.event] ?? 'click',
        margins: plot.config.margins ?? { left: 50, right: 20, top: 40, bottom: 40 },
        ...(plot.config.topK ? { topK: plot.config.topK } : {}),
        ...(plot.config.labels?.axis ? { axisLabels: plot.config.labels.axis } : {}),
        code: template.code,
    };
});

/** Every template: the D3 examples first (the page starts from the first one), then the built-in charts. */
export const PLOT_LAB_TEMPLATES: PlotLabTemplate[] = [...EXAMPLES, ...BUILT_INS];
