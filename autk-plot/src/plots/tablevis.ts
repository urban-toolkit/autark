/**
 * @fileoverview Table of the attributes of each feature.
 *
 * Reads the rows of a `sort` transform, one HTML row per feature (colored by background) and one
 * column per attribute. Clicking a header sorts by that column, and clicking it again reverses the
 * order. A selection from an aggregating view fills each row up to the share of its feature.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'table',
 *   collection: geojson,
 *   attributes: { axis: ['name', 'population', 'area'] },
 *   labels: { axis: ['Name', 'Population', 'Area'], title: 'City Table' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Rows of a `sort` transform, one per feature. */
export const tablevis: PlotDefinition = {
    name: 'table',
    label: 'Table',
    transforms: ['sort'],
    topK: false,
    // Sorted by the first column unless configured.
    defaults: config => ({ transform: { preset: 'sort', options: { column: config.attributes?.axis?.[0] ?? '', direction: 'asc' } } }),

    draw({ html, rows, fields, value, axisLabels, options, setOptions }) {
        const sorted = (options.column as string | undefined) ?? fields[0];
        const direction = options.direction === 'desc' ? 'desc' : 'asc';

        const table = html.append('div')
            .attr('class', 'autk-table-container')
            .style('width', '100%')
            // The rows scroll under the header, in the height the plot leaves them.
            .style('flex', '1 1 auto')
            .style('min-height', '0')
            .style('overflow', 'auto')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .append('table')
            .attr('class', 'autk-table')
            .style('width', '100%')
            .style('border-collapse', 'collapse')
            .style('font-family', 'sans-serif')
            .style('font-size', '12px')
            .style('text-align', 'left');

        // A click on a header sorts by its column; on the sorted column, it reverses the order.
        table.append('thead').append('tr')
            .selectAll('th')
            .data(fields)
            .join('th')
            .style('padding', '8px')
            .style('border-bottom', '2px solid #bbb')
            .style('background-color', '#f8f8f8')
            .style('position', 'sticky')
            .style('top', '0')
            .style('text-align', 'center')
            .style('cursor', 'pointer')
            .style('user-select', 'none')
            .style('color', field => (field === sorted ? '#cc3300' : '#000'))
            .style('text-decoration', field => (field === sorted ? 'underline' : 'none'))
            .text((field, index) => axisLabels[index] ?? field)
            .on('click', (_event, field) => setOptions({ column: field, direction: field === sorted && direction === 'asc' ? 'desc' : 'asc' }));

        const number = d3.format('');
        table.append('tbody')
            .selectAll('tr')
            .data(rows)
            .join('tr')
            .attr('class', 'autkMark')
            .style('border-bottom', '1px solid #eee')
            .style('cursor', 'pointer')
            .selectAll('td')
            .data(row => fields.map((_field, index) => value(row, index)))
            .join('td')
            .style('padding', '6px 8px')
            .style('text-align', 'center')
            .text(cell => (typeof cell === 'number' ? number(cell) : String(cell)));
    },

    // Selected rows, here or in another view, are kept on top, in sorted order.
    arrange({ html, rows, highlighted, parts }) {
        const order = new Map(rows.map((row, index) => [row, index]));
        const withPart = new Set(parts.map(part => part.datum));
        const pinned = (row: AutkDatum) => highlighted(row) || withPart.has(row);
        html.selectAll<HTMLTableRowElement, AutkDatum>('tbody tr')
            .sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || order.get(a)! - order.get(b)!);
    },
};
