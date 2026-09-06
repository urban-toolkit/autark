import { describe, expect, it } from 'vitest';

import { buildTransferContext, computeAlphaByte } from '../src/transfer-function';

describe('transfer function', () => {
  it('builds rendering statistics and resolves defaults', () => {
    const context = buildTransferContext([-10, 0, 20], { mode: 'linear', opacityMin: 0.2 });

    expect(context).toEqual({
      min: -10,
      max: 20,
      range: 30,
      maxAbsDistance: 20,
      validCount: 3,
      config: {
        mode: 'linear',
        opacityMin: 0.2,
        opacityMax: 1,
        gamma: 1,
        zeroCenter: 0,
      },
    });
  });

  it('maps and clamps a linear opacity range', () => {
    const context = buildTransferContext([0, 100], { mode: 'linear' });

    expect([-10, 0, 50, 100, 110].map((value) => computeAlphaByte(value, context))).toEqual([
      0,
      0,
      128,
      255,
      255,
    ]);
  });

  it.each([
    ['far-zero', [255, 0, 255]],
    ['near-zero', [0, 255, 0]],
  ] as const)('maps distance in %s mode', (mode, expected) => {
    const context = buildTransferContext([-10, 0, 10], { mode });

    expect([-10, 0, 10].map((value) => computeAlphaByte(value, context))).toEqual(expected);
  });

  it('applies gamma and opacity bounds', () => {
    const context = buildTransferContext([0, 1], {
      mode: 'linear',
      gamma: 2,
      opacityMin: 0.2,
      opacityMax: 0.8,
    });

    expect(computeAlphaByte(0.5, context)).toBe(89);
  });

  it('renders NaN as transparent', () => {
    expect(computeAlphaByte(NaN, buildTransferContext([]))).toBe(0);
  });
});
