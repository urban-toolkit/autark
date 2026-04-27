import * as d3 from 'd3';

import { PlotD3 } from '../plot-d3';
import { PlotConfig } from '../types';
import { PlotStyle } from '../plot-style';
import { PlotEvent } from '../constants';

type BinDatum = { value: number; index: number };

/**
 * D3 histogram chart.
 *
 * Each bar represents one bin computed by d3.bin() on the numeric property
 * specified by config.labels.axis[0]. Selection emits and receives *feature
 * row indices* (not bin indices), so it is directly compatible with the
 * coordinated-view highlighting used by the map and other plots.
 *
 * config.labels.axis[1] is used as the Y-axis label (defaults to 'Count').
 */
export class Histogram extends PlotD3 {
  private binData: d3.Bin<BinDatum, number>[] = [];

  constructor(config: PlotConfig) {
    if (config.events === undefined) { config.events = [PlotEvent.CLICK]; }
    super(config);
    this.draw();
  }

  public async draw(): Promise<void> {
    const svg = d3
      .select(this._div)
      .selectAll('#plot')
      .data([0])
      .join('svg')
      .attr('id', 'plot')
      .style('width', `${this._width}px`)
      .style('height', `${this._height}px`)
      .style('visibility', 'visible');

    const node = svg.node();
    if (!svg || !node) throw new Error('SVG element could not be created.');

    const width = this._width - this._margins.left - this._margins.right;
    const height = this._height - this._margins.top - this._margins.bottom;

    if (this._title && this._title.length > 0) {
      svg
        .selectAll<SVGTextElement, string>('#plotTitle')
        .data([this._title])
        .join('text')
        .attr('id', 'plotTitle')
        .attr('class', 'plot-title')
        .attr('x', this._margins.left + width / 2)
        .attr('y', Math.max(this._margins.top * 0.5, 10))
        .attr('text-anchor', 'middle')
        .style('font-weight', '600')
        .style('visibility', 'visible')
        .text((d) => d);
    }

    const values: BinDatum[] = this.data.map((d, i) => ({
      value: d ? +d[this._axis[0]] || 0 : 0,
      index: i,
    }));

    const extent = d3.extent(values, (d) => d.value) as [number, number];
    this.binData = d3
      .bin<BinDatum, number>()
      .value((d) => d.value)
      .domain(extent)(values);

    const mapX = d3.scaleLinear().domain(extent).range([0, width]);
    const maxCount = d3.max(this.binData, (b) => b.length) ?? 0;
    const mapY = d3.scaleLinear().domain([0, maxCount]).range([height, 0]);

    const xAxis = d3.axisBottom(mapX).tickSizeOuter(0).tickFormat(d3.format('.2s'));
    svg
      .selectAll<SVGGElement, unknown>('#axisX')
      .data([0])
      .join('g')
      .attr('id', 'axisX')
      .attr('class', 'x axis')
      .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
      .style('visibility', 'visible')
      .call(xAxis);

    const yAxis = d3.axisLeft(mapY).tickSizeInner(-width).tickFormat(d3.format('.2s'));
    const yAxisSel = svg
      .selectAll<SVGGElement, unknown>('#axisY')
      .data([0])
      .join('g')
      .attr('id', 'axisY')
      .attr('class', 'y axis')
      .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
      .style('visibility', 'visible')
      .call(yAxis);

    const yLabel = this._axis[1] ?? 'Count';
    yAxisSel
      .selectAll('.hist-ylabel')
      .data([yLabel])
      .join('text')
      .attr('class', 'hist-ylabel title')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-90)')
      .attr('y', -this._margins.left / 2 - 7)
      .attr('x', -this._margins.top)
      .style('visibility', 'visible')
      .text((d) => d);

    const cGroup = svg
      .selectAll('.autkBrushable')
      .data([0])
      .join('g')
      .attr('class', 'autkBrushable autkMarksGroup')
      .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

    cGroup
      .selectAll('.autkClear')
      .data([0])
      .join('rect')
      .attr('class', 'autkClear')
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'white')
      .style('opacity', 0)
      .style('visibility', 'visible');

    const barPad = 1;
    cGroup
      .selectAll('.autkMark')
      .data(this.binData)
      .join('rect')
      .attr('class', 'autkMark')
      .attr('x', (b) => mapX(b.x0!) + barPad)
      .attr('y', (b) => mapY(b.length))
      .attr('width', (b) => Math.max(0, mapX(b.x1!) - mapX(b.x0!) - barPad * 2))
      .attr('height', (b) => height - mapY(b.length))
      .style('fill', PlotStyle.default)
      .style('stroke', '#2f2f2f')
      .style('visibility', 'visible');

    this.configureSignalListeners();
  }

  // Expand a set of bin indices into the feature row indices within those bins.
  private binIndicesToFeatureIds(binIndices: Set<number>): number[] {
    const ids: number[] = [];
    for (const binIdx of binIndices) {
      const bin = this.binData[binIdx];
      if (bin) ids.push(...bin.map((d) => d.index));
    }
    return [...new Set(ids)];
  }

  // Override: emit feature row indices (not bin indices) so coordinated-view works correctly.
  clickEvent(): void {
    const svgs = d3.select(this._div).selectAll('.autkMark');
    const cls = d3.select(this._div).selectAll('.autkClear');
    const plot = this;

    svgs.each(function (_d, binIdx: number) {
      d3.select(this).on('click', function () {
        const binFeatureIds = plot.binData[binIdx]?.map((d) => d.index) ?? [];
        const allSelected =
          binFeatureIds.length > 0 &&
          binFeatureIds.every((id) => plot.selection.includes(id));
        if (allSelected) {
          plot.selection = plot.selection.filter((id) => !binFeatureIds.includes(id));
        } else {
          plot.selection = [...new Set([...plot.selection, ...binFeatureIds])];
        }
        plot.plotEvents.emit(PlotEvent.CLICK, plot.selection);
        plot.updatePlotSelection();
      });
    });

    cls.on('click', function () {
      plot.selection = [];
      plot.plotEvents.emit(PlotEvent.CLICK, plot.selection);
      plot.updatePlotSelection();
    });
  }

  brushEvent(): void {
    const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
    const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');
    const plot = this;

    brushable.each(function () {
      const cBrush = d3.select<SVGGElement, unknown>(this);
      const brush = d3.brush()
        .extent([[0, 0], [
          plot._width - plot._margins.left - plot._margins.right,
          plot._height - plot._margins.top - plot._margins.bottom,
        ]])
        .on('start end', function (event: d3.D3BrushEvent<unknown>) {
          if (event.selection) {
            const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];
            const brushedBins = new Set<number>();
            marksGroup.selectAll<SVGGraphicsElement, unknown>('.autkMark')
              .each(function (_d, binIdx: number) {
                const bbox = this.getBBox();
                if (!(bbox.x + bbox.width < x0 || bbox.x > x1 || bbox.y + bbox.height < y0 || bbox.y > y1)) {
                  brushedBins.add(binIdx);
                }
              });
            plot.selection = plot.binIndicesToFeatureIds(brushedBins);
          } else {
            plot.selection = [];
          }
          plot.plotEvents.emit(PlotEvent.BRUSH, plot.selection);
          plot.updatePlotSelection();
        });
      cBrush.call(brush);
    });
  }

  brushXEvent(): void {
    const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
    const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');
    const innerHeight = this._height - this._margins.top - this._margins.bottom;
    const plot = this;

    brushable.each(function () {
      const cBrush = d3.select<SVGGElement, unknown>(this);
      const brush = d3.brushX()
        .extent([[0, 0], [
          plot._width - plot._margins.left - plot._margins.right,
          innerHeight,
        ]])
        .on('start end', function (event: d3.D3BrushEvent<unknown>) {
          if (event.selection) {
            const [x0, x1] = event.selection as [number, number];
            const brushedBins = new Set<number>();
            marksGroup.selectAll<SVGGraphicsElement, unknown>('.autkMark')
              .each(function (_d, binIdx: number) {
                const bbox = this.getBBox();
                if (!(bbox.x + bbox.width < x0 || bbox.x > x1)) {
                  brushedBins.add(binIdx);
                }
              });
            plot.selection = plot.binIndicesToFeatureIds(brushedBins);
          } else {
            plot.selection = [];
          }
          plot.plotEvents.emit(PlotEvent.BRUSH_X, plot.selection);
          plot.updatePlotSelection();
        });
      cBrush.call(brush);
    });
  }

  brushYEvent(): void {
    const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
    const marksGroup = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkMarksGroup');
    const innerHeight = this._height - this._margins.top - this._margins.bottom;
    const plot = this;

    brushable.each(function () {
      const cBrush = d3.select<SVGGElement, unknown>(this);
      const brush = d3.brushY()
        .extent([[0, 0], [
          plot._width - plot._margins.left - plot._margins.right,
          innerHeight,
        ]])
        .on('start end', function (event: d3.D3BrushEvent<unknown>) {
          if (event.selection) {
            const [y0, y1] = event.selection as [number, number];
            const brushedBins = new Set<number>();
            marksGroup.selectAll<SVGGraphicsElement, unknown>('.autkMark')
              .each(function (_d, binIdx: number) {
                const bbox = this.getBBox();
                if (!(bbox.y + bbox.height < y0 || bbox.y > y1)) {
                  brushedBins.add(binIdx);
                }
              });
            plot.selection = plot.binIndicesToFeatureIds(brushedBins);
          } else {
            plot.selection = [];
          }
          plot.plotEvents.emit(PlotEvent.BRUSH_Y, plot.selection);
          plot.updatePlotSelection();
        });
      cBrush.call(brush);
    });
  }

  // Highlight bars that contain any of the given feature row indices.
  updatePlotSelection(): void {
    const selectedSet = new Set(this._selection);
    const plot = this;
    d3.select(this._div).selectAll('.autkMark').style('fill', function (_d: unknown, binIdx: number) {
      const bin = plot.binData[binIdx];
      const hasSelected = bin ? bin.some((d) => selectedSet.has(d.index)) : false;
      return hasSelected ? PlotStyle.highlight : PlotStyle.default;
    });
  }
}
