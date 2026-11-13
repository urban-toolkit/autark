import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

const BASE_URL = (import.meta as any).env.BASE_URL;

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads', 'buildings']
            },
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();
        this.addOpacitySlider();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    private addOpacitySlider(): void {
        const container = document.createElement('div');
        container.className = 'opacity-control';

        const label = document.createElement('label');
        label.textContent = 'Building opacity';
        label.htmlFor = 'building-opacity';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'building-opacity';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = '1';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = '1.00';
        valueDisplay.className = 'control-value';

        slider.addEventListener('input', () => {
            const opacity = parseFloat(slider.value);
            valueDisplay.textContent = opacity.toFixed(2);
            this.map.updateRenderInfo('table_osm_buildings', { opacity });
        });

        container.appendChild(label);
        container.appendChild(slider);
        container.appendChild(valueDisplay);

        document.querySelector('.map-stage')!.appendChild(container);
    }
}
