import type { PlotType, UnifiedPlotConfig } from './api';

import type { EventEmitter } from '@urban-toolkit/autk-core';

import type { PlotEventRecord } from './types-events';

import { PlotBaseInteractive } from './plot-base-interactive';
import type { ProvenanceModel } from './provenance';
import type { FeatureShare } from './types-provenance';


import {
    Areachart,
    Barchart,
    Boxplot,
    Bubblechart,
    Calendar,
    Hexbin,
    Heatmatrix,
    Linechart,
    ParallelCoordinates,
    Piechart,
    Sankey,
    Scatterplot,
    TableVis,
    Waffle,
    Stackedbar,
    Treemap,
    Sunburst,
    Radar,
    Cumulativechart,
    Chord,
    Densitychart,
    Violin,
    RegisteredPlot,
    registeredPlot,
} from './plots';

/**
 * Unified public entrypoint for autk-plot plot creation and interaction.
 *
 * `AutkPlot` wraps plot-specific implementations (`scatterplot`, `barchart`,
 * `parallel-coordinates`, `table`, `linechart`, `heatmatrix`, `boxplot`, `sankey`, `pie`, `donut`,
 * `areachart`, `bubble`, `hexbin`, `calendar`, `waffle`, `stackedbar`, `treemap`,
 * `sunburst`, `radar`, `ecdf`, `pareto`, `chord`, `density`,
 * `violin`) behind a single constructor
 * and a stable API for selection and event handling.
 *
 * The wrapper delegates all behavior to the concrete plot instance selected by
 * `config.type` while exposing a plot-agnostic interface to consumers.
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'scatterplot',
 *   collection,
 *   attributes: { axis: ['x', 'y'] },
 *   labels: { axis: ['x', 'y'], title: 'Example' }
 * });
 *
 * plot.events.on('click', ({ selection }) => {
 *   console.log(selection);
 * });
 */
export class AutkPlot {
    /** Concrete plot implementation selected from the discriminated config. */
    private _plot: PlotBaseInteractive;
    /** Active plot type handled by this wrapper instance. */
    private _type: PlotType;

    /**
     * Creates a plot wrapper for the requested plot type.
     *
     * @param div Host HTML element where the plot should render.
     * @param config Discriminated plot configuration with a `type` field.
     * @throws If `config.type` is not supported.
     * @example
     * const plot = new AutkPlot(plotDiv, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });
     */
    constructor(div: HTMLElement, config: UnifiedPlotConfig) {
        this._type = config.type;
        this._plot = this.createPlot(div, config);
    }

    /**
     * Gets the active plot type handled by this wrapper.
     * @returns Active plot type discriminator.
     */
    get type(): PlotType {
        return this._type;
    }

    /**
     * Gets the underlying concrete plot instance.
     *
     * This is mainly useful for advanced scenarios that require direct access
     * to implementation-specific behavior.
     *
     * @returns Internal plot implementation instance.
     */
    get instance(): PlotBaseInteractive {
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
     * Gets the provenance graph of the current draw, from source features to marks.
     *
     * @returns Provenance graph answering direct and inverse queries.
     * @example
     * plot.provenance.direct([0]);              // feature:0 → … → mark
     * plot.provenance.inverse(['mark:aggregate:4']); // mark → … → features
     */
    get provenance(): ProvenanceModel {
        return this._plot.provenance;
    }

    /**
     * Gets the plot event dispatcher.
     * @returns Typed event dispatcher exposed by the concrete plot.
     */
    get events(): EventEmitter<PlotEventRecord> {
        return this._plot.events;
    }

    /**
     * Applies a new selection to the plot as source feature ids.
     *
     * @param selection Source feature ids to highlight/select.
     * @param shares Optional share of each feature covered by the selection in
     * the emitting view, as sent in `PlotEventData.shares`.
     * @throws Never throws.
     * @example
     * plot.setSelection([0, 3, 7]);
     * other.events.on('click', ({ selection, shares }) => plot.setSelection(selection, shares));
     */
    public setSelection(selection: number[], shares?: FeatureShare[]): void {
        this._plot.setSelection(selection, shares);
    }

    /**
     * Replaces the plot's data collection and redraws in place.
     *
     * @param collection New GeoJSON feature collection to render.
     * @throws Never throws.
     * @example
     * plot.updateCollection(newCollection);
     */
    public updateCollection(collection: import('geojson').FeatureCollection): void {
        this._plot.updateCollection(collection);
    }

    /**
     * Triggers a synchronous redraw of the underlying plot implementation.
     *
     * @throws Never throws.
     * @example
     * plot.draw();
     */
    public draw(): void {
        this._plot.draw();
    }

    /**
     * Stops following the host size (`width: 'auto'`) and removes the plot
     * from its host element.
     *
     * @throws Never throws.
     * @example
     * plot.destroy();
     */
    public destroy(): void {
        this._plot.destroy();
    }

    /**
     * Instantiates the concrete plot class from a discriminated config.
     *
     * This method is intentionally centralized so plot type dispatch remains
     * explicit and easy to audit.
     *
     * @param div Host HTML element where the plot should render.
     * @param config Discriminated plot configuration.
     * @returns Concrete plot instance matching `config.type`.
     * @throws If `config.type` is not supported.
     */
    private createPlot(div: HTMLElement, config: UnifiedPlotConfig): PlotBaseInteractive {
        switch (config.type) {
            case 'scatterplot': {
                const { type, ...plotConfig } = config;
                void type;
                return new Scatterplot({ div, ...plotConfig });
            }
            case 'barchart': {
                const { type, ...plotConfig } = config;
                void type;
                return new Barchart({ div, ...plotConfig });
            }
            case 'parallel-coordinates': {
                const { type, ...plotConfig } = config;
                void type;
                return new ParallelCoordinates({ div, ...plotConfig });
            }
            case 'table': {
                const { type, ...plotConfig } = config;
                void type;
                return new TableVis({ div, ...plotConfig });
            }
            case 'linechart': {
                const { type, ...plotConfig } = config;
                void type;
                return new Linechart({ div, ...plotConfig });
            }
            case 'heatmatrix': {
                const { type, ...plotConfig } = config;
                void type;
                return new Heatmatrix({ div, ...plotConfig });
            }
            case 'boxplot': {
                const { type, ...plotConfig } = config;
                void type;
                return new Boxplot({ div, ...plotConfig });
            }
            case 'sankey': {
                const { type, ...plotConfig } = config;
                void type;
                return new Sankey({ div, ...plotConfig });
            }
            case 'pie': {
                const { type, ...plotConfig } = config;
                void type;
                return new Piechart({ div, ...plotConfig }, 0);
            }
            case 'donut': {
                const { type, ...plotConfig } = config;
                void type;
                return new Piechart({ div, ...plotConfig }, 0.55);
            }
            case 'areachart': {
                const { type, ...plotConfig } = config;
                void type;
                return new Areachart({ div, ...plotConfig });
            }
            case 'bubble': {
                const { type, ...plotConfig } = config;
                void type;
                return new Bubblechart({ div, ...plotConfig });
            }
            case 'hexbin': {
                const { type, ...plotConfig } = config;
                void type;
                return new Hexbin({ div, ...plotConfig });
            }
            case 'calendar': {
                const { type, ...plotConfig } = config;
                void type;
                return new Calendar({ div, ...plotConfig });
            }
            case 'waffle': {
                const { type, ...plotConfig } = config;
                void type;
                return new Waffle({ div, ...plotConfig });
            }
            case 'stackedbar': {
                const { type, ...plotConfig } = config;
                void type;
                return new Stackedbar({ div, ...plotConfig });
            }
            case 'treemap': {
                const { type, ...plotConfig } = config;
                void type;
                return new Treemap({ div, ...plotConfig });
            }
            case 'sunburst': {
                const { type, ...plotConfig } = config;
                void type;
                return new Sunburst({ div, ...plotConfig });
            }
            case 'radar': {
                const { type, ...plotConfig } = config;
                void type;
                return new Radar({ div, ...plotConfig });
            }
            case 'ecdf': {
                const { type, ...plotConfig } = config;
                void type;
                return new Cumulativechart({ div, ...plotConfig }, 'ecdf');
            }
            case 'pareto': {
                const { type, ...plotConfig } = config;
                void type;
                return new Cumulativechart({ div, ...plotConfig }, 'pareto');
            }
            case 'chord': {
                const { type, ...plotConfig } = config;
                void type;
                return new Chord({ div, ...plotConfig });
            }
            case 'density': {
                const { type, ...plotConfig } = config;
                void type;
                return new Densitychart({ div, ...plotConfig });
            }
            case 'violin': {
                const { type, ...plotConfig } = config;
                void type;
                return new Violin({ div, ...plotConfig });
            }
            case 'registered': {
                const { type, ...plotConfig } = config;
                void type;
                return new RegisteredPlot({ div, ...plotConfig }, registeredPlot(config.plot));
            }
            default: {
                throw new Error(`Unsupported plot type: ${config.type}`);
            }
        }
    }
}
