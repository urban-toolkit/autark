import { PlotEvent } from './constants';
import { PlotEvents } from './plot-events';
import type { ChartType, PlotSelectionPayload, UnifiedChartConfig } from './types';
import { Barchart } from './plot-types/barchart';
import { Linechart } from './plot-types/linechart';
import { ParallelCoordinates } from './plot-types/pcoordinates';
import { Scatterplot } from './plot-types/scatterplot';
import { TableVis } from './plot-types/tablevis';

type PlotWithEvents = {
    selection: number[];
    events: PlotEvents;
    setSelection: (selection: number[]) => void;
    draw: () => void | Promise<void>;
};

type PlotWithoutEvents = {
    setSelection: (selection: number[]) => void;
};

type AnyPlot = PlotWithEvents | PlotWithoutEvents;

export class AutkChart {
    private _plot: AnyPlot;
    private _type: ChartType;
    private _selection: number[] = [];
    private _fallbackEvents = new PlotEvents([]);

    constructor(div: HTMLElement, config: UnifiedChartConfig) {
        this._type = config.type;
        this._plot = this.createPlot(div, config);
    }

    get type(): ChartType {
        return this._type;
    }

    get instance(): AnyPlot {
        return this._plot;
    }

    get selection(): number[] {
        if (this.hasEvents(this._plot)) {
            return this._plot.selection;
        }
        return this._selection;
    }

    get events(): PlotEvents {
        if (this.hasEvents(this._plot)) {
            return this._plot.events;
        }
        return this._fallbackEvents;
    }

    public on(event: PlotEvent, listener: (event: PlotSelectionPayload) => void): void {
        this.events.addListener(event, listener);
    }

    public setSelection(selection: number[]): void {
        this._selection = [...selection];
        this._plot.setSelection(selection);
    }

    public async draw(): Promise<void> {
        if (this.hasDraw(this._plot)) {
            await this._plot.draw();
        }
    }

    private hasEvents(plot: AnyPlot): plot is PlotWithEvents {
        return 'events' in plot && 'selection' in plot;
    }

    private hasDraw(plot: AnyPlot): plot is PlotWithEvents {
        return 'draw' in plot;
    }

    private omitType<T extends { type: ChartType }>(config: T): Omit<T, 'type'> {
        const { type, ...rest } = config;
        void type;
        return rest;
    }

    private createPlot(div: HTMLElement, config: UnifiedChartConfig): AnyPlot {
        switch (config.type) {
            case 'scatterplot': {
                const chartConfig = this.omitType(config);
                return new Scatterplot({ div, events: [PlotEvent.CLICK], ...chartConfig });
            }
            case 'barchart': {
                const chartConfig = this.omitType(config);
                return new Barchart({ div, events: [PlotEvent.CLICK], ...chartConfig });
            }
            case 'parallel-coordinates': {
                const chartConfig = this.omitType(config);
                return new ParallelCoordinates({ div, events: [PlotEvent.CLICK], ...chartConfig });
            }
            case 'table': {
                const chartConfig = this.omitType(config);
                return new TableVis({ div, events: [PlotEvent.CLICK], ...chartConfig });
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
