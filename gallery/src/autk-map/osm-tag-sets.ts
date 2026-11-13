import { runExample } from '../example';
import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

export class OsmTagSets {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            // Same area/base layers as osm-layers-pbf.ts. Custom tag sets currently require Overpass.
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads'],
            },
            tagSets: [
                {
                    name: 'playgrounds',
                    type: 'polygons',
                    tags: [{ key: 'leisure', value: 'playground' }],
                },
                {
                    name: 'paths',
                    type: 'polylines',
                    tags: [{ key: 'highway', value: 'footway' }],
                },
                {
                    name: 'food',
                    type: 'points',
                    tags: [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'restaurant' }],
                },
            ],
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();

        this.map.updateRenderInfo('table_osm_buildings', { opacity: 0.35 });
        this.map.updateRenderInfo('table_osm_food_points', { pointSize: 32 });
        this.map.updateRenderInfo('table_osm_paths_polylines', { polylinesWidth:8 });

        this.map.draw();
        this.addOpacitySlider();

    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, {
                collection: geojson,
                type: layerData.type,
            });
            if (layerData.type === 'polygons') {
                this.map.updateRenderInfo(layerData.name, { showBorders: false });
            }
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
        slider.value = '0.35';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = '0.35';
        valueDisplay.className = 'control-value';

        slider.addEventListener('input', () => {
            const opacity = parseFloat(slider.value);
            valueDisplay.textContent = opacity.toFixed(2);
            this.map.updateRenderInfo('table_osm_buildings', { opacity });
        });

        container.append(label, slider, valueDisplay);
        document.querySelector('.map-stage')!.appendChild(container);
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new OsmTagSets().run(canvas);
}
void runExample(main);
