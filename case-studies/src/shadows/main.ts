
import { Feature, FeatureCollection } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, VectorLayer } from 'autk-map';
import { Barchart, PlotEvent } from 'autk-plot';

export class Shadows {
    protected map!: AutkMap;
    protected db!: SpatialDb;
    protected histogram!: Barchart;

    protected roads!: FeatureCollection;
    protected currentMonth: string = 'none';

    protected mapCanvas!: HTMLCanvasElement;
    protected histogramDiv!: HTMLElement;

    public async run(canvas: HTMLCanvasElement, histogramDiv: HTMLElement): Promise<void> {
        this.mapCanvas = canvas;
        this.histogramDiv = histogramDiv;

        await this.loadDb();
        await this.loadMap();

        this.reloadHistogram(this.currentMonth);
        this.updateHistogramListeners();
    }

    // ── Database ──────────────────────────────────────────────────────────────

    protected async loadDb(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'Chicago',
                areas: ['Loop', 'Near South Side'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads'] as Array<
                    'surface' | 'parks' | 'water' | 'roads'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: `http://localhost:5173/data/shadows_chicago.csv`,
            outputTableName: 'shadows',
            geometryColumns: {
                latColumnName: 'latitude',
                longColumnName: 'longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        for (const month of ['jun', 'sep', 'dez']) {
            await this.db.spatialJoin({
                tableRootName: 'table_osm_roads',
                tableJoinName: 'shadows',
                spatialPredicate: 'NEAR',
                nearDistance: 100,
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: 'shadows',
                        column: month,
                        aggregateFn: 'avg',
                        aggregateFnResultColumnName: month,
                    }],
                },
            });
        }

        this.roads = await this.db.getLayer('table_osm_roads');
    }

    // ── Map ───────────────────────────────────────────────────────────────────

    protected async loadMap(): Promise<void> {
        this.map = new AutkMap(this.mapCanvas);
        await this.map.init();

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
        }
        this.map.draw();
    }

    protected updateThematicData(month: string): void {
        if (month === 'none') {
            this.map.updateRenderInfoProperty('table_osm_roads', 'isColorMap', false);
            this.map.draw();
            return;
        }

        const getFnv = (feature: Feature) => {
            return (feature.properties?.sjoin as any)?.avg?.[month] || 0;
        };

        this.map.updateGeoJsonLayerThematic('table_osm_roads', this.roads, getFnv);

        this.map.updateRenderInfoProperty('table_osm_roads', 'isPick', true);
        this.map.updateRenderInfoProperty('table_osm_roads', 'isColorMap', true);

        this.map.draw();
    }

    public changeMonth(month: string): void {
        this.currentMonth = month;
        this.updateThematicData(month);
        this.reloadHistogram(month);
        this.updateHistogramListeners();
    }

    // ── Histogram ─────────────────────────────────────────────────────────────

    protected reloadHistogram(month: string): void {
        this.histogramDiv.innerHTML = '';

        this.histogram = new Barchart({
            div: this.histogramDiv,
            data: this.roads,
            labels: { axis: ['Hours of shadow', '#Road segments'], title: 'Shadow distribution' },
            width: 600,
            height: 380,
            events: [PlotEvent.BRUSH_X],
            histogram: {
                column: `sjoin.avg.${month}`,
                numBins: 13,
                divisor: 60,
                labelSuffix: 'h',
            },
        });
    }

    protected updateHistogramListeners(): void {
        this.histogram.plotEvents.addEventListener(PlotEvent.BRUSH_X, (roadIds: number[]) => {
            const layer = this.map.layerManager.searchByLayerId('table_osm_roads');
            (<VectorLayer>layer)?.setHighlightedIds(roadIds);
            this.map.draw();
        });
    }

}

async function main() {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const histogramDiv = document.querySelector('#histogramBody') as HTMLElement;

    if (!canvas || !histogramDiv) {
        console.error('Canvas or histogram element not found');
        return;
    }

    const shadows = new Shadows();
    await shadows.run(canvas, histogramDiv);

    (window as any).shadows = shadows;
    window.dispatchEvent(new CustomEvent('shadows-ready'));
}
main();
