import type { FeatureCollection } from 'geojson';
import type { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { BUILDINGS_LAYER, ROADS_LAYER } from './data';
import type { MonthCode } from './utils';

export type DisplayMode = 'heatmap' | 'compute' | 'contribution';

export class ShadowsMap {
    private readonly map: AutkMap;

    public constructor(canvas: HTMLCanvasElement) { this.map = new AutkMap(canvas); }

    public async init(
        layers: ReturnType<AutkDb['getLayersMetadata']>,
        getLayer: (name: string) => Promise<FeatureCollection>,
        roads: FeatureCollection, buildings: FeatureCollection,
    ): Promise<void> {
        await this.map.init();
        for (const layer of layers) {
            if (layer.name === 'table_osm_roads') continue;
            const collection = layer.name === ROADS_LAYER ? roads
                : layer.name === BUILDINGS_LAYER ? buildings : await getLayer(layer.name);
            this.map.loadCollection(layer.name, {
                collection, type: layer.type,
                loadConfig: layer.type === 'buildings' ? { buildingsZeroHeight: true } : undefined,
            });
        }
        this.map.updateRenderInfo(BUILDINGS_LAYER, { isPick: true });
        this.map.updateRenderInfo(ROADS_LAYER, { isPick: true, isColorMap: true });
    }

    public onBuildingSelection(onSelection: (id: number | null) => void): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId === BUILDINGS_LAYER) onSelection(selection[0] ?? null);
        });
    }

    public updateThematic(roads: FeatureCollection, month: MonthCode, mode: DisplayMode): void {
        const property = mode === 'heatmap' ? `properties.sjoin.avg.shadows.${month}`
            : `properties.compute.${mode === 'compute' ? 'shadow' : 'contribution'}`;
        this.map.updateThematic(ROADS_LAYER, { collection: roads, property });
        this.map.draw();
    }

    public highlightRoads(ids: number[]): void {
        this.map.setHighlightedIds(ROADS_LAYER, ids);
        this.map.draw();
    }

    public highlightBuilding(id: number | null): void {
        this.map.setHighlightedIds(BUILDINGS_LAYER, id === null ? [] : [id]);
        this.map.draw();
    }
}
