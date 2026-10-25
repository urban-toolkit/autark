/**
 * Orchestration of the case study: the regions, the Autark map, the 24 linked
 * plots, and the plots drawn by the two labs.
 *
 * Every plot forwards its selection, with feature shares when it aggregates
 * rows, to all the others and to the map, and each one paints only the part
 * of its marks that the selection produces. Picking regions on the map selects
 * them in every plot. The page filter keeps only the regions that meet its
 * condition in every plot (exclusion, 1:0); the map keeps all regions, so
 * picking an excluded one shows, in each plot's provenance path, where and why
 * it was lost.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { PlotEventData, UnifiedPlotConfig } from '@urban-toolkit/autk-plot';

import { loadRegions } from './data';
import type { Collection } from './data';
import type { LabPlotConfig } from './lab-transform';
import { ProvenanceMap } from './map';
import { movingAverage } from './moving-average';
import { PLOTS, createPlot, withReducer } from './plot';
import type { PlotSettings } from './plot';

/** A lab: where its plot is drawn and reported, and the config it last passed. */
export type Lab = {
    box: HTMLElement;
    message: HTMLElement;
    config: LabPlotConfig | null;
    plot?: next.AutkPlot;
};

// User-defined transforms are registered once, before any plot uses them.
next.registerTransform(movingAverage);

export class ProvenanceApp {
    private regions!: Collection;
    private map?: ProvenanceMap;
    private plots: next.AutkPlot[] = [];
    private labs: Lab[] = [];
    private settings: PlotSettings = { reducer: 'count', filter: null };
    /** Last selection sent between views, so a lab plot drawn later starts in sync. */
    private current: PlotEventData | null = null;

    /**
     * Loads the data, the map, and the plots.
     *
     * @param args Map canvas, the containers of the two labs, and progress and error reporting.
     * @throws If the datasets cannot be loaded.
     */
    public async init(args: {
        canvas: HTMLCanvasElement;
        labs: Omit<Lab, 'config' | 'plot'>[];
        onProgress: (message: string, note?: string) => void;
        onError: (error: unknown) => void;
    }): Promise<void> {
        args.onProgress('Loading regions and noise complaints...');
        this.regions = await loadRegions();
        this.labs = args.labs.map(lab => ({ ...lab, config: null }));
        args.onProgress('Initializing map...');
        this.map = await ProvenanceMap.load(args.canvas, this.regions);
        this.map?.onSelection(selection => {
            try {
                this.select({ selection }, null);
            } catch (error) {
                args.onError(error);
            }
        });
        args.onProgress('Drawing 24 linked charts...');
        this.build();
    }

    /** Regions with their complaints, as every plot reads them. */
    public get collection(): Collection {
        return this.regions;
    }

    /** Whether the Autark map loaded (it needs WebGPU). */
    public get hasMap(): boolean {
        return this.map !== undefined;
    }

    /** Brings the map back to the initial view of all regions. */
    public resetMapView(): void {
        this.map?.fit();
    }

    /** Changes the page settings and rebuilds every plot (the selection is reset). */
    public configure(settings: Partial<PlotSettings>): void {
        this.settings = { ...this.settings, ...settings };
        this.build();
    }

    /** Rebuilds every plot with the current settings. */
    public build(): void {
        this.plots.forEach(plot => plot.destroy());
        this.map?.clear();
        this.current = null;
        // A chart that refuses the settings says so in its card; the others still draw and link.
        this.plots = [];
        for (const entry of PLOTS) {
            const div = document.querySelector<HTMLElement>(entry.div)!;
            try {
                const plot = createPlot(div, withReducer(entry.config, this.settings.reducer), entry.event, this.regions, this.settings);
                plot.events.on(entry.event, data => this.select(data, plot));
                this.plots.push(plot);
            } catch (error) {
                div.replaceChildren();
                div.textContent = `Not drawn with these settings: ${(error as Error).message}`;
            }
        }
        // A lab plot that no longer draws under the new settings says so in its lab.
        for (const lab of this.labs) {
            const error = this.mountLab(lab);
            if (error) {
                lab.message.textContent = `The chart no longer draws with the new page settings: ${error}`;
                lab.message.className = 'lab-message error';
            }
        }
    }

    /**
     * Draws (or, with `null`, removes) the plot of a lab.
     *
     * @returns The error message when the plot refuses the config.
     */
    public setLabPlot(index: number, config: LabPlotConfig | null): string | undefined {
        this.labs[index].config = config;
        return this.mountLab(this.labs[index]);
    }

    /** Clears the selection in every view. */
    public clear(): void {
        this.views().forEach(plot => plot.setSelection([]));
        this.map?.clear();
        this.current = null;
    }

    /** The 24 plots and the drawn lab plots. */
    private views(): next.AutkPlot[] {
        return [...this.plots, ...this.labs.flatMap(lab => (lab.plot ? [lab.plot] : []))];
    }

    /** Sends a selection from one view (or the map, `null`) to all the others. */
    private select(data: PlotEventData, from: next.AutkPlot | null): void {
        this.views().forEach(plot => {
            if (plot !== from) plot.setSelection(data.selection, data.shares);
        });
        if (from) this.map?.highlight(data.selection);
        this.current = data;
    }

    /** Draws a lab's plot with the page's settings; returns the error when the plot refuses it. */
    private mountLab(lab: Lab): string | undefined {
        lab.plot?.destroy();
        lab.box.replaceChildren();
        lab.plot = undefined;
        if (!lab.config) return undefined;
        const event = lab.config.events?.[0] ?? next.PlotEvent.CLICK;
        let plot: next.AutkPlot;
        try {
            plot = createPlot(lab.box, lab.config as UnifiedPlotConfig, event, this.regions, this.settings);
        } catch (error) {
            lab.box.replaceChildren();
            return (error as Error).message;
        }
        lab.plot = plot;
        plot.events.on(event, data => this.select(data, plot));
        if (this.current) plot.setSelection(this.current.selection, this.current.shares);
        return undefined;
    }

    /** Plots and map, for inspection from the browser console (always the current ones). */
    public get inspection(): Record<string, unknown> {
        const app = this;
        return {
            get map() { return app.map; },
            get plots() { return app.plots; },
            get lab() { return app.labs[0]?.plot; },
            get plotLab() { return app.labs[1]?.plot; },
        };
    }
}
