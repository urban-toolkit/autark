import { describe, expect, it } from 'vitest';
import { finestCellOver } from '../src/height-source';
import type { HeightLevel, HeightSource } from '../src/height-source';
import { traverseQuadtree } from '../src/terrain-quadtree';
import type { QuadBlock } from '../src/terrain-quadtree';

const create = (x: number, y: number, size: number, level: number): QuadBlock => ({ x, y, size, level });
const area = (blocks: QuadBlock[]) => blocks.reduce((sum, b) => sum + b.size * b.size, 0);

describe('traverseQuadtree', () => {
  const root = () => [create(0, 0, 1024, 6)];

  it('splits as far as the rule asks when the budget allows', () => {
    const leaves = traverseQuadtree(root(), { create, visible: () => true, wantsSplit: (b) => b.level > 3, maxLeaves: 4096 });
    expect(leaves).toHaveLength(4 ** 3);
    expect(area(leaves)).toBe(1024 * 1024);
  });

  it('keeps the whole area covered, within the budget, when everything wants to split', () => {
    for (const max of [1, 4, 7, 50, 100, 300]) {
      const leaves = traverseQuadtree(root(), { create, visible: () => true, wantsSplit: () => true, maxLeaves: max });
      expect(leaves.length).toBeLessThanOrEqual(max);
      expect(area(leaves)).toBe(1024 * 1024); // no region is dropped
    }
  });

  it('covers the area when only part of it wants detail and the budget is tight', () => {
    // Detail wanted near the origin; the rest stays coarse.
    const leaves = traverseQuadtree(root(), {
      create,
      visible: () => true,
      wantsSplit: (b) => b.x < 100 && b.y < 100,
      maxLeaves: 40,
    });
    expect(leaves.length).toBeLessThanOrEqual(40);
    expect(area(leaves)).toBe(1024 * 1024);
    expect(Math.min(...leaves.map((b) => b.size))).toBeLessThan(1024 / 4);
  });

  it('drops invisible blocks and everything under them', () => {
    const leaves = traverseQuadtree(root(), { create, visible: (b) => b.x < 512, wantsSplit: (b) => b.level > 5, maxLeaves: 100 });
    expect(area(leaves)).toBe(512 * 1024);
  });

  it('never splits level 0', () => {
    const leaves = traverseQuadtree([create(0, 0, 32, 0)], { create, visible: () => true, wantsSplit: () => true, maxLeaves: 100 });
    expect(leaves).toHaveLength(1);
  });
});

describe('finestCellOver', () => {
  const level = (originX: number, cell: number, n = 33): HeightLevel => ({
    originX, originY: originX, cellSizeX: cell, cellSizeY: cell, width: n, height: n, data: new Float32Array(n * n),
  });
  // Finest window covers 0..32, the coarser -64..64.
  const source: HeightSource = {
    levels: [level(0, 1), level(-64, 4)], bounds: [-64, -64, 64, 64], minHeight: 0, maxHeight: 0, version: 0, levelVersions: [0, 0],
  };

  it('is the finest cell when the rectangle only touches the finest window', () => {
    // The centre of this block (50, 50) is outside the finest window, but its corner is inside.
    expect(finestCellOver(source, 30, 30, 70, 70)).toBe(1);
  });

  it('is the coarse cell when no finer window overlaps', () => {
    expect(finestCellOver(source, 40, 40, 60, 60)).toBe(4);
    expect(finestCellOver(source, -200, -200, -100, -100)).toBe(4);
  });

  it('is the finest cell for a rectangle inside the finest window', () => {
    expect(finestCellOver(source, 5, 5, 10, 10)).toBe(1);
  });
});
