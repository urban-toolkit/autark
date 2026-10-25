/**
 * @fileoverview Waffle chart: one square per feature, grouped by category.
 *
 * Provides a D3-based waffle chart with the following features:
 * - **Unit squares**: Each group (category or bin) is a block of squares, one
 *   per source feature, laid out in rows of a fixed number of columns
 * - **Group marks**: All squares of a group are the same mark, so clicking or
 *   brushing any of them selects the whole group, like a bar
 * - **Segregated view**: A selection from another view paints exactly the
 *   squares of the selected features, the most literal reading of the units
 *   reduced into a mark
 * - **Transform required**: Data must be grouped with the `binning-1d` preset
 *   and the count reducer, since each square stands for one feature
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'waffle',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 *   labels: { title: 'Regions by land use' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';

import { PlotBaseInteractive } from '../plot-base-interactive';
import { featureId, markId } from '../provenance';

/** Squares per row of a group block. */
const COLUMNS = 10;
/** Gap between squares, as a fraction of the cell size. */
const GAP = 0.15;

/** One square: a feature inside the block of its group. */
type Square = {
    /** Group row the feature belongs to. */
    row: AutkDatum;
    /** Source feature index. */
    feature: number;
    /** Grid column inside the block. */
    column: number;
    /** Grid line of the whole chart, blocks included. */
    line: number;
};

/**
 * Waffle chart of the features of each group, one square per feature.
 */
export class Waffle extends PlotBaseInteractive {

    /** Laid-out squares of the last render. */
    protected squares: Square[] = [];
    /** Cell size in pixels, square plus gap. */
    protected cell = 0;
    /** Left edge of the grid, after the group labels. */
    protected gridX = 0;

    /**
     * Creates a waffle chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `binning-1d` transform with the count reducer.
     * @throws If the transform is missing, is not `binning-1d`, or does not count features.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (!config.transform || config.transform.preset !== 'binning-1d') {
            throw new Error('Waffle requires a binning-1d transform preset.');
        }
        if ((config.transform.options?.reducer ?? 'count') !== 'count') {
            throw new Error('Waffle requires the count reducer: each square is one feature.');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, group labels, and squares.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        if (!svg.node()) throw new Error('SVG element could not be created.');

        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title
        svg.selectAll<SVGTextElement, string>('#plotTitle')
            .data(this._title ? [this._title] : []).join('text')
            .attr('id', 'plotTitle')
            .attr('class', 'plot-title')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);

        // ---- Layout: one block per group, in data order, a blank line between blocks
        const labelAttr = this.renderAxisAttributes[0];
        const groups = this._data.map(row => ({ row, features: sortNumbers(row.autkIds ?? []) }));
        const blocks: { row: AutkDatum; line: number; count: number }[] = [];
        this.squares = [];
        let line = 0;
        for (const { row, features } of groups) {
            blocks.push({ row, line, count: features.length });
            features.forEach((feature, index) => {
                this.squares.push({ row, feature, column: index % COLUMNS, line: line + Math.floor(index / COLUMNS) });
            });
            line += Math.max(1, Math.ceil(features.length / COLUMNS)) + 1;
        }
        const lines = Math.max(1, line - 1);
        const labelWidth = Math.min(width * 0.35, 120);
        this.cell = Math.max(1, Math.min((width - labelWidth) / COLUMNS, height / lines));
        this.gridX = labelWidth + (width - labelWidth - this.cell * COLUMNS) / 2;
        const size = this.cell * (1 - GAP);

        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGTextElement, (typeof blocks)[number]>('.autk-waffle-label')
            .data(blocks).join('text')
            .attr('class', 'autk-waffle-label')
            .attr('x', this.gridX - 8)
            .attr('y', b => (b.line + 0.5) * this.cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('font-size', '11px')
            .style('fill', '#24292f')
            .text(b => `${valueAtPath(b.row, labelAttr)} (${b.count})`);

        // Every square is bound to its group row, so all squares of a group form one mark.
        const squareAt = (index: number) => this.squares[index];
        cGroup.selectAll<SVGRectElement, AutkDatum>('.autkMark')
            .data(this.squares.map(s => s.row)).join('rect')
            .attr('class', 'autkMark')
            .attr('data-autk-feature', (_r, i) => squareAt(i).feature)
            .attr('x', (_r, i) => this.gridX + squareAt(i).column * this.cell)
            .attr('y', (_r, i) => squareAt(i).line * this.cell)
            .attr('width', size)
            .attr('height', size)
            .attr('rx', size * 0.15)
            .style('fill', r => this.getMarkColor(r))
            .style('cursor', 'pointer')
            .each(function (r, i) {
                d3.select(this).selectAll('title').data([0]).join('title')
                    .text(`${valueAtPath(r, labelAttr)}: feature ${squareAt(i).feature}`);
            });

        this.configureSignalListeners();
    }

    /**
     * Groups reduce many features, so they can show partial contributions.
     *
     * @returns Always `true`; the chart requires a counting `binning-1d` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Paints the squares of the selected features.
     *
     * Each square is one counted unit of its group, so the part of a group
     * produced by a selection is exactly its selected squares.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || this.cell === 0) return;

        const parts = this.segregatedParts();
        const active = new Map(parts.map(p => [p.datum as object, p]));
        const selected = new Set(this.selection.map(featureId));
        const painted = this.squares.filter(s => active.has(s.row as object) && selected.has(featureId(s.feature)));
        const size = this.cell * (1 - GAP);

        group.selectAll<SVGRectElement, Square>('.autkPartial')
            .data(painted, s => `${s.feature}`)
            .join('rect')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', s => markId(this.rowIdOf(s.row) ?? ''))
            .attr('data-autk-feature', s => s.feature)
            .attr('data-autk-units', s => {
                const part = active.get(s.row as object)!.part;
                return `${part.selectedUnits}/${part.totalUnits}`;
            })
            .attr('x', s => this.gridX + s.column * this.cell)
            .attr('y', s => s.line * this.cell)
            .attr('width', size)
            .attr('height', size)
            .attr('rx', size * 0.15)
            .style('fill', this.highlightColor)
            .style('pointer-events', 'none');
    }
}

/** Sorts numbers in ascending order without changing the input. */
function sortNumbers(values: number[]): number[] {
    return [...values].sort((a, b) => a - b);
}
