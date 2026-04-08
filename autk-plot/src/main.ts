import type { ChartType, UnifiedChartConfig } from './api';

import type { EventEmitter } from './core-types';

import type { ChartEventRecord } from './events-types';

import { ChartBase } from './chart-base';

import {
    Barchart,
    Heatmatrix,
    Linechart,
    ParallelCoordinates,
    Scatterplot,
    TableVis,
} from './charts';

/**
 * Unified public entrypoint for autk-plot chart creation and interaction.
 *
 * `AutkChart` wraps chart-specific implementations (`scatterplot`, `barchart`,
 * `parallel-coordinates`, `table`, `linechart`, `heatmatrix`) behind a single constructor
 * and a stable API for selection and event handling.
 *
 * The wrapper delegates all behavior to the concrete chart instance selected by
 * `config.type` while exposing a chart-agnostic interface to consumers.
 *
 * @example
 * const plot = new AutkChart(plotDiv, {
 *   type: 'scatterplot',
 *   collection,
 *   labels: { axis: ['x', 'y'], title: 'Example' }
 * });
 *
 * plot.events.on('click', ({ selection }) => {
 *   console.log(selection);
 * });
 */
export class AutkChart {
    private _plot: ChartBase;
    private _type: ChartType;

    /**
     * Creates a chart wrapper for the requested chart type.
     *
     * The concrete implementation is selected using the discriminated
     * `config.type` field and instantiated immediately.
     *
     * @param div Host HTML element where the chart should render.
     * @param config Discriminated chart configuration with a `type` field.
     * @throws If `config.type` is not supported.
     */
    constructor(div: HTMLElement, config: UnifiedChartConfig) {
        this._type = config.type;
        this._plot = this.createPlot(div, config);
    }

    /**
     * Gets the active chart type handled by this wrapper.
     * @returns Active chart type discriminator.
     */
    get type(): ChartType {
        return this._type;
    }

    /**
     * Gets the underlying concrete chart instance.
     *
     * This is mainly useful for advanced scenarios that require direct access
     * to implementation-specific behavior.
     *
     * @returns Internal chart implementation instance.
     */
    get instance(): ChartBase {
        return this._plot;
    }

    /**
     * Gets the active selection as source feature ids.
     * @returns Selected source feature ids.
     */
    get selection(): number[] {
        return this._plot.selection;
    }

    /**
     * Gets the chart event dispatcher.
     * @returns Typed event dispatcher exposed by the concrete chart.
     */
    get events(): EventEmitter<ChartEventRecord> {
        return this._plot.events;
    }

    /**
     * Applies a new selection to the chart.
     *
     * The selection is interpreted as source feature ids and forwarded to the
     * concrete chart instance.
     *
     * @param selection Source feature ids to highlight/select.
     */
    public setSelection(selection: number[]): void {
        this._plot.selection = selection;
    }

    /**
     * Triggers a redraw of the underlying chart implementation.
     *
     * Implementations may perform synchronous or asynchronous rendering, so
     * this method always returns a promise.
     *
     * @returns void
     */
    public draw(): void {
        this._plot.draw();
    }

    /**
     * Instantiates the concrete chart class from a discriminated config.
     *
     * This method is intentionally centralized so chart type dispatch remains
     * explicit and easy to audit.
     *
     * @param div Host HTML element where the chart should render.
     * @param config Discriminated chart configuration.
     * @returns Concrete chart instance matching `config.type`.
     * @throws If `config.type` is not supported.
     */
    private createPlot(div: HTMLElement, config: UnifiedChartConfig): ChartBase {
        switch (config.type) {
            case 'scatterplot': {
                const { type, ...chartConfig } = config;
                void type;
                return new Scatterplot({ div, ...chartConfig });
            }
            case 'barchart': {
                const { type, ...chartConfig } = config;
                void type;
                return new Barchart({ div, ...chartConfig });
            }
            case 'parallel-coordinates': {
                const { type, ...chartConfig } = config;
                void type;
                return new ParallelCoordinates({ div, ...chartConfig });
            }
            case 'table': {
                const { type, ...chartConfig } = config;
                void type;
                return new TableVis({ div, ...chartConfig });
            }
            case 'linechart': {
                const { type, ...chartConfig } = config;
                void type;
                return new Linechart({ div, ...chartConfig });
            }
            case 'heatmatrix': {
                const { type, ...chartConfig } = config;
                void type;
                return new Heatmatrix({ div, ...chartConfig });
            }
            default: {
                throw new Error(`Unsupported chart type: ${config.type}`);
            }
        }
    }
}
