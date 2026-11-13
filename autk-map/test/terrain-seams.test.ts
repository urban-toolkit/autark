import { describe, expect, it } from 'vitest';
import { assignSeams, morphEdge } from '../src/terrain-seams';
import type { SeamBlock } from '../src/terrain-seams';
import { traverseQuadtree } from '../src/terrain-quadtree';
import terrainVertex from '../src/shaders/terrain.vert.wgsl';

const block = (x: number, y: number, size: number): SeamBlock => ({ x, y, size, seamXMin: 0, seamXMax: 0, seamYMin: 0, seamYMax: 0 });
const seams = (b: SeamBlock) => [b.seamXMin, b.seamXMax, b.seamYMin, b.seamYMax];

describe('assignSeams', () => {
  it('stitches fixed heightfields whose quadtree origin is not aligned to world zero', () => {
    const origin = [35.5, -11.25] as const;
    const coarse = block(origin[0], origin[1], 200);
    const fine = block(origin[0] + 200, origin[1], 100);
    assignSeams([coarse, fine], origin);
    expect(fine.seamXMin).toBe(1);
    expect(coarse.seamXMax).toBe(0);
    const edge = morphEdge(origin[1], 100 / 32, 5, 1, origin[1]);
    expect(edge.lower).toBe(origin[1] + 12.5);
    expect(edge.upper).toBe(origin[1] + 18.75);
    expect(edge.weight).toBe(0.5);
  });
  it('leaves equal-size neighbours alone', () => {
    const blocks = [block(0, 0, 100), block(100, 0, 100), block(0, 100, 100), block(100, 100, 100)];
    assignSeams(blocks);
    blocks.forEach((b) => expect(seams(b)).toEqual([0, 0, 0, 0]));
  });

  it('marks the edges of a fine patch that face a coarser neighbour, and not the coarser one', () => {
    // A 200 block on the left; the right half is four 50 blocks.
    const coarse = block(0, 0, 200);
    const fine = [block(200, 0, 100), block(300, 0, 100), block(200, 100, 100), block(300, 100, 100)];
    // Make the 100 blocks' west neighbour the coarse one (size 200 spans y 0..200).
    assignSeams([coarse, ...fine]);
    expect(seams(coarse)).toEqual([0, 0, 0, 0]);
    expect(seams(fine[0]!)).toEqual([1, 0, 0, 0]);      // west edge faces the 200 block
    expect(seams(fine[2]!)).toEqual([1, 0, 0, 0]);
    expect(seams(fine[1]!)).toEqual([0, 0, 0, 0]);      // east side has nothing
  });

  it('gives the number of levels the neighbour is coarser, including more than one', () => {
    const blocks = [block(0, 0, 400), block(400, 0, 100), block(400, 100, 100)];
    assignSeams(blocks);
    expect(blocks[1]!.seamXMin).toBe(2);
    expect(blocks[2]!.seamXMin).toBe(2);
    expect(blocks[1]!.seamYMax).toBe(0);                // neighbour above is the same size
    expect(blocks[0]!.seamXMax).toBe(0);                // the coarse block never needs a seam against finer ones
  });

  it('handles all four edges and a missing neighbour', () => {
    // Blocks are aligned to their own size, as quadtree leaves are.
    const southWest = block(200, 200, 100);   // west and south neighbours are 200 blocks
    const northEast = block(300, 300, 100);   // east and north neighbours are 200 blocks
    const larger = [block(0, 200, 200), block(200, 0, 200), block(400, 200, 200), block(200, 400, 200)];
    assignSeams([southWest, northEast, ...larger]);
    expect(seams(southWest)).toEqual([1, 0, 1, 0]);
    expect(seams(northEast)).toEqual([0, 1, 0, 1]);
    const alone = block(0, 0, 100);
    assignSeams([alone]);
    expect(seams(alone)).toEqual([0, 0, 0, 0]);
  });
});

describe('morphEdge', () => {
  it('leaves a vertex alone when the neighbour is not coarser', () => {
    expect(morphEdge(1024, 8, 5, 0)).toEqual({ lower: 1064, upper: 1064, weight: 0 });
  });

  it('snaps odd vertices between their even neighbours for a neighbour one level coarser', () => {
    // Patch at 1024 with 8-unit cells; the neighbour's vertices are 16 apart.
    expect(morphEdge(1024, 8, 4, 1)).toEqual({ lower: 1056, upper: 1072, weight: 0 });
    expect(morphEdge(1024, 8, 5, 1)).toEqual({ lower: 1056, upper: 1072, weight: 0.5 });
    expect(morphEdge(1024, 8, 32, 1)).toEqual({ lower: 1280, upper: 1296, weight: 0 });
  });

  it('uses the neighbour spacing of cell * 2^levels, and reproduces its straight edge', () => {
    const height = (x: number) => Math.sin(x * 0.01) * 10;
    for (const levels of [1, 2, 3]) {
      for (let i = 0; i <= 32; i++) {
        const { lower, upper, weight } = morphEdge(1024, 8, i, levels);
        const morphed = height(lower) * (1 - weight) + height(upper) * weight;
        // The neighbour has vertices only at multiples of its spacing and straight lines between them.
        const spacing = 8 * 2 ** levels;
        const a = Math.floor((1024 + i * 8) / spacing) * spacing;
        const neighbour = height(a) * (1 - (1024 + i * 8 - a) / spacing) + height(a + spacing) * ((1024 + i * 8 - a) / spacing);
        expect(morphed).toBeCloseTo(neighbour, 10);
      }
    }
  });

  it('is exact when the neighbour is so coarse that its vertices lie outside the patch', () => {
    // Six levels coarser: spacing 8 * 64 = 512, wider than the 256-unit patch. A linear field must be reproduced exactly.
    const field = (x: number) => 3 * x + 7;
    for (let i = 0; i <= 32; i++) {
      const { lower, upper, weight } = morphEdge(245760, 8, i, 6);
      expect(lower % 512).toBe(0);
      expect(upper - lower).toBe(512);
      expect(field(lower) * (1 - weight) + field(upper) * weight).toBeCloseTo(field(245760 + i * 8), 6);
    }
  });
});

describe('seams under the instance budget', () => {
  const create = (x: number, y: number, size: number, level: number): SeamBlock & { level: number } => ({
    x, y, size, level, seamXMin: 0, seamXMax: 0, seamYMin: 0, seamYMax: 0,
  });

  it('stitches every edge of every patch to its coarser neighbour, including gaps of six levels', () => {
    // One root, everything wants to split, the real 4096-leaf budget: the coarse and fine patches end up many levels apart.
    const leaves = traverseQuadtree([create(0, 0, 262144, 10)], { create, visible: () => true, wantsSplit: () => true, maxLeaves: 4096 });
    assignSeams(leaves);
    const biggestGap = Math.max(...leaves.flatMap((b) => [b.seamXMin, b.seamXMax, b.seamYMin, b.seamYMax]));
    expect(biggestGap).toBeGreaterThanOrEqual(6);

    // A linear field is reproduced exactly by any straight coarse edge, so the morphed height must equal it.
    const field = (x: number, y: number) => 2 * x + 3 * y;
    let checked = 0;
    for (const b of leaves) {
      const cell = b.size / 32;
      const edges: Array<[number, 'x' | 'y', number]> = [
        [b.seamXMin, 'y', b.x], [b.seamXMax, 'y', b.x + b.size], [b.seamYMin, 'x', b.y], [b.seamYMax, 'x', b.y + b.size],
      ];
      for (const [levels, along, fixed] of edges) {
        if (levels === 0) continue;
        for (let i = 0; i <= 32; i++) {
          const start = along === 'y' ? b.y : b.x;
          const { lower, upper, weight } = morphEdge(start, cell, i, levels);
          const at = (position: number) => (along === 'y' ? field(fixed, position) : field(position, fixed));
          expect(at(lower) * (1 - weight) + at(upper) * weight).toBeCloseTo(at(start + i * cell), 3);
          // The two points are vertices of a block of the neighbour's size.
          expect(lower % (cell * 2 ** levels)).toBe(0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('terrain vertex shader', () => {
  it('applies the seam morph in every patch vertex entry point', () => {
    expect(terrainVertex.match(/patchVertex\(blockOrigin, blockSize, localPosition, seamData\)/g)).toHaveLength(3);
    // Normals come from the same call, so a morphed edge vertex is shaded like its neighbour's edge.
    expect(terrainVertex).not.toMatch(/output\.normal = terrainNormal\(/);
    expect(terrainVertex).not.toContain('_ = seamData;');
  });
});
