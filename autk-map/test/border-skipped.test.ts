import type { FeatureCollection } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { PipelineTriangleBorder } from '../src/pipeline-triangle-border';

/**
 * A 2D layer of three polygons without a GPU: border vertices 0-3, 4-8 and 9-11 (cumulative nPoints 4, 9, 12), and
 * a fill with one vertex per component, so the fill's flags and the border's differ in length and layout.
 */
function layer() {
    const layer = Object.create(Triangles2DLayer.prototype) as any;
    layer._components = [{ nTriangles: 1 }, { nTriangles: 2 }, { nTriangles: 3 }];
    layer._indices = new Uint32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    layer._skippedIds = new Set<number>();
    layer._skippedVertices = new Float32Array(3);
    layer._borderPosition = new Float32Array(24);   // 12 border vertices
    layer._borderComponents = [{ nPoints: 4, nLines: 4 }, { nPoints: 9, nLines: 9 }, { nPoints: 12, nLines: 12 }];
    layer._borderSkippedVertices = new Float32Array(12);
    layer.makeLayerRenderInfoDirty = vi.fn();
    layer.makeLayerDataDirty = vi.fn();
    const hiddenBorder = () => [...layer._borderSkippedVertices].flatMap((flag: number, i: number) => (flag === 1 ? [i] : []));
    return { layer: layer as Triangles2DLayer, hiddenBorder };
}

describe('the border of a skipped feature', () => {
    it('hides exactly the border vertices of that feature', () => {
        const { layer: l, hiddenBorder } = layer();
        l.setSkippedIds([1]);
        expect(hiddenBorder()).toEqual([4, 5, 6, 7, 8]);
    });

    it('covers the first and the last feature', () => {
        const { layer: l, hiddenBorder } = layer();
        l.setSkippedIds([0, 2]);
        expect(hiddenBorder()).toEqual([0, 1, 2, 3, 9, 10, 11]);
    });

    it('follows the toggle: skipping again shows the border again', () => {
        const { layer: l, hiddenBorder } = layer();
        l.setSkippedIds([1]);
        l.setSkippedIds([1]);
        expect(hiddenBorder()).toEqual([]);
    });

    it('follows the toggle of a second call, and clearSkippedIds', () => {
        const { layer: l, hiddenBorder } = layer();
        l.setSkippedIds([0, 1]);
        l.setSkippedIds([0]);                       // feature 0 is toggled back on: only feature 1 stays hidden
        expect(hiddenBorder()).toEqual([4, 5, 6, 7, 8]);
        l.setSkippedIds([2]);
        expect(hiddenBorder()).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
        l.clearSkippedIds();
        expect(hiddenBorder()).toEqual([]);
    });

    it('ignores an id that is not a component', () => {
        const { layer: l, hiddenBorder } = layer();
        l.setSkippedIds([7, -1]);
        expect(hiddenBorder()).toEqual([]);
    });

    it('is sized to the border vertices, not to the fill vertices', () => {
        const { layer: l } = layer();
        l.setSkippedIds([0]);
        expect(l.borderSkippedVertices).toHaveLength(12);
        expect(l.skippedVertices).toHaveLength(3);
    });
});

describe('the border pipeline', () => {
    it('uploads the border skip flags, not the fill flags', () => {
        const writes: Float32Array[] = [];
        const pipeline = Object.create(PipelineTriangleBorder.prototype) as any;
        pipeline._renderer = { device: { queue: { writeBuffer: (_b: unknown, _o: number, data: Float32Array) => writes.push(data) } } };
        pipeline._positionBuffer = {}; pipeline._borderIndicesBuffer = {}; pipeline._skippedBuffer = {};
        const border = new Float32Array(12).fill(1);
        pipeline.updateVertexBuffers({
            borderPosition: new Float32Array(24), borderIndices: new Uint32Array(0),
            skippedVertices: new Float32Array(3), borderSkippedVertices: border,
        });
        expect(writes[writes.length - 1]).toHaveLength(12);
    });
});

describe('a layer built from a real collection', () => {
    const square = (x: number): FeatureCollection['features'][number] => ({
        type: 'Feature', properties: {},
        geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 100, 0], [x + 100, 100], [x, 100], [x, 0]]] },
    });

    // The layer is built by its own constructor, as the map builds it: the base class loads the first data before this
    // class's fields exist, and the flags must still end up sized to the border.
    function realLayer() {
        const map = Object.create(AutkMap.prototype) as any;
        map._layerManager = { origin: [0, 0], hasOrigin: true, computeZindex: () => 1 };
        map._ui = { refreshLayerList: vi.fn() };
        map.defaultColorMap = vi.fn(() => ({}));
        map.createLayer = vi.fn();
        map.loadCollection('squares', { collection: { type: 'FeatureCollection', features: [square(0), square(500), square(1000)] }, type: 'polygons' });
        const [info, renderInfo, data] = map.createLayer.mock.calls[0];
        return new Triangles2DLayer(info, renderInfo, data);
    }

    it('is constructed with border flags sized to its border, all clear', () => {
        const layer = realLayer();
        expect(layer.borderSkippedVertices).toHaveLength(layer.borderPosition.length / 2);
        expect(layer.borderSkippedVertices.every((flag) => flag === 0)).toBe(true);
    });

    it('hides the border vertices of the skipped square only', () => {
        const layer = realLayer();
        const perSquare = layer.borderPosition.length / 2 / 3;
        layer.setSkippedIds([1]);
        const flags = [...layer.borderSkippedVertices];
        expect(flags.slice(0, perSquare).every((flag) => flag === 0)).toBe(true);
        expect(flags.slice(perSquare, 2 * perSquare).every((flag) => flag === 1)).toBe(true);
        expect(flags.slice(2 * perSquare).every((flag) => flag === 0)).toBe(true);
    });
});

