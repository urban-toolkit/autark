import { AutkMap, LayerType } from '@urban-toolkit/autk-map';
import { AutkSpatialDb } from '@urban-toolkit/autk-db';

const OSM_LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
>;

const BATTERY_PARK_CITY_WORKSPACE = 'battery_park_city';
const FINANCIAL_DISTRICT_WORKSPACE = 'financial_district';

export class OsmLayersApi {
    protected map01!: AutkMap;
    protected map02!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas01: HTMLCanvasElement, canvas02: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.loadWorkspaceOsm(BATTERY_PARK_CITY_WORKSPACE, 'Battery Park City');
        await this.loadWorkspaceOsm(FINANCIAL_DISTRICT_WORKSPACE, 'Financial District');

        this.map01 = new AutkMap(canvas01);
        this.map02 = new AutkMap(canvas02);

        await this.map01.init();
        await this.map02.init();

        await this.loadWorkspaceLayers(BATTERY_PARK_CITY_WORKSPACE, this.map01);
        await this.loadWorkspaceLayers(FINANCIAL_DISTRICT_WORKSPACE, this.map02);

        this.map01.draw();
        this.map02.draw();
    }

    protected async loadWorkspaceOsm(workspace: string, areaName: string): Promise<void> {
        await this.db.setWorkspace(workspace);

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: [areaName],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: OSM_LAYERS,
                dropOsmTable: true,
            },
        });
    }

    protected async loadWorkspaceLayers(workspace: string, map: AutkMap): Promise<void> {
        await this.db.setWorkspace(workspace);

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} from workspace: ${workspace} of type ${layerData.type}`);
        }
    }
}

async function main() {
    const canvas01 = document.querySelector('#map01') as HTMLCanvasElement;
    const canvas02 = document.querySelector('#map02') as HTMLCanvasElement;

    if (!canvas01 || !canvas02) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas01, canvas02);
}
main();
