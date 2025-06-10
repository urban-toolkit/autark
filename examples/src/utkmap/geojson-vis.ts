import { SpatialDb } from 'utkdb';
import { UtkMap, LayerType, IBoundingBox } from 'utkmap';

import { Example } from '../example';

export class GeojsonVis extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    protected canvas!: HTMLCanvasElement;

    constructor() {
        super();
    }

    public buildHtml() {
        const app = document.querySelector('#app') as HTMLElement | null;

        this.canvas = document.createElement('canvas');
        const div = document.createElement('div');

        if (!app || !div || !this.canvas) { return; }

        this.canvas.width = this.canvas.height = this.canvas.parentElement?.clientHeight || 800;

        div.style.display = 'flex';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'center';
        div.style.width = '800px';

        div.innerHTML = '<h2>geojson-vis.ts</h2>';

        if (app) {
            app.appendChild(div);
            app.appendChild(this.canvas);
        }
    }

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        // CHECK: Compute the bomding box even if there is no osm data
        const boundingBox: IBoundingBox = { 
            minLon: 4940354.793551397,
            minLat: -8239795.593876557,
            maxLon: 4942534.993601108,
            maxLat: -8237537.099519547
        }

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        this.map = new UtkMap(this.canvas);
        await this.map.init(boundingBox);

        await this.loadLayers();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
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
}