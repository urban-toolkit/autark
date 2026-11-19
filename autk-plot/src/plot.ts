import type { PlotType, UnifiedPlotConfig } from './api';

import type { EventEmitter } from '@urban-toolkit/autk-core';

import type { PlotEventRecord } from './types-events';

import { PlotBaseInteractive } from './plot-base-interactive';
import type { ProvenanceModel } from './provenance';
import type { FeatureShare } from './types-provenance';


import {
    RegisteredPlot,
    registeredPlot,
    hasRegisteredPlot,
} from './plots';

/**
 * Unified public entrypoint for autk-plot plot creation and interaction.
 *
 * `AutkPlot` draws any registered plot (the built-in `scatterplot`, `barchart`,
 * `parallel-coordinates`, `table`, `linechart`, `heatmatrix`, `boxplot`, `sankey`, `pie`,
 * `donut`, `areachart`, `bubble`, `hexbin`, `calendar`, `waffle`, `stackedbar`, `treemap`,
 * `sunburst`, `radar`, `ecdf`, `pareto`, `chord`, `density`, `violin`, or a user plot through
 * `{ type: 'registered', plot }`) behind a single constructor and a stable API for selection and
 * event handling.
 *
 * Every plot is a definition drawn by `RegisteredPlot`; the wrapper delegates all behavior to it
 * while exposing a plot-agnostic interface.
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
    /** Plot drawing the configured definition. */
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
     * Gets the underlying plot instance.
     *
     * This is mainly useful for advanced scenarios that require direct access to the drawing
     * (its data, scales, and selection state).
     *
     * @returns The plot instance that draws the plot.
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
     * @returns Typed event dispatcher of the plot.
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
     * Triggers a synchronous redraw of the plot.
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
     * Draws the registered definition named by the configuration: `config.plot`
     * for `{ type: 'registered' }`, or the built-in plot `config.type`.
     *
     * @param div Host HTML element where the plot should render.
     * @param config Discriminated plot configuration.
     * @returns Plot instance drawing that definition.
     * @throws If no plot is registered under the name.
     */
    private createPlot(div: HTMLElement, config: UnifiedPlotConfig): PlotBaseInteractive {
        switch (config.type) {
            case 'registered': {
                const { type, ...plotConfig } = config;
                void type;
                return new RegisteredPlot({ div, ...plotConfig }, registeredPlot(config.plot));
            }
            default: {
                // Built-in plots are definitions registered like user plots.
                const { type, ...plotConfig } = config;
                if (!hasRegisteredPlot(type)) throw new Error(`Unsupported plot type: ${type}`);
                return new RegisteredPlot({ div, ...plotConfig }, registeredPlot(type));
            }
        }
    }
}
