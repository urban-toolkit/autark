import * as d3 from 'd3';

import { ChartD3 } from '../chart-d3';
import type { ChartConfig } from '../api';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../events-types';
import { valueAtPath } from '../core-types';

/**
 * Table-based visualization with sorting and row selection interactions.
 *
 * Selected rows are pinned to the top and keep stable source index mapping.
 */
export class TableVis extends ChartD3 {

    protected sortColumn: string | null = null;

    /**
     * Creates a table visualization and performs the initial draw.
     * @param config Plot configuration for table rendering.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        super(config);

        this.draw();
    }

    /**
     * Renders table structure, headers, and rows.
     * @returns Promise resolved when table nodes are synchronized.
     */
    public async render(): Promise<void> {
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
        const chart = this;

        thead
            .selectAll('tr')
            .data([0])
            .join('tr')
            .selectAll<HTMLTableCellElement, string>('th')
            .data(this._axis)
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
                const attrIdx = chart._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? chart._attributes[attrIdx] : axisLabel;
                chart.sortColumn = chart.sortColumn === attr ? null : attr;
                chart.updateHeaderStyles();
                chart.updateChartSelection();
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
     * Returns rows ordered by current selection and optional sort column.
     *
     * Each entry carries `autkIds: [idx]` so the base `clickEvent` can resolve
     * the stable source index without relying on the DOM position.
     * @returns Row descriptors with stable source indices.
     */
    private getDisplayRows(): { idx: number; row: any; autkIds: number[] }[] {
        const highlighted = this.selection
            .map(idx => ({ idx, row: this.data[idx], autkIds: [idx] }))
            .filter(d => d.row != null);

        const rest = this.data
            .map((row, idx) => ({ idx, row, autkIds: [idx] }))
            .filter(d => !this.selection.includes(d.idx));

        if (this.sortColumn) {
            const col = this.sortColumn;
            rest.sort((a, b) => {
                const av = a.row ? valueAtPath(a.row, col) : null;
                const bv = b.row ? valueAtPath(b.row, col) : null;
                if (av == null) return 1;
                if (bv == null) return -1;
                const an = Number(av), bn = Number(bv);
                if (!isNaN(an) && !isNaN(bn)) return bn - an;
                return String(bv).localeCompare(String(av));
            });
        }

        return [...highlighted, ...rest];
    }

    /**
     * Renders data rows and row-level interaction handlers.
     * @param tbody Target tbody selection.
     */
    private renderRows(tbody: d3.Selection<HTMLTableSectionElement, unknown, any, unknown>): void {
        const displayRows = this.getDisplayRows();
        const chart = this;
        const numberFormatter = d3.format('');

        const rows = tbody
            .selectAll<HTMLTableRowElement, { idx: number; row: any }>('tr')
            .data(displayRows, (d) => String(d.idx))
            .join('tr')
            .attr('class', 'autkMark')
            .style('border-bottom', '1px solid #eee')
            .style('cursor', 'pointer')
            .style('background-color', (d) => chart.isDatumSelected(d) ? ChartStyle.highlight : 'transparent')
            .style('color', (d) => chart.isDatumSelected(d) ? '#ffffff' : '#000000');

        rows
            .selectAll('td')
            .data((d) => chart._attributes.map((attr, i) => ({
                column: chart._axis[i] ?? attr,
                value: d.row ? valueAtPath(d.row, attr) : 'unknown'
            })))
            .join('td')
            .style('padding', '6px 8px')
            .style('text-align', 'center')
                .text((d) => typeof d.value === 'number' ? numberFormatter(d.value) : String(d.value));
    }

    /**
     * Re-renders rows and re-attaches click handlers after selection styles are applied.
     * @returns Nothing.
     */
    protected override onSelectionUpdated(): void {
        const tbody = d3.select(this._div).select<HTMLTableSectionElement>('.autk-table tbody');
        if (tbody.node()) {
            this.renderRows(tbody);
            this.clickEvent();
        }
    }

    /**
     * Updates header styling based on active sort column.
     * @returns Nothing.
     */
    protected updateHeaderStyles(): void {
        const chart = this;
        d3.select(this._div)
            .selectAll<HTMLTableCellElement, string>('th')
            .style('color', (axisLabel) => {
                const attrIdx = chart._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? chart._attributes[attrIdx] : axisLabel;
                return chart.sortColumn === attr ? '#cc3300' : '#000';
            })
            .style('text-decoration', (axisLabel) => {
                const attrIdx = chart._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? chart._attributes[attrIdx] : axisLabel;
                return chart.sortColumn === attr ? 'underline' : 'none';
            });
    }
}
