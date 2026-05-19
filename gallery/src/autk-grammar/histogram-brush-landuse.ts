import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class HistogramBrushLanduse {
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
                axis: ['landuse', '@transform'],
                title: 'Land Use Histogram Example',
                transform: { preset: 'binning-1d' },
                margins: { left: 60, right: 20, top: 50, bottom: 80 },
                width: 790,
                events: ['brushX'],
                mapRef: 'neighborhoods',
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new HistogramBrushLanduse().run(); }
main();
