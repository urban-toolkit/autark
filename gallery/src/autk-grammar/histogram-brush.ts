import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class HistogramBrush {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: 'map-canvas',
            plot: 'plotBody',
        });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'geojson',
                geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs_proj.geojson',
                outputTableName: 'neighborhoods',
                coordinateFormat: 'EPSG:3395',
            }],
            map: {
                layerRefs: [{ dataRef: 'neighborhoods' }],
            },
            plot: {
                dataRef: 'neighborhoods',
                mark: 'bar',
                axis: ['shape_area', '@transform'],
                title: 'Histogram example',
                transform: { preset: 'binning-1d', options: { bins: 10 } },
                margins: { left: 60, right: 20, top: 50, bottom: 80 },
                width: 790,
                events: ['brushX'],
                mapRef: 'neighborhoods',
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new HistogramBrush().run(); }
main();
