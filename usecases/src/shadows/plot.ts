import type { FeatureCollection } from 'geojson';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import type { MonthCode } from './utils';

export class ShadowsPlot {
    private histogram!: AutkPlot;

    public constructor(private readonly host: HTMLElement) {}

    /** Month changes alter the attribute accessor, so recreate and rebind this plot. */
    public show(roads: FeatureCollection, month: MonthCode, onSelection: (ids: number[]) => void): void {
        this.host.replaceChildren();
        this.histogram = new AutkPlot(this.host, {
            type: 'barchart', collection: roads,
            attributes: { axis: [`sjoin.avg.shadows.${month}`, '@transform'] },
            labels: { axis: ['Accumulated shadow (dataset units)', '#Road segments'], title: 'Monthly baseline distribution' },
            width: 600, height: 380, events: [PlotEvent.BRUSH_X],
            transform: { preset: 'binning-1d', options: { bins: 13 } },
        });
        this.histogram.events.on(PlotEvent.BRUSH_X, ({ selection }) => onSelection(selection));
    }
}
