import { describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { VectorLayer } from '../src/layer-vector';

/** A vector layer of `n` components with one vertex each, without a GPU; it runs the real skip methods. */
function layerOf(n: number) {
    const layer = Object.create(VectorLayer.prototype) as any;
    layer._skippedIds = new Set<number>();
    layer._skippedVertices = new Float32Array(n);
    layer._forEachUniqueVertexInComponents = (ids: number[], visit: (vertex: number) => void) => ids.forEach(visit);
    layer.makeLayerRenderInfoDirty = vi.fn();
    layer.makeLayerDataDirty = vi.fn();
    const hidden = () => [...layer._skippedVertices].flatMap((flag: number, i: number) => (flag === 1 ? [i] : []));
    return { layer: layer as VectorLayer, hidden };
}

describe('VectorLayer.replaceSkippedIds', () => {
    it('hides exactly the ids given', () => {
        const { layer, hidden } = layerOf(8);
        layer.replaceSkippedIds([1, 4]);
        expect(layer.skippedIds.sort()).toEqual([1, 4]);
        expect(hidden()).toEqual([1, 4]);
    });

    it('does not depend on what was hidden before: the old ids are shown again', () => {
        const { layer, hidden } = layerOf(8);
        layer.replaceSkippedIds([1, 4, 6]);
        layer.replaceSkippedIds([4, 7]);
        expect(layer.skippedIds.sort()).toEqual([4, 7]);
        expect(hidden()).toEqual([4, 7]);
    });

    it('can be repeated: the same call twice changes nothing (setSkippedIds would undo itself)', () => {
        const { layer, hidden } = layerOf(8);
        layer.replaceSkippedIds([2, 3]);
        layer.replaceSkippedIds([2, 3]);
        expect(hidden()).toEqual([2, 3]);

        const toggled = layerOf(8);
        toggled.layer.setSkippedIds([2, 3]);
        toggled.layer.setSkippedIds([2, 3]);
        expect(toggled.hidden()).toEqual([]); // the toggle, for contrast
    });

    it('counts a duplicate id once', () => {
        const { layer, hidden } = layerOf(8);
        layer.replaceSkippedIds([5, 5, 5]);
        expect(hidden()).toEqual([5]);
        expect(layer.skippedIds).toEqual([5]);
    });

    it('shows everything for an empty list', () => {
        const { layer, hidden } = layerOf(8);
        layer.replaceSkippedIds([0, 1, 2]);
        layer.replaceSkippedIds([]);
        expect(hidden()).toEqual([]);
        expect(layer.skippedIds).toEqual([]);
    });

    it('leaves the GPU data alone when nothing changes', () => {
        const { layer } = layerOf(8);
        layer.replaceSkippedIds([1]);
        const dirty = vi.mocked((layer as any).makeLayerDataDirty);
        dirty.mockClear();
        layer.replaceSkippedIds([1]);
        expect(dirty).not.toHaveBeenCalled();
    });
});

describe('AutkMap.replaceSkippedIds', () => {
    it('passes the ids to a vector layer, and ignores other layers and unknown ids', () => {
        const map = Object.create(AutkMap.prototype) as any;
        const vector = Object.create(VectorLayer.prototype) as any;
        vector.replaceSkippedIds = vi.fn();
        const other = { replaceSkippedIds: vi.fn() };
        map._layerManager = { searchByLayerId: (id: string) => ({ parks: vector, raster: other } as any)[id] ?? null };

        map.replaceSkippedIds('parks', [1, 2]);
        map.replaceSkippedIds('raster', [1]);
        expect(() => map.replaceSkippedIds('missing', [1])).not.toThrow();

        expect(vector.replaceSkippedIds).toHaveBeenCalledWith([1, 2]);
        expect(other.replaceSkippedIds).not.toHaveBeenCalled();
    });
});
