import { describe, expect, it } from 'vitest';
import { legendLabelPlacements } from '../src/legend-labels';

describe('legend labels', () => {
  it('keeps a continuous ramp\'s end labels inside the ramp, so the last one is not cut at the legend\'s edge', () => {
    const placed = legendLabelPlacements(['0.00', '240.00', '480.00', '720.00'], 210, 2.1, false);

    expect(placed.map((p) => [p.label, p.pos, p.anchor])).toEqual([
      ['0.00', 0, 'start'],
      ['240.00', 70, 'middle'],
      ['480.00', 140, 'middle'],
      ['720.00', 210, 'end'],
    ]);
  });

  it('centers a categorical legend\'s labels under their swatches', () => {
    const placed = legendLabelPlacements(['park', 'road', 'water'], 210, 70, true);

    expect(placed.map((p) => [p.pos, p.anchor])).toEqual([
      [35, 'middle'],
      [105, 'middle'],
      [175, 'middle'],
    ]);
  });

  it('starts a lone label at the ramp\'s start', () => {
    expect(legendLabelPlacements(['5.00'], 210, 2.1, false)).toEqual([{ label: '5.00', pos: 0, anchor: 'start' }]);
  });
});
