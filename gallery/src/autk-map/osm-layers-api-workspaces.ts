import { runExample } from '../example';
import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

const OSM_LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
>;

const BATTERY_PARK_CITY_WORKSPACE = 'battery_park_city';
const FINANCIAL_DISTRICT_WORKSPACE = 'financial_district';

export class OsmLayersApi {
    protected map01!: AutkMap;
    protected map02!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas01: HTMLCanvasElement, canvas02: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.loadWorkspaceOsm(BATTERY_PARK_CITY_WORKSPACE, [-74.019, 40.707, -74.012, 40.719]);
        await this.loadWorkspaceOsm(FINANCIAL_DISTRICT_WORKSPACE, [-74.014, 40.700, -74.003, 40.713]);

        this.map01 = new AutkMap(canvas01);
        this.map02 = new AutkMap(canvas02);

        await this.map01.init();
        await this.map02.init();

        await this.loadWorkspaceLayers(BATTERY_PARK_CITY_WORKSPACE, this.map01);
        await this.loadWorkspaceLayers(FINANCIAL_DISTRICT_WORKSPACE, this.map02);

        this.map01.fitBounds();
        this.map02.fitBounds();
        this.map01.draw();
        this.map02.draw();
        window.addEventListener('pagehide', () => { this.map01.destroy(); this.map02.destroy(); }, { once: true });
    }

    protected async loadWorkspaceOsm(workspace: string, bbox: [number, number, number, number]): Promise<void> {
        await this.db.setWorkspace(workspace);

        await this.db.loadOsm({
            pbfFileUrl: `${(import.meta as any).env.BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: { bbox },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: OSM_LAYERS,
            },
        });
    }

    protected async loadWorkspaceLayers(workspace: string, map: AutkMap): Promise<void> {
        await this.db.setWorkspace(workspace);

        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);
            map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
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
void runExample(main);
