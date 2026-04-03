import type { ChartEvents, ChartType, UnifiedChartConfig } from './api';
import { Barchart } from './chart-types/barchart';
import { Linechart } from './chart-types/linechart';
import { ParallelCoordinates } from './chart-types/pcoordinates';
import { Scatterplot } from './chart-types/scatterplot';
import { TableVis } from './chart-types/tablevis';

type ChartInstance = {
    selection: number[];
    events: ChartEvents;
    setSelection: (selection: number[]) => void;
    draw: () => void | Promise<void>;
};

/**
 * Unified public chart entrypoint for autk-plot.
 *
 * Wraps chart-specific implementations behind a single constructor
 * and a common selection/event API.
 */
export class AutkChart {
    private _plot: ChartInstance;
    private _type: ChartType;

    /**
     * Creates a chart instance for the requested chart type.
     * @param div Host HTML element where the chart should render.
     * @param config Discriminated chart configuration with a `type` field.
     */
    constructor(div: HTMLElement, config: UnifiedChartConfig) {
        this._type = config.type;
        this._plot = this.createPlot(div, config);
    }

    /**
     * Returns the chart type handled by this wrapper.
     * @returns Active chart type.
     */
    get type(): ChartType {
        return this._type;
    }

    /**
     * Returns the underlying concrete chart instance.
     * @returns Internal chart implementation instance.
     */
    get instance(): ChartInstance {
        return this._plot;
    }

    /**
     * Gets the active selection as source feature indices.
     * @returns Selected source feature indices.
     */
    get selection(): number[] {
        return this._plot.selection;
    }

    /**
     * Gets the event dispatcher for this chart.
     * @returns Plot event dispatcher.
     */
    get events(): ChartEvents {
        return this._plot.events;
    }

    /**
     * Applies a selection to the chart.
     * @param selection Source feature indices to highlight/select.
     */
    public setSelection(selection: number[]): void {
        this._plot.setSelection(selection);
    }

    /**
     * Triggers a redraw when supported by the underlying chart implementation.
     * @returns A promise resolved when redraw completes (if async).
     */
    public async draw(): Promise<void> {
        await this._plot.draw();
    }

    private omitType<T extends { type: ChartType }>(config: T): Omit<T, 'type'> {
        const { type, ...rest } = config;
        void type;
        return rest;
    }

    private createPlot(div: HTMLElement, config: UnifiedChartConfig): ChartInstance {
        switch (config.type) {
            case 'scatterplot': {
                const chartConfig = this.omitType(config);
                return new Scatterplot({ div, ...chartConfig });
            }
            case 'barchart': {
                const chartConfig = this.omitType(config);
                return new Barchart({ div, ...chartConfig });
            }
            case 'parallel-coordinates': {
                const chartConfig = this.omitType(config);
                return new ParallelCoordinates({ div, ...chartConfig });
            }
            case 'table': {
                const chartConfig = this.omitType(config);
                return new TableVis({ div, ...chartConfig });
            }
            case 'linechart': {
                const chartConfig = this.omitType(config);
                return new Linechart({ div, ...chartConfig });
            }
            default: {
                const unreachable: never = config;
                throw new Error(`Unsupported chart type: ${String(unreachable)}`);
            }
        }
    }
}
