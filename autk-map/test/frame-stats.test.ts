import { describe, expect, it } from 'vitest';
import { FrameStats } from '../src/frame-stats';

describe('FrameStats', () => {
  it('starts empty', () => {
    expect(new FrameStats().snapshot(1000)).toEqual({ frameCount: 0, lastFrameCpuMs: 0, averageFrameCpuMs: 0, framesPerSecond: 0 });
  });

  it('counts frames and reports the last and the average CPU time', () => {
    const stats = new FrameStats();
    stats.record(2, 100);
    stats.record(4, 116);
    stats.record(6, 133);
    expect(stats.snapshot(133)).toMatchObject({ frameCount: 3, lastFrameCpuMs: 6, averageFrameCpuMs: 4 });
  });

  it('gives the rate of frames that are coming in', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 31; i++) stats.record(1, 1000 + i * 20); // 50 frames per second for 600 ms
    expect(stats.snapshot(1600).framesPerSecond).toBeCloseTo(50, 5);
  });

  it('falls to zero when rendering stops, instead of keeping the last rate', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 31; i++) stats.record(1, 1000 + i * 20);
    expect(stats.snapshot(1700).framesPerSecond).toBeGreaterThan(0);
    expect(stats.snapshot(1600 + 1001).framesPerSecond).toBe(0);
    expect(stats.snapshot(60_000).framesPerSecond).toBe(0);
    expect(stats.snapshot(60_000).frameCount).toBe(31); // the count stays, so a stalled count means idle
  });

  it('reports no rate from a single frame', () => {
    const stats = new FrameStats();
    stats.record(3, 500);
    expect(stats.snapshot(500).framesPerSecond).toBe(0);
  });

  it('keeps a bounded history but counts every frame', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 1000; i++) stats.record(i < 500 ? 100 : 1, i);
    const snapshot = stats.snapshot(1000);
    expect(snapshot.frameCount).toBe(1000);
    expect(snapshot.averageFrameCpuMs).toBeCloseTo(1, 5); // only the recent frames count
  });
});
