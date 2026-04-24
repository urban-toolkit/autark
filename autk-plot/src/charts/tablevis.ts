/**
 * @fileoverview Table-based visualization for tabular data with sorting and selection.
 *
 * Provides a D3-based table visualization with the following features:
 * - **Tabular rendering**: Displays feature properties as rows and columns
 * - **Sortable columns**: Clickable headers toggle between ascending and descending order
 * - **Selection and linked views**: Uses source feature ids for click selection and highlights, with selected rows pinned to the top
 * - **Customizable columns**: Axis/attribute mapping for flexible column selection and labeling
 *
 * @example
 * // Basic table visualization
 * const plot = new AutkChart(plotDiv, {
 *   type: 'table',
 *   collection: geojson,
 *   attributes: { axis: ['name', 'population', 'area'] },
 *   labels: { axis: ['Name', 'Population', 'Area'], title: 'City Table' }
 * });
 *
 * @example
 * // Table with selection and sorting
 * const plot = new AutkChart(plotDiv, {
 *   type: 'table',
 *   collection: geojson,
 *   events: [ChartEvent.CLICK],
 *   attributes: { axis: ['id', 'value'] },
 *   labels: { axis: ['ID', 'Value'], title: 'Data Table' }
 * });
 */
import * as d3 from 'd3';

import { valueAtPath } from '../types-core';

import type { AutkDatum } from '../types-chart';
import type { SortTransformConfig, ChartConfig } from '../api';

import { ChartBaseInteractive } from '../chart-base-interactive';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../types-events';

/**
 * Table-based visualization with sorting and row selection interactions.
 *
 * Selected rows are pinned to the top and keep stable source index mapping.
 */
export class TableVis extends ChartBaseInteractive {

    /**
     * Creates a table visualization and performs the initial draw.
     *
     * @param config Plot configuration for table rendering.
     * @throws If a transform is configured with a preset other than `sort`.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }

        if (config.transform && config.transform.preset !== 'sort') {
            throw new Error('TableVis only supports the sort transform preset.');
        }

        if (!config.transform) {
            config.transform = { preset: 'sort', options: { column: config.attributes?.axis?.[0] ?? '', direction: 'asc' } };
        }

        super(config);

        this.draw();
    }

    /**
     * Renders table structure, headers, and rows.
     *
     * @throws If the root table element cannot be created.
     */
    public render(): void {
        const container = d3
            .select(this._div)
            .selectAll('.autk-table-container')
            .data([0])
            .join('div')
            .attr('class', 'autk-table-container')
            .style('width', `100%`)
            .style('height', `100%`)
            .style('overflow', 'auto')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px');

        const table = container
            .selectAll('.autk-table')
            .data([0])
            .join('table')
            .attr('class', 'autk-table')
            .style('width', '100%')
            .style('border-collapse', 'collapse')
            .style('font-family', 'sans-serif')
            .style('font-size', '12px')
            .style('text-align', 'left');

        if (!table.node()) {
            throw new Error('Table element could not be created.');
        }

        // ---- Headers
        const thead = table.selectAll('thead').data([0]).join('thead');

        thead
            .selectAll('tr')
            .data([0])
            .join('tr')
            .selectAll<HTMLTableCellElement, string>('th')
            .data(this._axisLabels)
            .join('th')
            .style('padding', '8px')
            .style('border-bottom', '2px solid #bbb')
            .style('background-color', '#f8f8f8')
            .style('position', 'sticky')
            .style('top', '0')
            .style('text-align', 'center')
            .style('cursor', 'pointer')
            .style('user-select', 'none')
            .text((d) => String(d))
            .on('click', (_event, axisLabel) => {
                const attrIdx = this._axisLabels.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? this.renderAxisAttributes[attrIdx] : axisLabel;

                const sortConfig = this._transformConfig as SortTransformConfig;
                if ((sortConfig.options?.column ?? this.renderAxisAttributes[0]) === attr) {
                    const direction = sortConfig.options?.direction === 'asc' ? 'desc' : 'asc';
                    this._transformConfig = { preset: 'sort', options: { column: attr, direction } };
                } else {
                    this._transformConfig = { preset: 'sort', options: { column: attr, direction: 'asc' } };
                }

                this.draw();
            });

        // ---- Body
        const tbody = table
            .selectAll<HTMLTableSectionElement, unknown>('tbody')
            .data([0])
            .join('tbody') as d3.Selection<HTMLTableSectionElement, unknown, any, unknown>;

        this.renderRows(tbody);

        this.configureSignalListeners();
        this.updateHeaderStyles();
    }

    /**
     * Renders data rows, pinning selected rows to the top.
     *
     * Row identity is resolved via `autkIds` so ordering remains stable
     * across sorts and selection changes.
     *
     * @param tbody Target tbody selection.
     */
    private renderRows(tbody: d3.Selection<HTMLTableSectionElement, unknown, any, unknown>): void {
        const selectedRows = this._data.filter((row) => this.isMarkHighlighted(row));
        const restRows = this._data.filter((row) => !this.isMarkHighlighted(row));
        const displayRows = [...selectedRows, ...restRows];

        const numberFormatter = d3.format('');

        const rows = tbody
            .selectAll<HTMLTableRowElement, AutkDatum>('tr')
            .data(displayRows, (d) => String(d?.autkIds?.[0] ?? ''))
            .join('tr')
            .attr('class', 'autkMark')
            .style('border-bottom', '1px solid #eee')
            .style('cursor', 'pointer')
            .style('background-color', (d) => this.isMarkHighlighted(d) ? ChartStyle.highlight : 'transparent')
            .style('color', (d) => this.isMarkHighlighted(d) ? '#ffffff' : '#000000');

        rows
            .selectAll('td')
            .data((d) => this.renderAxisAttributes.map((attr, i) => ({
                column: this._axisLabels[i] ?? attr,
                value: d ? valueAtPath(d, attr) : 'unknown'
            })))
            .join('td')
            .style('padding', '6px 8px')
            .style('text-align', 'center')
            .text((d) => typeof d.value === 'number' ? numberFormatter(d.value) : String(d.value));
    }

    /**
     * Re-renders rows and re-attaches click handlers after selection styles are applied.
     *
     * This keeps pinned-row ordering and click behavior in sync after selection updates.
     */
    protected override onSelectionUpdated(): void {
        const tbody = d3.select(this._div).select<HTMLTableSectionElement>('.autk-table tbody');
        if (tbody.node()) {
            this.renderRows(tbody);
            this.clickEvent();
        }
    }

    /**
     * Updates header styling to reflect the active sort column and direction.
     */
    protected updateHeaderStyles(): void {
        d3.select(this._div)
            .selectAll<HTMLTableCellElement, string>('th')
            .style('color', (axisLabel) => {
                const attrIdx = this._axisLabels.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? this.renderAxisAttributes[attrIdx] : axisLabel;
                const sortCol = (this._transformConfig as SortTransformConfig)?.options?.column ?? this.renderAxisAttributes[0];
                return sortCol === attr ? '#cc3300' : '#000';
            })
            .style('text-decoration', (axisLabel) => {
                const attrIdx = this._axisLabels.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? this.renderAxisAttributes[attrIdx] : axisLabel;
                const sortCol = (this._transformConfig as SortTransformConfig)?.options?.column ?? this.renderAxisAttributes[0];
                return sortCol === attr ? 'underline' : 'none';
            });
    }
}
