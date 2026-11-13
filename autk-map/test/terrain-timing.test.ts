import { describe, expect, it, vi } from 'vitest';
import { TimingWindow } from '../src/terrain-timing';
import { TileHeightSource } from '../src/height-source-tiles';

describe('TimingWindow', () => {
  it('is all zeros when empty', () => {
    expect(new TimingWindow().summary()).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });

  it('takes percentiles by nearest rank', () => {
    const window = new TimingWindow();
    for (let i = 100; i >= 1; i--) window.record(i); // inserted out of order
    expect(window.summary()).toEqual({ count: 100, p50: 50, p95: 95, p99: 99, max: 100 });
  });

  it('keeps one value as every percentile', () => {
    const window = new TimingWindow();
    window.record(7);
    expect(window.summary()).toEqual({ count: 1, p50: 7, p95: 7, p99: 7, max: 7 });
  });

  it('keeps only the most recent values', () => {
    const window = new TimingWindow(3);
    [1, 2, 3, 100, 200].forEach((v) => window.record(v));
    const summary = window.summary();
    expect(summary.count).toBe(3);
    expect(summary.p50).toBe(100);
    expect(summary.max).toBe(200);
  });

  it('reuses the percentile calculation until values change and protects its cached result', () => {
    const window = new TimingWindow();
    [9, 1, 5].forEach(value => window.record(value));
    const sort = vi.spyOn(Array.prototype, 'sort');
    const first = window.summary();
    first.p95 = 999;
    const second = window.summary();
    const calls = sort.mock.calls.length;
    sort.mockRestore();
    expect(calls).toBe(1);
    expect(second.p95).toBe(9);
    window.record(12);
    expect(window.summary().max).toBe(12);
    window.reset();
    expect(window.summary().count).toBe(0);
  });

  it('ignores negative and non-finite values and can be reset', () => {
    const window = new TimingWindow();
    [-1, Number.NaN, Infinity, 5].forEach((v) => window.record(v));
    expect(window.summary().count).toBe(1);
    window.reset();
    expect(window.summary().count).toBe(0);
  });
});

describe('TileHeightSource timing', () => {
  const options = {
    source: { urlTemplate: 'https://t/{z}/{x}/{y}.png', encoding: 'terrarium', minZoom: 0, maxZoom: 15, tileSize: 256, subdomains: [], attribution: [{ text: 't' }] },
    crs: 'EPSG:3857',
    origin: [0, 0],
    centre: [0, 0],
    levels: 2,
    windowSize: 64,
    load: () => new Promise<never>(() => {}),
  } as unknown as ConstructorParameters<typeof TileHeightSource>[0];

  it('records every update, the composing ones separately, uploads on request, and resets', () => {
    const source = new TileHeightSource(options); // the constructor's update composes both windows
    let timing = source.stats.timing;
    expect(timing.update.count).toBe(1);
    expect(timing.compose.count).toBe(1);
    expect(timing.windowsPerCompose.max).toBe(2);
    expect(timing.upload.count).toBe(0);

    source.update([0, 0]); // nothing moved and nothing arrived: an update with no composition
    timing = source.stats.timing;
    expect(timing.update.count).toBe(2);
    expect(timing.compose.count).toBe(1);

    source.recordUpload(1.5);
    expect(source.stats.timing.upload).toMatchObject({ count: 1, max: 1.5 });

    source.resetTiming();
    const cleared = source.stats.timing;
    expect([cleared.update.count, cleared.compose.count, cleared.upload.count, cleared.windowsPerCompose.count]).toEqual([0, 0, 0, 0]);
    source.destroy();
  });
});
