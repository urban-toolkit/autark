import * as d3 from "d3";

import { PlotD3 } from "../plot-d3";
import { PlotConfig } from "../types";
import { PlotStyle } from "../plot-style";
import { PlotEvent } from "../constants";

export class TableVis extends PlotD3 {

    protected sortColumn: string | null = null;

    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = [PlotEvent.CLICK]; }
        super(config);

        this.draw();
    }

    public async draw(): Promise<void> {
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
        const plot = this;

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
                const attrIdx = plot._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? plot._attributes[attrIdx] : axisLabel;
                plot.sortColumn = plot.sortColumn === attr ? null : attr;
                plot.updateHeaderStyles();
                plot.updatePlotSelection();
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

    // clickEvent is handled directly in renderRows to preserve original indices
    override clickEvent(): void { /* no-op */ }

    private getDisplayRows(): { idx: number; row: any }[] {
        const highlighted = this.selection
            .map(idx => ({ idx, row: this.data[idx] }))
            .filter(d => d.row != null);

        const rest = this.data
            .map((row, idx) => ({ idx, row }))
            .filter(d => !this.selection.includes(d.idx));

        if (this.sortColumn) {
            const col = this.sortColumn;
            rest.sort((a, b) => {
                const av = a.row ? this.getNestedValue(a.row, col) : null;
                const bv = b.row ? this.getNestedValue(b.row, col) : null;
                if (av == null) return 1;
                if (bv == null) return -1;
                const an = Number(av), bn = Number(bv);
                if (!isNaN(an) && !isNaN(bn)) return bn - an;
                return String(bv).localeCompare(String(av));
            });
        }

        return [...highlighted, ...rest];
    }

    private renderRows(tbody: d3.Selection<HTMLTableSectionElement, unknown, any, unknown>): void {
        const displayRows = this.getDisplayRows();
        const plot = this;

        const rows = tbody
            .selectAll<HTMLTableRowElement, { idx: number; row: any }>('tr')
            .data(displayRows, (d) => String(d.idx))
            .join('tr')
            .attr('class', 'autkMark')
            .style('border-bottom', '1px solid #eee')
            .style('cursor', 'pointer')
            .style('background-color', (d) => plot.selection.includes(d.idx) ? PlotStyle.highlight : 'transparent')
            .style('color', (d) => plot.selection.includes(d.idx) ? '#ffffff' : '#000000')
            .on('click', function (_event, d) {
                const id = d.idx;
                if (plot.selection.includes(id)) {
                    plot.selection = plot.selection.filter(loc => loc !== id);
                } else {
                    plot.selection.push(id);
                }
                plot.plotEvents.emit(PlotEvent.CLICK, plot.selection);
                plot.updatePlotSelection();
            });

        rows
            .selectAll('td')
            .data((d) => plot._attributes.map((attr, i) => ({
                column: plot._axis[i] ?? attr,
                value: d.row ? plot.getNestedValue(d.row, attr) : 'unknown'
            })))
            .join('td')
            .style('padding', '6px 8px')
            .style('text-align', 'center')
            .text((d) => typeof d.value === 'number' ? +d.value.toFixed(4) : String(d.value));
    }

    override updatePlotSelection(): void {
        const tbody = d3.select(this._div).select<HTMLTableSectionElement>('.autk-table tbody');
        if (tbody.node()) {
            this.renderRows(tbody);
        }
    }

    protected updateHeaderStyles(): void {
        const plot = this;
        d3.select(this._div)
            .selectAll<HTMLTableCellElement, string>('th')
            .style('color', (axisLabel) => {
                const attrIdx = plot._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? plot._attributes[attrIdx] : axisLabel;
                return plot.sortColumn === attr ? '#cc3300' : '#000';
            })
            .style('text-decoration', (axisLabel) => {
                const attrIdx = plot._axis.indexOf(axisLabel);
                const attr = attrIdx >= 0 ? plot._attributes[attrIdx] : axisLabel;
                return plot.sortColumn === attr ? 'underline' : 'none';
            });
    }
}
