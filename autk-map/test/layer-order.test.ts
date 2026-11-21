import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { LayerManager } from '../src/layer-manager';
import { FlatMapRenderPath } from '../src/map-flat';
import { Triangles3DLayer } from '../src/layer-triangles3D';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';
import type { LoadCollectionParams } from '../src/api';
import type { LayerData, LayerInfo, LayerRenderInfo } from '../src/types-layers';

afterEach(() => vi.restoreAllMocks());

const square = (half: number): FeatureCollection => ({ type: 'FeatureCollection', features: [{
    type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
        [-half, -half], [half, -half], [half, half], [-half, half], [-half, -half],
    ]] },
}] });

/** The layers of a map of a neighborhood: its ground and a plaza on it, a heat raster, its roads and its bus stops. */
const SOURCES: Record<string, LoadCollectionParams> = {
    surface: { collection: square(100), type: 'surface' },
    plaza: { collection: square(40), type: 'surface' },
    heat: {
        collection: { type: 'FeatureCollection', bbox: [-100, -100, 100, 100], features: [
            { type: 'Feature', geometry: null, properties: { rasterResX: 2, rasterResY: 2, band: [1, 2, 3, 4] } },
        ] },
        type: 'raster',
        property: 'band',
    },
    roads: {
        collection: { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { highway: 'primary' }, geometry: { type: 'LineString', coordinates: [[-80, 0], [80, 0]] } },
            { type: 'Feature', properties: { highway: 'residential' }, geometry: { type: 'LineString', coordinates: [[0, -80], [0, 80]] } },
        ] },
        type: 'roads',
    },
    stops: {
        collection: { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 10] } },
        ] },
        type: 'points',
    },
};

/** A map that loads its layers through a real LayerManager, without the GPU pipelines AutkMap would create. */
function mapWithoutGpu() {
    const map = Object.create(AutkMap.prototype) as any;
    const ui = { refreshLayerList: vi.fn(), refreshLegend: vi.fn() };
    const requestRender = vi.fn();
    map._layerManager = new LayerManager();
    map._ui = ui;
    map.requestRender = requestRender;
    map.createLayer = (info: LayerInfo, render: LayerRenderInfo, data: LayerData) => map._layerManager.addLayer(info, render, data);
    return { map: map as AutkMap, ui, requestRender };
}

/** Loads the layers named, in that order: the sources above, and `buildings` as a mesh. */
function load(map: AutkMap, ids: string[]): void {
    for (const id of ids) {
        if (id === 'buildings') {
            map.loadMesh(id, {
                geometry: [{ position: new Float32Array([-30, -30, 40, 30, -30, 40, 0, 30, 40]), indices: new Uint32Array([0, 1, 2]) }],
                components: [{ nPoints: 3, nTriangles: 1, featureIndex: 0 }],
            });
        } else {
            map.loadCollection(id, SOURCES[id]!);
        }
    }
}

/** The ids of the layers in the map's stack, bottom first. */
const stack = (map: AutkMap) => map.layerManager.layers.map((layer) => layer.layerInfo.id);

/** What one flat frame draws, in the order it draws it. */
function drawn(map: AutkMap): string[] {
    const calls: string[] = [];
    vi.spyOn(PipelineBuildingSSAO, 'beginSharedGeometryPass').mockReturnValue({ end: vi.fn() } as never);
    vi.spyOn(PipelineBuildingSSAO, 'compositeSharedPass').mockImplementation(() => { calls.push('buildings composite'); });
    for (const layer of map.layerManager.layers) {
        vi.spyOn(layer, 'prepareRender').mockImplementation(() => {});
        vi.spyOn(layer, 'renderPass').mockImplementation(() => { calls.push(layer.layerInfo.id); });
        if (layer instanceof Triangles3DLayer) {
            vi.spyOn(layer, 'renderSceneGeometry').mockImplementation(() => { calls.push(`${layer.layerInfo.id} geometry`); });
        }
    }
    const renderer = { start: vi.fn(), beginMainRenderPass: () => ({ end: vi.fn() }), finish: vi.fn() };
    const picking = { consumePendingPick: () => null, resolvePickingReadback: vi.fn() };
    new FlatMapRenderPath(renderer as never, {} as never, map.layerManager, picking as never).renderFrame();
    return calls;
}

describe('the order a map draws its layers in', () => {
    it('draws surface and roads first, then the other layers in load order, when no order is set', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'heat', 'roads', 'stops']);
        expect(drawn(map)).toEqual(['surface', 'roads', 'heat', 'stops']);
    });

    it('draws a raster under its roads when the map lists them so', () => {
        const { map, ui, requestRender } = mapWithoutGpu();
        load(map, ['surface', 'heat', 'roads']);
        ui.refreshLayerList.mockClear();
        requestRender.mockClear();
        map.setLayerOrder(['surface', 'heat', 'roads']);
        expect(drawn(map)).toEqual(['surface', 'heat', 'roads']);
        expect(requestRender).toHaveBeenCalledTimes(1);
        expect(ui.refreshLayerList).toHaveBeenCalledTimes(1);
    });

    it('places a layer loaded after the order where the order lists it, also when it is loaded again', () => {
        const { map } = mapWithoutGpu();
        map.setLayerOrder(['surface', 'heat', 'roads']);
        load(map, ['roads', 'surface', 'heat']);
        expect(stack(map)).toEqual(['surface', 'heat', 'roads']);
        map.layerManager.removeLayerById('heat');
        expect(stack(map)).toEqual(['surface', 'roads']);
        load(map, ['heat']);
        expect(drawn(map)).toEqual(['surface', 'heat', 'roads']);
    });

    it('leaves the layers the order does not list in their places', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'heat', 'roads', 'stops']);
        map.setLayerOrder(['heat', 'roads']);
        expect(drawn(map)).toEqual(['surface', 'heat', 'roads', 'stops']);
    });

    it('returns to the order by type when the order is emptied', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'heat', 'roads']);
        map.setLayerOrder(['surface', 'heat', 'roads']);
        map.setLayerOrder([]);
        expect(drawn(map)).toEqual(['surface', 'roads', 'heat']);
    });

    it('puts two layers of one type back in their load order when the order is emptied', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'plaza', 'roads']);
        expect(stack(map)).toEqual(['surface', 'plaza', 'roads']);
        map.setLayerOrder(['plaza', 'surface']);
        expect(stack(map)).toEqual(['plaza', 'surface', 'roads']);
        map.setLayerOrder([]);
        expect(drawn(map)).toEqual(['surface', 'plaza', 'roads']);
    });

    it('draws buildings with depth over the other layers, wherever the order lists them', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'heat', 'roads', 'buildings']);
        map.setLayerOrder(['buildings', 'surface', 'heat', 'roads']);
        expect(drawn(map)).toEqual(['buildings geometry', 'surface', 'heat', 'roads', 'buildings composite']);
    });

    it('draws an order that lists buildings as if it did not list them', () => {
        const { map } = mapWithoutGpu();
        load(map, ['surface', 'roads', 'buildings', 'heat', 'stops']);
        const byType = ['buildings geometry', 'surface', 'roads', 'heat', 'stops', 'buildings composite'];
        // Each order lists one other layer, which alone moves nothing.
        map.setLayerOrder(['buildings', 'surface']);
        expect(drawn(map)).toEqual(byType);
        map.setLayerOrder(['stops', 'buildings']);
        expect(drawn(map)).toEqual(byType);
    });
});
