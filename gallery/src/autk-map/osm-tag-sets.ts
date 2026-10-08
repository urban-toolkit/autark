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
        this.addOpacitySlider(canvas);

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
        slider.value = '0.35';
        slider.style.width = '100px';

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = '0.35';
        valueDisplay.style.cssText = 'min-width: 2.5em; text-align: right; color: #555;';

        slider.addEventListener('input', () => {
            const opacity = parseFloat(slider.value);
            valueDisplay.textContent = opacity.toFixed(2);
            this.map.updateRenderInfo('table_osm_buildings', { opacity });
        });

        container.append(label, slider, valueDisplay);
        document.body.appendChild(container);
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new OsmTagSets().run(canvas);
}
main().catch(error => {
    console.error(error);
});
