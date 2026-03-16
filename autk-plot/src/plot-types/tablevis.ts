import * as d3 from "d3";

import { PlotD3 } from "../plot-d3";
import { PlotConfig } from "../types";
import { PlotStyle } from "../plot-style";
import { PlotEvent } from "../constants";

export class TableVis extends PlotD3 {

    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = [PlotEvent.CLICK]; }
        super(config);

        this.draw();
    }

    public async draw(): Promise<void> {
        // We override the typical SVG rendering and instead create an HTML table wrapper
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
            .selectAll('th')
            .data(this._axis) // Mapped directly to columns
            .join('th')
            .style('padding', '8px')
            .style('border-bottom', '2px solid #bbb')
            .style('background-color', '#f8f8f8')
            .style('position', 'sticky')
            .style('top', '0')
            .text((d) => String(d));

        // ---- Body
        const tbody = table.selectAll('tbody').data([0]).join('tbody');

        const rows = tbody
            .selectAll('tr')
            .data(this.data)
            .join('tr')
            .attr('class', 'autkMark') // Required for clickEvent tracking in PlotD3
            .style('border-bottom', '1px solid #eee')
            .style('cursor', 'pointer');

        rows
            .selectAll('td')
            .data((row) => {
                return this._axis.map(col => {
                    return { column: col, value: row ? this.getNestedValue(row, col) : 'unknown' };
                });
            })
            .join('td')
            .style('padding', '6px 8px')
            .text((d) => String(d.value));

        this.configureSignalListeners();
    }

    override updatePlotSelection(): void {
        const trs = d3.select(this._div).selectAll('.autkMark');

        trs.style('background-color', (_d: unknown, id: number) => {
            if (this.selection.includes(id)) {
                return PlotStyle.highlight;
            } else {
                return 'transparent';
            }
        });

        trs.style('color', (_d: unknown, id: number) => {
            if (this.selection.includes(id)) {
                return '#ffffff';
            } else {
                return '#000000';
            }
        });
    }
}
