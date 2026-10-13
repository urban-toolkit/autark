import type { FeatureCollection } from 'geojson';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { SCORE_FIELD, SKY_EXPOSURE_FIELD } from './compute';
import type { UrbaneLevel } from './config';

export class UrbanePlots {
    private table!: AutkPlot;
    private parallel!: AutkPlot;

    public constructor(private readonly parallelHost: HTMLElement, private readonly tableHost: HTMLElement) {}

    public show(level: UrbaneLevel, datasets: string[], collection: FeatureCollection, onSelection: (ids: number[]) => void): void {
        this.parallelHost.replaceChildren();
        this.tableHost.replaceChildren();
        const attributes = [...datasets.map((dataset) => `sjoin.count.${dataset}`), SKY_EXPOSURE_FIELD, SCORE_FIELD];
        const labels = [...datasets, 'sky exposure', 'score'];
        const title = `${level} characteristics`;
        this.parallel = new AutkPlot(this.parallelHost, {
            type: 'parallel-coordinates', collection,
            attributes: { axis: attributes }, labels: { axis: labels, title },
            width: 790, events: [PlotEvent.BRUSH_Y],
        });
        this.table = new AutkPlot(this.tableHost, {
            type: 'table', collection,
            attributes: { axis: [level === 'neighborhoods' ? 'ntaname' : 'addr:street', ...attributes] },
            labels: { axis: ['Id', ...labels], title }, width: 790, events: [PlotEvent.CLICK],
        });
        this.table.events.on(PlotEvent.CLICK, ({ selection }) => {
            this.parallel.setSelection(selection);
            onSelection(selection);
        });
        this.parallel.events.on(PlotEvent.BRUSH_Y, ({ selection }) => {
            this.table.setSelection(selection);
            onSelection(selection);
        });
    }

    public updateCollection(collection: FeatureCollection): void {
        this.table.updateCollection(collection);
        this.parallel.updateCollection(collection);
    }

    public setSelection(ids: number[]): void {
        this.table.setSelection(ids);
        this.parallel.setSelection(ids);
    }
}
