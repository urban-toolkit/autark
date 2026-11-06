import { describe, expect, it } from 'vitest';
import { composeRgbRaster, resolveRgbRange, toFloat32Band } from '../src/raster-rgb';

const f32 = (...values: number[]) => new Float32Array(values);

describe('toFloat32Band', () => {
  it('passes a Float32Array through and converts other typed and plain arrays', () => {
    const band = f32(1, 2);
    expect(toFloat32Band(band)).toBe(band);
    expect(Array.from(toFloat32Band(new Uint8Array([3, 4]))!)).toEqual([3, 4]);
    expect(Array.from(toFloat32Band([5, 'x', 7])!)).toEqual([5, NaN, 7]);
  });

  it('rejects values that are not arrays', () => {
    expect(toFloat32Band(undefined)).toBeNull();
    expect(toFloat32Band(3)).toBeNull();
    expect(toFloat32Band(new DataView(new ArrayBuffer(4)))).toBeNull();
  });
});

describe('resolveRgbRange', () => {
  it('keeps 8-bit imagery as it is', () => {
    expect(resolveRgbRange([f32(10, 200), f32(0, 255), f32(5, 6)])).toEqual([0, 255]);
  });

  it('stretches wider values from the smallest to the largest across all bands', () => {
    expect(resolveRgbRange([f32(100, 4000), f32(50, 9000), f32(NaN, 300)])).toEqual([50, 9000]);
  });

  it('falls back to [0, 255] when there is no finite value', () => {
    expect(resolveRgbRange([f32(NaN), f32(NaN), f32(NaN)])).toEqual([0, 255]);
  });
});

describe('composeRgbRaster', () => {
  it('interleaves the bands with an opaque alpha', () => {
    const rgba = composeRgbRaster([f32(10, 20), f32(30, 40), f32(50, 60)]);
    expect(Array.from(rgba)).toEqual([10, 30, 50, 255, 20, 40, 60, 255]);
  });

  it('scales an explicit range to 0 to 255 and clamps outside it', () => {
    const rgba = composeRgbRaster([f32(0, 1500, 9999), f32(0, 3000, 0), f32(3000, 0, 0)], [0, 3000]);
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 0, 255, 255]);
    expect(rgba[4]).toBeCloseTo(127.5);
    expect(Array.from(rgba.slice(8, 11))).toEqual([255, 0, 0]);
  });

  it('leaves a pixel fully transparent when any band has no data', () => {
    const rgba = composeRgbRaster([f32(10, NaN), f32(20, 20), f32(30, 30)]);
    expect(Array.from(rgba)).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
  });

  it('does not divide by zero for a flat range', () => {
    expect(Array.from(composeRgbRaster([f32(7), f32(7), f32(7)], [7, 7]))).toEqual([0, 0, 0, 255]);
  });

  it('rejects bands of different lengths', () => {
    expect(() => composeRgbRaster([f32(1, 2), f32(1), f32(1, 2)])).toThrow(/same length/);
  });
});
