import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import type { Feature, FeatureCollection } from 'geojson';

const LAYER = 'table_osm_buildings';
const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

export class BuildingHidingVis {
    protected map!: AutkMap;
    protected db!: AutkDb;
    protected buildings!: FeatureCollection;
    protected selectedId: number | null = null;
    protected hiddenIds = new Set<number>();
    protected hideButton = document.querySelector<HTMLButtonElement>('#hide-selected')!;
    protected restoreButton = document.querySelector<HTMLButtonElement>('#restore-all')!;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
            },
        });

        this.buildings = await this.db.getLayer(LAYER);

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();

        this.map.updateRenderInfo(LAYER, { isPick: true });
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId !== LAYER) return;

            if (selection.length === 0) {
                this.selectedId = null;
                this.map.setHighlightedIds(LAYER, []);
                this.resetPanel();
                this.updateControls();
                return;
            }

            const pickedId = selection[selection.length - 1];
            this.selectedId = pickedId;
            this.map.setHighlightedIds(LAYER, [pickedId]);
            this.showBuildingInfo(pickedId);
            this.updateControls();
        });

        this.hideButton.addEventListener('click', () => this.hideSelected());
        this.restoreButton.addEventListener('click', () => this.restoreAll());
        this.map.draw();
        this.resetPanel();
        this.updateControls();
    }

    protected hideSelected(): void {
        const id = this.selectedId;
        if (id === null || this.hiddenIds.has(id)) return;

        // setSkippedIds toggles each ID; send only the newly hidden building.
        this.map.setSkippedIds(LAYER, [id]);
        this.hiddenIds.add(id);
        this.clearSelection();
    }

    protected restoreAll(): void {
        this.map.clearSkippedIds(LAYER);
        this.hiddenIds.clear();
        this.clearSelection();
    }

    protected clearSelection(): void {
        this.selectedId = null;
        this.map.setHighlightedIds(LAYER, []);
        this.resetPanel();
        this.updateControls();
    }

    protected updateControls(): void {
        this.hideButton.disabled = this.selectedId === null;
        this.restoreButton.disabled = this.hiddenIds.size === 0;
        const status = document.getElementById('visibility-status');
        if (status) status.textContent = `${this.hiddenIds.size} ${this.hiddenIds.size === 1 ? 'building' : 'buildings'} hidden`;
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = layerData.name === LAYER
                ? this.buildings
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
        }
    }

    protected showBuildingInfo(pickedId: number): void {
        const feature = this.buildings.features[pickedId] as Feature;
        if (!feature) return;

        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const get = (...keys: string[]): string => {
            for (const k of keys) {
                const v = props[k];
                if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
            }
            return '—';
        };

        const levels = get('building:levels', 'levels');
        const heightRaw = get('height');
        const height = heightRaw !== '—'
            ? heightRaw
            : levels !== '—' ? `~${(Number(levels) * 3).toFixed(0)} m (est.)` : '—';

        this.updatePanel({
            title: get('name', 'addr:housename') !== '—'
                ? get('name', 'addr:housename')
                : `Building ${pickedId}`,
            osmId: get('id', 'osm_id', '@id'),
            type: get('building'),
            height,
            levels,
            address: [get('addr:housenumber'), get('addr:street')]
                .filter(v => v !== '—').join(' ') || '—',
        });
        this.setSelectionState(true);
    }

    protected resetPanel(): void {
        this.updatePanel({ title: 'No building selected', osmId: '—', type: '—', height: '—', levels: '—', address: '—' });
        this.setSelectionState(false);
    }

    protected setSelectionState(selected: boolean): void {
        const label = document.getElementById('info-selection');
        const help = document.getElementById('info-help');
        if (label) label.textContent = selected ? 'Selected building' : 'Awaiting selection';
        if (help) help.textContent = selected
            ? 'Double-click another building to compare its attributes.'
            : 'Double-click a building on the map to see its details here.';
    }

    protected updatePanel(values: {
        title: string;
        osmId: string;
        type: string;
        height: string;
        levels: string;
        address: string;
    }): void {
        const set = (id: string, text: string) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        set('info-title', values.title);
        set('info-osm-id', values.osmId);
        set('info-type', values.type);
        set('info-height', values.height);
        set('info-levels', values.levels);
        set('info-address', values.address);
    }
}

async function main(): Promise<void> {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    const status = document.querySelector<HTMLElement>('#map-status');
    const stage = document.querySelector<HTMLElement>('.map-stage');
    try {
        if (status) status.textContent = 'Loading bundled buildings…';
        await new BuildingHidingVis().run(canvas);
        if (status) status.textContent = 'Interactive map';
    } catch (error) {
        if (status) {
            status.textContent = 'Unable to load map. Check the console for details.';
            status.dataset.state = 'error';
        }
        console.error('Unable to initialize the building hiding example:', error);
    } finally {
        stage?.setAttribute('aria-busy', 'false');
    }
}
main();
