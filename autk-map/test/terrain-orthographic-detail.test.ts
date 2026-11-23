import { describe, expect, it } from 'vitest';
import { Camera } from '@urban-toolkit/autk-core';
import { TerrainRenderer } from '../src/renderer-terrain';

interface Block { x: number; y: number; size: number; level: number }

/** The block selection of a terrain renderer over flat ground 16,384 units across, without its GPU resources. */
function flatTerrain() {
    return Object.assign(Object.create(TerrainRenderer.prototype), {
        _bounds: [-8192, -8192, 8192, 8192],
        finestCell: 1,
        _source: { minHeight: 0, maxHeight: 0, levels: [] },
        stats: { selectedBlocks: 0, triangles: 0, culledBlocks: 0 },
        lastBlocks: [],
    }) as { selectBlocks(camera: Camera, enableCulling: boolean): void; lastBlocks: Block[] };
}

/** A camera 2000 units above the middle of the terrain, on an 800 by 600 canvas, tilted one radian from straight down. */
function tilted(projection: 'perspective' | 'orthographic'): Camera {
    const camera = new Camera({ eye: [0, 0, 2000], lookAt: [0, 0, 0], up: [0, 1, 0] });
    camera.resize(800, 600);
    if (projection === 'orthographic') camera.setProjection('orthographic');
    camera.pitch(-1);
    camera.update();
    return camera;
}

/** The levels of every block the view selects, and of those under the bottom of the view, near the eye, and its top, far from it. */
function selectedLevels(camera: Camera) {
    const terrain = flatTerrain();
    terrain.selectBlocks(camera, true);
    const levelAt = ([x, y]: [number, number]) => terrain.lastBlocks.find((block) =>
        x >= block.x && x < block.x + block.size && y >= block.y && y < block.y + block.size)?.level;
    return {
        all: terrain.lastBlocks.map((block) => block.level),
        near: levelAt(camera.getGroundPoint(0.5, 0.1, 1e6)),
        far: levelAt(camera.getGroundPoint(0.5, 0.9, 1e6)),
    };
}

describe('terrain detail in a tilted view', () => {
    it('splits blocks near the eye of a perspective view more finely than blocks far from it', () => {
        const { near, far } = selectedLevels(tilted('perspective'));
        expect(near).toBeDefined();
        expect(far).toBeDefined();
        expect(near!).toBeLessThan(far!);
    });

    it('splits the blocks of an orthographic view as finely far from the eye as near it', () => {
        const { all, near, far } = selectedLevels(tilted('orthographic'));
        expect(near).toBeDefined();
        expect(far).toBe(near);
        expect(new Set(all)).toEqual(new Set([near]));
    });
});
