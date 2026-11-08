import { describe, expect, it } from 'vitest';
import type { Heightfield } from '@urban-toolkit/autk-core';
import {
  HEIGHT_UNIFORM_FLOATS,
  MAX_HEIGHT_LEVELS,
  StaticHeightSource,
  heightAt,
  packHeightUniform,
} from '../src/height-source';
import type { HeightLevel, HeightSource } from '../src/height-source';
import buildingsVertex from '../src/shaders/buildings-01.vert.wgsl';
import pickingVertex from '../src/shaders/picking-3d-terrain.vert.wgsl';
import terrainVertex from '../src/shaders/terrain.vert.wgsl';

/** A heightfield whose height is `2x + 3y` at sample (x, y), so bilinear interpolation is exact. */
function plane(width = 4, height = 3, originX = 10, originY = 20, cell = 5): Heightfield {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = 2 * x + 3 * y;
  return {
    width, height, originX, originY, cellSizeX: cell, cellSizeY: cell,
    minHeight: 0, maxHeight: data[data.length - 1]!, data,
    bounds: [originX, originY, originX + (width - 1) * cell, originY + (height - 1) * cell],
  };
}

function level(overrides: Partial<HeightLevel>, value: number): HeightLevel {
  const width = overrides.width ?? 4;
  const height = overrides.height ?? 4;
  return { originX: 0, originY: 0, cellSizeX: 1, cellSizeY: 1, width, height, data: new Float32Array(width * height).fill(value), ...overrides };
}

describe('StaticHeightSource', () => {
  it('is one level that shares the heightfield data and keeps its limits', () => {
    const field = plane();
    const source = new StaticHeightSource(field);
    expect(source.levels).toHaveLength(1);
    expect(source.levels[0]).toMatchObject({ originX: 10, originY: 20, cellSizeX: 5, cellSizeY: 5, width: 4, height: 3 });
    expect(source.levels[0]!.data).toBe(field.data);
    expect(source.bounds).toBe(field.bounds);
    expect([source.minHeight, source.maxHeight]).toEqual([field.minHeight, field.maxHeight]);
  });
});

describe('packHeightUniform', () => {
  it('writes the header and one record per level', () => {
    const source = new StaticHeightSource(plane());
    const packed = packHeightUniform(source);
    expect(packed).toHaveLength(HEIGHT_UNIFORM_FLOATS);
    expect(Array.from(packed.subarray(0, 12))).toEqual([1, 1, 0, 0, 10, 20, 5, 5, 4, 3, 0, 0]);
    expect(Array.from(packed.subarray(12)).every((v) => v === 0)).toBe(true);
  });

  it('packs several levels in order', () => {
    const source: HeightSource = {
      levels: [level({ originX: 1, cellSizeX: 2 }, 0), level({ originX: 3, cellSizeX: 4, width: 5, height: 6 }, 0)],
      bounds: [0, 0, 1, 1], minHeight: 0, maxHeight: 0, version: 0, levelVersions: [0, 0],
    };
    const packed = packHeightUniform(source);
    expect(packed[0]).toBe(2);
    expect(Array.from(packed.subarray(4, 10))).toEqual([1, 0, 2, 1, 4, 4]);
    expect(Array.from(packed.subarray(12, 18))).toEqual([3, 0, 4, 1, 5, 6]);
  });

  it('describes "no terrain" as zero levels, disabled, and overwrites what was there', () => {
    const out = new Float32Array(HEIGHT_UNIFORM_FLOATS).fill(7);
    expect(packHeightUniform(null, out)).toBe(out);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('rejects no levels and too many levels', () => {
    const empty: HeightSource = { levels: [], bounds: [0, 0, 1, 1], minHeight: 0, maxHeight: 0, version: 0, levelVersions: [] };
    const many: HeightSource = {
      levels: Array.from({ length: MAX_HEIGHT_LEVELS + 1 }, () => level({}, 0)),
      bounds: [0, 0, 1, 1], minHeight: 0, maxHeight: 0, version: 0, levelVersions: [],
    };
    expect(() => packHeightUniform(empty)).toThrow(/levels/);
    expect(() => packHeightUniform(many)).toThrow(/levels/);
  });
});

describe('heightAt', () => {
  const source = new StaticHeightSource(plane());

  it('returns the sample at a grid point and interpolates between samples', () => {
    expect(heightAt(source, 10, 20)).toBeCloseTo(0, 6);
    expect(heightAt(source, 15, 25)).toBeCloseTo(2 + 3, 6);
    expect(heightAt(source, 12.5, 22.5)).toBeCloseTo(2 * 0.5 + 3 * 0.5, 6);
  });

  it('never reaches the last row or column, like the shader it mirrors', () => {
    // The shader clamps the sample position to `size - 2`, so the far edge reads the second-to-last sample.
    // This predates the height source and is kept so terrain looks the same; the plane has height 2x + 3y.
    expect(heightAt(source, 25, 30)).toBeCloseTo(2 * 2 + 3 * 1, 6);
  });

  it('clamps outside the window to the edge, as the shader does', () => {
    expect(heightAt(source, -1000, -1000)).toBeCloseTo(0, 6);
    expect(heightAt(source, 1000, 1000)).toBeCloseTo(2 * 2 + 3 * 1, 6);
    expect(heightAt(source, 1000, 20)).toBeCloseTo(2 * 2, 6);
  });

  /** A fine 33-sample window (covers 0..32, band 4.125 cells) inside a coarse one (cell 4, covers -64..64). */
  const fine = (value: number | ((x: number, y: number) => number)): HeightLevel => {
    const w = 33;
    const data = new Float32Array(w * w);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) data[j * w + i] = typeof value === 'number' ? value : value(i, j);
    return { originX: 0, originY: 0, cellSizeX: 1, cellSizeY: 1, width: w, height: w, data };
  };
  const coarse = (value: (x: number, y: number) => number): HeightLevel => {
    const w = 33;
    const data = new Float32Array(w * w);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) data[j * w + i] = value(-64 + i * 4, -64 + j * 4);
    return { originX: -64, originY: -64, cellSizeX: 4, cellSizeY: 4, width: w, height: w, data };
  };
  const two = (a: HeightLevel, b: HeightLevel): HeightSource => ({
    levels: [a, b], bounds: [-64, -64, 64, 64], minHeight: 0, maxHeight: 100, version: 0, levelVersions: [0, 0],
  });

  it('uses the finest level inside its window, the next coarser at its edge, and a blend between', () => {
    const source = two(fine(1), coarse(() => 2));
    expect(heightAt(source, 16, 16)).toBe(1);     // well inside the finest window
    expect(heightAt(source, 0, 16)).toBe(2);      // on its edge: all coarse
    expect(heightAt(source, 32, 16)).toBe(2);
    expect(heightAt(source, 40, 16)).toBe(2);     // outside it
    expect(heightAt(source, 500, 500)).toBe(2);   // outside both: coarsest, clamped
    const mid = heightAt(source, 2, 16);          // inside the band: strictly between
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(2);
  });

  it('has no step where levels meet, even on a curved surface', () => {
    const surface = (x: number, y: number) => 0.05 * x * x + 0.03 * y * y;
    const source = two(fine(surface), coarse(surface));
    // Both levels sample the same paraboloid; the coarse one is off by its bilinear error, so an
    // unblended switch would jump by that much at the edge. Walk across the edge in small steps.
    let worst = 0;
    let previous = heightAt(source, -3, 10);
    for (let x = -2.9; x <= 3; x += 0.1) {
      const h = heightAt(source, x, 10);
      worst = Math.max(worst, Math.abs(h - previous));
      previous = h;
    }
    expect(worst).toBeLessThan(0.3); // the surface itself rises about 0.1 to 0.3 per step here
    // The fine level alone differs from the coarse level at the edge by the coarse interpolation error:
    const edgeCoarse = heightAt(source, 0, 10);
    const edgeJustIn = heightAt(source, 0.0001, 10);
    expect(Math.abs(edgeCoarse - edgeJustIn)).toBeLessThan(1e-3);
  });

  it('blends with the weight the shader computes', () => {
    // distance 2.0 samples in, band 4.125: t = 0.4848, smoothstep = 0.4848^2 * (3 - 2 * 0.4848).
    const t = 2 / 4.125;
    const weight = t * t * (3 - 2 * t);
    const source = two(fine(10), coarse(() => 20));
    expect(heightAt(source, 2, 16)).toBeCloseTo(20 * (1 - weight) + 10 * weight, 5);
  });
});

describe('shared WGSL height lookup', () => {
  const shaders = { terrain: terrainVertex, buildings: buildingsVertex, picking: pickingVertex };

  for (const [name, code] of Object.entries(shaders)) {
    it(`is included once in the ${name} vertex shader, with no height code of its own`, () => {
      expect(code).not.toMatch(/#include/);
      expect(code.match(/fn terrainHeight\(/g)).toHaveLength(1);
      expect(code.match(/struct TerrainHeights/g)).toHaveLength(1);
      expect(code).toMatch(/var terrainHeightTexture: texture_2d_array<f32>/);
      expect(code).toMatch(/var<uniform> terrainHeights: TerrainHeights/);
      expect(code).not.toMatch(/heightOriginCell|heightDims|heightFieldTexture/);
    });

    it(`sizes the level table of the ${name} shader like MAX_HEIGHT_LEVELS`, () => {
      expect(code).toContain(`levels: array<HeightLevel, ${MAX_HEIGHT_LEVELS}>`);
    });
  }
});
