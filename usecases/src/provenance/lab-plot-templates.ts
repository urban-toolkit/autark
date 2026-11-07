/**
 * Starting points of Try it Yourself (D3 chart): ordinary D3 drawing code that a developer
 * edits in the page. Each one is the body of a function that receives `d3`
 * and returns `{ draw, drawPart? }`. Lines marked `// Autark` are the only
 * changes from the plain D3 version of the chart.
 */

import type { PlotMargins, PlotTransformConfig } from '@urban-toolkit/autk-plot';

/** One plot lab template: its code and the config it is drawn with. */
export type PlotLabTemplate = {
    title: string;
    columns: string;
    transform: PlotTransformConfig | null;
    event: 'click' | 'brush';
    margins: PlotMargins;
    code: string;
};

const LOLLIPOP = `// Lollipop: the classic D3 example, with the regions grouped by district.
// The lines marked "// Autark" are the only differences from plain D3 code.
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
    // Provenance view with no code: Autark sees that the x of the dot follows the
    // value and slides it along the stick to the value of the selection.
  },
};
`;

const LINE = `// Complaints per day in plain D3: points (the marks) and the line through them.
// No painting code: Autark finds from the geometry that the height of the
// points follows the value, and draws the second line of the selection itself.
return {
  draw({ group, rows, width, height }) {
    const data = rows.slice().sort((a, b) => a.bucket.localeCompare(b.bucket));
    const x = d3.scalePoint(data.map(d => d.bucket), [0, width]);
    const y = d3.scaleLinear([0, d3.max(data, d => d.value)], [height, 0]).nice();

    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x).tickValues(x.domain().filter((_d, i) => i % 7 === 0)));
    group.append('g').call(d3.axisLeft(y).ticks(5));

    group.append('path')
      .attr('class', 'autkSeries')       // Autark: the line through the points
      .attr('fill', 'none')
      .attr('stroke', '#bbb')
      .attr('stroke-width', 2)
      .attr('d', d3.line(d => x(d.bucket), d => y(d.value))(data));

    group.selectAll('circle').data(rows).join('circle')
      .attr('class', 'autkMark')         // Autark
      .attr('cx', d => x(d.bucket))
      .attr('cy', d => y(d.value))
      .attr('r', 3.5);
  },
};
`;

const BOXPLOT = `// Box plot in plain D3: each box goes from the first to the third quartile.
// No painting code: Autark finds that the edges follow q1 and q3, recovers
// the axis scale, and draws each selected region at its own value.
return {
  draw({ group, rows, width, height }) {
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
      .attr('class', 'box autkMark')     // Autark
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
// No painting code: select bars in another chart, and each row fills from
// the left up to the part of the region the selection covers.
return {
  draw({ html, rows, fields }) {          // Autark: the HTML container sits below the SVG
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

const BEESWARM = `// Beeswarm: one dot per region, spread by area without overlapping.
// Each dot is a region (1:1). Select bars in another chart: each dot paints
// the part of its region that the selection covers.
return {
  draw({ group, rows, width, height, value }) { // Autark
    const area = d => +value(d);                 // Autark: reads the first of the "Fields"

    const x = d3.scaleLog(d3.extent(rows, area), [0, width]).nice();
    group.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .call(d3.axisBottom(x).ticks(5, '~s'));

    // The simulation works on copies, so the rows stay untouched. // Autark
    const nodes = rows.map(d => ({ x: x(area(d)), y: height / 2 }));
    d3.forceSimulation(nodes)
      .force('x', d3.forceX((_n, i) => x(area(rows[i]))).strength(1))
      .force('y', d3.forceY(height / 2))
      .force('collide', d3.forceCollide(5))
      .stop()
      .tick(200);

    group.selectAll('circle').data(rows).join('circle')
      .attr('class', 'autkMark')                 // Autark
      .attr('transform', (_d, i) => 'translate(' + nodes[i].x + ',' + nodes[i].y + ')')
      .attr('r', 4.5);
    // Placed with transform, as is common in D3: the brush follows them.
  },
};
`;

const TREEMAP = `// Treemap in plain D3, over the rows of the "hierarchy" preset.
// It is the drawing of the built-in treemap: the equivalence test shows the
// same selection and painted fractions, with no painting code at all.
return {
  draw({ group, rows, width, height }) {
    // Tree from the rows (key, parent, level, value).
    const nodes = new Map(rows.map(r => [r.key, { row: r, children: [] }]));
    const root = { row: null, children: [] };
    rows.forEach(r => (r.parent ? nodes.get(r.parent) : root).children.push(nodes.get(r.key)));
    const depth = d3.max(rows, r => r.level + 1);

    const tree = d3.hierarchy(root, n => (n.children.length ? n.children : undefined))
      .sum(n => (n.children.length === 0 && n.row ? Math.max(0, n.row.value) : 0))
      .sort((a, b) => b.value - a.value);
    d3.treemap()
      .size([width, height])
      .paddingOuter(2)
      .paddingTop(n => (n.depth > 0 && n.depth < depth ? 14 : 2))
      .paddingInner(2)
      .round(true)(tree);

    const groups = tree.descendants().filter(n => n.data.row && n.data.row.level < depth - 1);
    group.selectAll('rect.frame').data(groups).join('rect')
      .attr('class', 'frame autkContext') // Autark: a row drawn only as context
      .attr('x', n => n.x0).attr('y', n => n.y0)
      .attr('width', n => n.x1 - n.x0).attr('height', n => n.y1 - n.y0)
      .attr('fill', '#f6f8fa').attr('stroke', '#d0d7de')
      .property('__data__', n => n.data.row);       // Autark: after the geometry, the datum becomes the row
    group.selectAll('text.frame').data(groups.filter(n => n.x1 - n.x0 > 30)).join('text')
      .attr('class', 'frame')
      .attr('x', n => n.x0 + 4).attr('y', n => n.y0 + 10)
      .style('font', '600 10px sans-serif')
      .text(n => n.data.row.label);

    const leaves = tree.leaves().filter(n => n.data.row);
    const box = new Map(leaves.map(n => [n.data.row, n]));
    group.selectAll('rect.autkMark').data(leaves.map(n => n.data.row)).join('rect') // Autark: binds the rows themselves
      .attr('class', 'autkMark')                                                     // Autark
      .attr('x', r => box.get(r).x0).attr('y', r => box.get(r).y0)
      .attr('width', r => box.get(r).x1 - box.get(r).x0)
      .attr('height', r => box.get(r).y1 - box.get(r).y0);
  },
};
`;

const BROKEN = `// Bars sorted by value, with a common mistake on purpose.
// Click "Check and draw" to see the validator refuse it, then fix it.
return {
  draw({ group, rows, width, height }) {
    // MISTAKE: "{ ...d }" creates new objects. D3 draws them, but the marks do
    // not carry the Autark rows: nothing would link the selection to the regions.
    // Fix: const data = rows.slice().sort((a, b) => b.value - a.value);
    const data = rows.map(d => ({ ...d })).sort((a, b) => b.value - a.value);

    const x = d3.scaleBand(data.map(d => d.label), [0, width]).padding(0.15);
    const y = d3.scaleLinear([0, d3.max(data, d => d.value)], [height, 0]).nice();
    group.append('g').call(d3.axisLeft(y).ticks(5));

    group.selectAll('rect.autkMark').data(data).join('rect')
      .attr('class', 'autkMark')
      .attr('x', d => x(d.label)).attr('width', x.bandwidth())
      .attr('y', d => y(d.value)).attr('height', d => height - y(d.value));
  },
};
`;

export const PLOT_LAB_TEMPLATES: PlotLabTemplate[] = [
    {
        title: 'Lollipop by district (N:1)',
        columns: 'cdta2020, @transform',
        transform: { preset: 'binning-1d' },
        event: 'click',
        margins: { left: 60, right: 20, top: 40, bottom: 30 },
        code: LOLLIPOP,
    },
    {
        title: 'Line of complaints per day (N:N)',
        columns: 'sjoin.collect.noise, @transform',
        transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'monthday' } },
        event: 'click',
        margins: { left: 40, right: 20, top: 40, bottom: 30 },
        code: LINE,
    },
    {
        title: 'Box plot of areas by land use (N:1)',
        columns: 'landuse, shape_area',
        transform: { preset: 'box-stats' },
        event: 'click',
        margins: { left: 50, right: 20, top: 40, bottom: 30 },
        code: BOXPLOT,
    },
    {
        title: 'HTML table of the regions (1:1)',
        columns: 'ntaname, landuse, shape_area',
        transform: null,
        event: 'click',
        margins: { left: 10, right: 10, top: 30, bottom: 10 },
        code: TABLE,
    },
    {
        title: 'Beeswarm of areas (1:1)',
        columns: 'shape_area',
        transform: null,
        event: 'brush',
        margins: { left: 20, right: 20, top: 40, bottom: 30 },
        code: BEESWARM,
    },
    {
        title: 'Treemap in plain D3 (same as the built-in)',
        columns: 'landuse, cdta2020',
        transform: { preset: 'hierarchy' },
        event: 'click',
        margins: { left: 10, right: 10, top: 40, bottom: 10 },
        code: TREEMAP,
    },
    {
        title: 'A common mistake (the validator refuses it)',
        columns: 'landuse, @transform',
        transform: { preset: 'binning-1d' },
        event: 'click',
        margins: { left: 40, right: 20, top: 40, bottom: 20 },
        code: BROKEN,
    },
];
