import { describe, expect, it } from 'vitest';
import { bilerp, clamp, nextPowerOfTwo } from '../src/utils-math';

describe('nextPowerOfTwo', () => {
  it('rounds up to a power of two and never goes below 1', () => {
    expect(nextPowerOfTwo(300)).toBe(512);
    expect(nextPowerOfTwo(512)).toBe(512);
    expect(nextPowerOfTwo(0)).toBe(1);
  });
});

describe('clamp', () => {
  it('limits a value to the range and leaves values inside it alone', () => {
    expect(clamp(1.4, 0, 1)).toBe(1);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
    expect(clamp(5, 5, 5)).toBe(5);
  });
});

describe('bilerp', () => {
  it('returns each corner at its own weights', () => {
    expect(bilerp(1, 2, 3, 4, 0, 0)).toBe(1);
    expect(bilerp(1, 2, 3, 4, 1, 0)).toBe(2);
    expect(bilerp(1, 2, 3, 4, 0, 1)).toBe(3);
    expect(bilerp(1, 2, 3, 4, 1, 1)).toBe(4);
  });

  it('reproduces a plane exactly', () => {
    const plane = (u: number, v: number) => 2 * u + 3 * v + 5;
    expect(bilerp(plane(0, 0), plane(1, 0), plane(0, 1), plane(1, 1), 0.3, 0.7)).toBeCloseTo(plane(0.3, 0.7), 12);
    expect(bilerp(0, 10, 20, 30, 0.5, 0.5)).toBe(15);
  });
});
