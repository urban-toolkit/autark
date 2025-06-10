import { UtkMap, LayerType } from 'utkmap';
import { SpatialDb } from 'utkdb';

import { Example } from '../example';

export class OsmLayersApi extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    protected canvas!: HTMLCanvasElement;

    constructor() {
        super();
    }

    public buildHtmlNodes() {
        const app = document.querySelector('#app') as HTMLElement | null;

        this.canvas = document.createElement('canvas');
        const div = document.createElement('div');

        if (!app || !div || !this.canvas) { return; }

        this.canvas.width = this.canvas.height = this.canvas.parentElement?.clientHeight || 800;

        div.style.display = 'flex';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'center';
        div.style.width = '800px';

        div.innerHTML = '<h2>osm-layers-api.ts</h2>';

        if (app) {
            app.appendChild(div);
            app.appendChild(this.canvas);
        }
    }

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            boundingBox: {
                minLon: -74.0217296397,
                minLat: 40.6989916231,
                maxLon: -74.0005168092,
                maxLat: 40.7131479624,
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'coastline',
                    'parks',
                    'water',
                    'roads',
                    'buildings',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        this.map = new UtkMap(this.canvas);
        await this.map.init(this.db.getOsmBoundingBox());
        await this.loadLayers();

        this.map.draw();
    }

    async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.tables) {

            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }

    public print(): void { }
}