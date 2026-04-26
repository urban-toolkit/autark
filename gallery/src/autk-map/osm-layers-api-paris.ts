import { AutkMap, LayerType } from 'autk-map';
import { AutkSpatialDb } from 'autk-db';

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Île-de-France',
                areas: ['Paris'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();
        this.addOpacitySlider(canvas);
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
            console.log(`Layer ${layerData.name} has ${geojson.features.length} features`);
        }
    }

    private addOpacitySlider(canvas: HTMLCanvasElement): void {
        const container = document.createElement('div');
        const rect = canvas.getBoundingClientRect();
        container.style.cssText = `
            position: fixed;
            top: ${rect.top + 16}px;
            right: ${window.innerWidth - rect.right + 16}px;
            background: rgba(255,255,255,0.9);
            padding: 10px 14px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            font-family: system-ui, sans-serif;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 20;
        `;

        const label = document.createElement('label');
        label.textContent = 'Buildings';
        label.style.color = '#333';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = '1';
        slider.style.width = '100px';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = '1.00';
        valueDisplay.style.cssText = 'min-width: 2.5em; text-align: right; color: #555;';

        slider.addEventListener('input', () => {
            const opacity = parseFloat(slider.value);
            valueDisplay.textContent = opacity.toFixed(2);
            this.map.updateRenderInfo('table_osm_buildings', { opacity });
        });

        container.appendChild(label);
        container.appendChild(slider);
        container.appendChild(valueDisplay);

        document.body.appendChild(container);
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas);
}
main();
