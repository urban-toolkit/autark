import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { AutkMap } from '@urban-toolkit/autk-map';

import { MapEvent } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class MapD3 {
    protected map!: AutkMap;
    protected plot!: AutkPlot;

    protected geojson!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {
        this.geojson = await fetch(`${URL}data/mnt_neighs_proj.geojson`).then(res => res.json());

        await this.loadAutkMap(canvas);
        await this.loadAutkPlot(plotDiv);

        this.updateMapListeners();
        this.updatePlotListeners();
    }

    protected async loadAutkMap(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
        await this.map.init();

        this.map.loadCollection('neighborhoods', { collection: this.geojson });
        this.map.updateRenderInfo('neighborhoods', { isPick: true });

        this.map.draw();
    }

    protected async loadAutkPlot(plotDiv: HTMLElement) {
        this.plot = new AutkPlot(plotDiv, {
            type: 'barchart',
            collection: this.geojson,
            attributes: { axis: ['shape_area', '@transform'] },
            labels: {
                axis: ['area range', 'neighborhoods count'],
                title: 'Barchart rebuild example',
            },
            transform: {
                preset: 'binning-1d',
                options: { bins: 10 },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 100 },
            width: 790,
            events: [PlotEvent.CLICK]
        });

        // Rebuild with a fresh collection instance to exercise the redraw path that
        // previously reused transformed attribute names instead of source columns.
        window.setTimeout(() => {
            const rebuiltCollection: FeatureCollection<Geometry, GeoJsonProperties> = {
                type: 'FeatureCollection',
                features: this.geojson.features
                    .slice(0, Math.max(1, this.geojson.features.length - 5))
                    .map((feature) => ({
                        ...feature,
                        properties: feature.properties ? { ...feature.properties } : feature.properties,
                    })),
            };

            this.plot.updateCollection(rebuiltCollection);
        }, 1500);
    }

    protected async updateMapListeners() {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => {
            this.plot.setSelection(selection);
        });
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.events.on(PlotEvent.CLICK, ({ selection }) => {
            this.map.setHighlightedIds(layerId, selection);
        });
    }
}

async function main() {
    const example = new MapD3();
    
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const plotBdy = document.querySelector('#plotBody') as HTMLElement;

    if (!canvas || !plotBdy) {
        console.error('Canvas or plot body element not found');
        return;
    }

    await example.run(canvas, plotBdy);
}
main();
