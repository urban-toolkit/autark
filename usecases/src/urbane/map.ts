import type { FeatureCollection } from 'geojson';
import type { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import { ROAD_SKY_VIEW_FIELD, SKY_EXPOSURE_FIELD } from './compute';
import type { UrbaneLevel } from './config';

export class UrbaneMap {
    private readonly map: AutkMap;

    public constructor(canvas: HTMLCanvasElement) { this.map = new AutkMap(canvas); }

    public async init(
        layers: ReturnType<AutkDb['getLayersMetadata']>,
        getLayer: (name: string) => Promise<FeatureCollection>,
        neighborhoods: FeatureCollection, roadsWithSky: FeatureCollection,
    ): Promise<void> {
        await this.map.init();
        for (const layer of layers) {
            if (layer.type === 'points') continue;
            const collection = layer.name === 'neighborhoods' ? neighborhoods
                : layer.name === 'table_osm_roads' ? roadsWithSky : await getLayer(layer.name);
            this.map.loadCollection(layer.name, { collection, type: layer.type });
        }
        this.map.updateRenderInfo('table_osm_buildings', { isPick: false });
        this.map.updateRenderInfo('neighborhoods', { opacity: 0.75, isPick: true, isSkip: false });
        this.map.updateColorMap('table_osm_roads', { colorMap: {
            domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [5, 95] },
        } });
        this.map.updateThematic('table_osm_roads', { collection: roadsWithSky, property: `properties.${ROAD_SKY_VIEW_FIELD}` });
        this.map.updateRenderInfo('table_osm_roads', { isColorMap: true });
        this.map.draw();
    }

    public updateThematic(level: UrbaneLevel, collection: FeatureCollection, column: string): void {
        if (column === 'none') {
            this.map.updateRenderInfo(level, { isColorMap: false });
        } else {
            this.map.updateColorMap(level, { colorMap: {
                domainSpec: column === SKY_EXPOSURE_FIELD || column === ROAD_SKY_VIEW_FIELD
                    ? { type: ColorMapDomainStrategy.PERCENTILE, params: [5, 95] }
                    : { type: ColorMapDomainStrategy.MIN_MAX },
            } });
            this.map.updateThematic(level, { collection, property: `properties.${column}` });
            this.map.updateRenderInfo(level, { isColorMap: true });
        }
        this.map.draw();
    }

    public onSelection(onSelection: (level: string, ids: number[]) => void): void {
        this.map.events.on(MapEvent.PICKING, ({ layerId, selection }) => onSelection(layerId, selection));
    }

    public highlight(level: UrbaneLevel, ids: number[]): void {
        this.map.setHighlightedIds(level, ids);
        this.map.draw();
    }

    public showBuildings(collection: FeatureCollection): void {
        this.map.loadCollection('active_buildings', { collection, type: 'buildings' });
        this.map.updateRenderInfo('table_osm_buildings', { isSkip: true });
        this.map.updateRenderInfo('neighborhoods', { isSkip: true, isPick: false });
        this.map.updateRenderInfo('active_buildings', { isSkip: false, isPick: true });
        this.map.draw();
    }

    public showNeighborhoods(): void {
        this.map.removeLayer('active_buildings');
        this.map.updateRenderInfo('table_osm_buildings', { isSkip: false, isPick: false });
        this.map.updateRenderInfo('neighborhoods', { isSkip: false, isPick: true });
        this.highlight('neighborhoods', []);
    }
}
