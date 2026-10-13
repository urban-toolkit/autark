import type { FeatureCollection } from 'geojson';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { ColorMapInterpolator, ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import { HIGHLIGHT_COLOR, ROADS_LAYER, START_YEAR, yearBand, type ColorMode } from './config';

type RasterCollection = Awaited<ReturnType<AutkDb['getRaster']>>;
type LayerMetadata = ReturnType<AutkDb['getLayersMetadata']>;

export class NiteroiMap {
    private readonly map: AutkMap;

    public constructor(canvas: HTMLCanvasElement) {
        this.map = new AutkMap(canvas);
    }

    public async init(
        layers: LayerMetadata,
        getLayer: (name: string) => Promise<FeatureCollection>,
        roads: FeatureCollection,
        raster: RasterCollection,
    ): Promise<void> {
        await this.map.init();
        this.map.style.setHighlightColor(HIGHLIGHT_COLOR);
        for (const layer of layers) {
            const collection = layer.name === ROADS_LAYER ? roads : await getLayer(layer.name);
            this.map.loadCollection(layer.name, { collection, type: layer.type });
        }
        this.map.updateRenderInfo(ROADS_LAYER, { isPick: true });
        this.map.loadCollection('lst', { collection: raster, type: 'raster', property: yearBand(START_YEAR) });
        this.map.updateRenderInfo('lst', { isSkip: true, opacity: 0.65 });
    }

    public updateThematic(roads: FeatureCollection, raster: RasterCollection, mode: ColorMode, year: number): void {
        const band = yearBand(year);
        this.map.updateColorMap(ROADS_LAYER, { colorMap: {
            interpolator: mode === 'angle' ? ColorMapInterpolator.DIV_RED_BLUE : ColorMapInterpolator.SEQ_REDS,
            domainSpec: mode === 'angle'
                ? { type: ColorMapDomainStrategy.PERCENTILE, params: [2, 98] }
                : { type: ColorMapDomainStrategy.MIN_MAX },
        } });
        this.map.updateThematic(ROADS_LAYER, { collection: roads,
            property: mode === 'angle' ? 'properties.compute.angle' : `properties.lst_timeseries.${year - START_YEAR}.value`,
        });
        this.map.updateRenderInfo(ROADS_LAYER, { isColorMap: true });
        this.map.updateRaster('lst', { collection: raster, property: band });
        this.map.draw();
    }

    public onSelection(onSelection: (ids: number[]) => void): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId === ROADS_LAYER) onSelection(selection);
        });
    }

    public highlight(ids: number[]): void {
        this.map.setHighlightedIds(ROADS_LAYER, ids);
        this.map.draw();
    }
}
