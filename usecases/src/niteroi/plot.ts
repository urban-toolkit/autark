import type { FeatureCollection } from 'geojson';
import { AutkPlot, PlotEvent, PlotStyle } from '@urban-toolkit/autk-plot';
import { HIGHLIGHT_COLOR } from './config';

export class NiteroiPlots {
    private readonly scatterplot: AutkPlot;
    private readonly linechart: AutkPlot;

    public constructor(scatterHost: HTMLElement, lineHost: HTMLElement, private readonly roads: FeatureCollection) {
        PlotStyle.setHighlightColor(HIGHLIGHT_COLOR);
        this.scatterplot = new AutkPlot(scatterHost, {
            type: 'scatterplot', collection: roads,
            attributes: { axis: ['compute.intercept', 'compute.angle'] },
            labels: { axis: ['Baseline LST (°C)', 'Regression angle (°)'], title: 'LST regression' },
            tickFormats: ['.1~f', '.3~f'], width: 600, height: 380, events: [PlotEvent.BRUSH],
        });
        this.linechart = new AutkPlot(lineHost, {
            type: 'linechart', collection: { type: 'FeatureCollection', features: [] },
            attributes: { axis: ['lst_timeseries', '@transform'] },
            transform: { preset: 'reduce-series', options: { timestamp: 'timestamp', value: 'value' } },
            labels: { axis: ['Year', 'LST (°C)'], title: 'Selected road LST timeseries' },
            tickFormats: ['.0f', '.1f'], width: 600, height: 280,
        });
    }

    public onSelection(onSelection: (ids: number[]) => void): void {
        this.scatterplot.events.on(PlotEvent.BRUSH, ({ selection }) => onSelection(selection));
    }

    public setSelection(ids: number[]): void {
        this.scatterplot.setSelection(ids);
    }

    public updateTimeseries(ids: number[]): void {
        this.linechart.updateCollection({
            ...this.roads,
            features: ids.flatMap((id) => this.roads.features[id] ? [this.roads.features[id]] : []),
        });
    }
}
