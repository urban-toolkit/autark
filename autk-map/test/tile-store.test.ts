import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TileIndex } from '../src/tile-index';
import { TileLoadError } from '../src/tile-loader';
import { TileStore } from '../src/tile-store';
import type { TileStoreOptions } from '../src/tile-store';
import { resolveTileSource } from '../src/tile-source';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const SOURCE = resolveTileSource({
  urlTemplate: 'https://t.example/{z}/{x}/{y}.png',
  attribution: 'test',
  minZoom: 2,
  maxZoom: 12,
});

const T = (z: number, x: number, y: number): TileIndex => ({ z, x, y });
const urlOf = (t: TileIndex) => `https://t.example/${t.z}/${t.x}/${t.y}.png`;

interface Pending { url: string; signal: AbortSignal; resolve: (v: string) => void; reject: (e: unknown) => void }

function harness(options: Partial<TileStoreOptions<string>> = {}) {
  const pending: Pending[] = [];
  let clock = 1_000_000;
  const changed = vi.fn();
  const errors: Array<[string, boolean]> = [];
  const disposed: string[] = [];
  const store = new TileStore<string>({
    source: SOURCE,
    maxRetries: 0,
    now: () => clock,
    onChange: changed,
    onError: (tile, _error, permanent) => errors.push([urlOf(tile), permanent]),
    dispose: (value) => disposed.push(value),
    load: (url, signal) => new Promise<string>((resolve, reject) => {
      pending.push({ url, signal, resolve, reject });
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
    ...options,
  });
  const latest = (url: string) => [...pending].reverse().find((p) => p.url === url)!;
  const urls = () => pending.map((p) => p.url);
  const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
  return {
    store, pending, changed, errors, disposed, urls,
    settle,
    advanceClock: (ms: number) => { clock += ms; },
    done: async (url: string, value = url) => { latest(url).resolve(value); await settle(); },
    fail: async (url: string, error: unknown) => { latest(url).reject(error); await settle(); },
  };
}

describe('TileStore requests', () => {
  it('requests the tiles in view, using the source URL template', () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 10, 12), T(5, 11, 12)]);
    expect(h.urls()).toEqual([urlOf(T(5, 10, 12)), urlOf(T(5, 11, 12))]);
  });

  it('loads the parent before the tile, because one coarse tile covers four fine ones', () => {
    const h = harness({ maxConcurrent: 1 });
    h.store.update([T(5, 10, 12)]);
    expect(h.urls()).toEqual([urlOf(T(4, 5, 6))]);
  });

  it('shares a parent between siblings and loads coarse ancestors first', async () => {
    const h = harness({ maxConcurrent: 1, preloadAncestors: 2 });
    h.store.update([T(6, 20, 24), T(6, 21, 24)]);
    // z4 grandparent, then z5 parent, then the tiles in the order given.
    expect(h.urls()).toEqual([urlOf(T(4, 5, 6))]);
    await h.done(urlOf(T(4, 5, 6)));
    await h.done(urlOf(T(5, 10, 12)));
    await h.done(urlOf(T(6, 20, 24)));
    expect(h.urls()).toEqual([
      urlOf(T(4, 5, 6)), urlOf(T(5, 10, 12)), urlOf(T(6, 20, 24)), urlOf(T(6, 21, 24)),
    ]);
  });

  it('does not request a tile twice, nor one that is ready', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 1, 1)]);
    h.store.update([T(5, 1, 1)]);
    expect(h.urls()).toHaveLength(1);
    await h.done(urlOf(T(5, 1, 1)));
    h.store.update([T(5, 1, 1)]);
    expect(h.urls()).toHaveLength(1);
  });

  it('skips tiles outside the source zoom range and invalid addresses', () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(1, 0, 0), T(13, 0, 0), T(5, 99, 0), T(5, 1, 1)]);
    expect(h.urls()).toEqual([urlOf(T(5, 1, 1))]);
  });

  it('does not preload an ancestor below the source minimum zoom', () => {
    const h = harness({ preloadAncestors: 3 });
    h.store.update([T(3, 4, 4)]);
    // Ancestor at z2 only, then the tile; z1 and z0 are below minZoom.
    expect(h.urls()).toEqual([urlOf(T(2, 2, 2)), urlOf(T(3, 4, 4))]);
  });
});

describe('TileStore results', () => {
  it('holds a loaded tile and asks for a new frame', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 1, 1)]);
    expect(h.store.get(T(5, 1, 1))?.state).toBe('loading');
    await h.done(urlOf(T(5, 1, 1)), 'bitmap');
    expect(h.changed).toHaveBeenCalledTimes(1);
    expect(h.store.get(T(5, 1, 1))).toMatchObject({ state: 'ready', value: 'bitmap' });
  });

  it('knows nothing about a tile it was never asked for', () => {
    expect(harness().store.get(T(5, 1, 1))).toBeUndefined();
  });

  it('reports counts', async () => {
    const h = harness({ preloadAncestors: 0, maxConcurrent: 1 });
    h.store.update([T(5, 1, 1), T(5, 2, 1)]);
    expect(h.store.inFlightCount).toBe(1);
    expect(h.store.pendingCount).toBe(1);
    expect(h.store.cachedCount).toBe(2);
  });
});

describe('TileStore fallback', () => {
  it('returns the nearest loaded ancestor and how far up it is', async () => {
    const h = harness({ preloadAncestors: 2 });
    h.store.update([T(6, 20, 24)]);
    await h.done(urlOf(T(4, 5, 6)), 'grand');
    expect(h.store.fallbackFor(T(6, 20, 24))).toMatchObject({ levels: 2, entry: { value: 'grand' } });
    await h.done(urlOf(T(5, 10, 12)), 'parent');
    expect(h.store.fallbackFor(T(6, 20, 24))).toMatchObject({ levels: 1, entry: { value: 'parent' } });
  });

  it('has no fallback when no ancestor has loaded, or for a tile with no ancestors', async () => {
    const h = harness({ preloadAncestors: 1 });
    h.store.update([T(5, 10, 12)]);
    expect(h.store.fallbackFor(T(5, 10, 12))).toBeNull();
    expect(h.store.fallbackFor(T(0, 0, 0))).toBeNull();
  });

  it('protects the ancestor it hands out from eviction in that frame', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 2 });
    h.store.update([T(4, 5, 6), T(5, 0, 0)]);
    await h.done(urlOf(T(4, 5, 6)), 'parent');
    await h.done(urlOf(T(5, 0, 0)), 'other');
    h.store.beginFrame();
    expect(h.store.fallbackFor(T(5, 10, 12))?.entry.value).toBe('parent');
    // A third entry overflows the cache; only the tile not used this frame can go.
    h.store.update([T(5, 3, 3)]);
    expect(h.store.get(T(4, 5, 6))?.state).toBe('ready');
    expect(h.store.get(T(5, 0, 0))).toBeUndefined();
    expect(h.disposed).toEqual(['other']);
  });
});

describe('TileStore failures', () => {
  it('never requests a permanently missing tile again', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 1, 1)]);
    await h.fail(urlOf(T(5, 1, 1)), new TileLoadError('gone', { status: 404, permanent: true }));
    expect(h.store.get(T(5, 1, 1))?.state).toBe('missing');
    expect(h.errors).toEqual([[urlOf(T(5, 1, 1)), true]]);
    h.advanceClock(3_600_000);
    h.store.update([T(5, 1, 1)]);
    expect(h.urls()).toHaveLength(1);
  });

  it('requests a transiently failed tile again only after the cooldown', async () => {
    const h = harness({ preloadAncestors: 0, retryCooldownMs: 5000 });
    h.store.update([T(5, 1, 1)]);
    await h.fail(urlOf(T(5, 1, 1)), new TypeError('offline'));
    expect(h.errors).toEqual([[urlOf(T(5, 1, 1)), false]]);

    h.advanceClock(4999);
    h.store.update([T(5, 1, 1)]);
    expect(h.urls()).toHaveLength(1);

    h.advanceClock(1);
    h.store.update([T(5, 1, 1)]);
    expect(h.urls()).toHaveLength(2);
    expect(h.store.get(T(5, 1, 1))?.state).toBe('loading');
    await h.done(urlOf(T(5, 1, 1)), 'ok');
    expect(h.store.get(T(5, 1, 1))?.state).toBe('ready');
  });

  it('does not draw a fallback from a missing ancestor', async () => {
    const h = harness({ preloadAncestors: 1 });
    h.store.update([T(5, 10, 12)]);
    await h.fail(urlOf(T(4, 5, 6)), new TileLoadError('gone', { status: 404, permanent: true }));
    expect(h.store.fallbackFor(T(5, 10, 12))).toBeNull();
  });
});

describe('TileStore cancellation and release', () => {
  it('cancels tiles that left the view and lets them be requested again', async () => {
    const h = harness({ preloadAncestors: 0, maxConcurrent: 1 });
    h.store.update([T(5, 1, 1), T(5, 2, 1)]);
    expect(h.urls()).toEqual([urlOf(T(5, 1, 1))]);

    h.store.update([T(5, 9, 9)]);
    expect(latestAborted(h, T(5, 1, 1))).toBe(true);
    await h.settle();
    expect(h.store.get(T(5, 1, 1))).toBeUndefined();
    expect(h.store.get(T(5, 2, 1))).toBeUndefined();

    h.store.update([T(5, 1, 1)]);
    await h.settle();
    expect(h.urls()).toContain(urlOf(T(5, 9, 9)));
    expect(h.urls().filter((u) => u === urlOf(T(5, 1, 1)))).toHaveLength(2);
  });

  it('keeps a loaded tile that left the view, until the cache needs the room', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 1, 1)]);
    await h.done(urlOf(T(5, 1, 1)), 'kept');
    h.store.update([T(5, 9, 9)]);
    expect(h.store.get(T(5, 1, 1))).toMatchObject({ state: 'ready', value: 'kept' });
  });

  it('disposes the values it evicts', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 1 });
    h.store.update([T(5, 1, 1)]);
    await h.done(urlOf(T(5, 1, 1)), 'first');
    h.store.beginFrame();
    h.store.update([T(5, 2, 1)]);
    await h.done(urlOf(T(5, 2, 1)), 'second');
    h.store.beginFrame();
    expect(h.disposed).toEqual(['first']);
  });

  it('disposes a value that arrives for a tile it no longer wants', async () => {
    // A load that ignores the abort signal and still delivers a value afterwards.
    const late: Array<(v: string) => void> = [];
    const h = harness({
      preloadAncestors: 0,
      load: () => new Promise<string>((resolve) => late.push(resolve)),
    });
    h.store.update([T(5, 1, 1)]);
    const request = { resolve: late[0]! };
    h.store.destroy();
    request.resolve('late');
    await h.settle();
    expect(h.disposed).toEqual(['late']);
    expect(h.changed).not.toHaveBeenCalled();
  });

  it('destroy cancels loading, disposes held values and ignores further updates', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([T(5, 1, 1), T(5, 2, 1)]);
    await h.done(urlOf(T(5, 1, 1)), 'held');
    h.store.destroy();
    expect(latestAborted(h, T(5, 2, 1))).toBe(true);
    expect(h.disposed).toEqual(['held']);
    expect(h.store.cachedCount).toBe(0);
    h.store.update([T(5, 3, 3)]);
    expect(h.urls()).toHaveLength(2);
  });
});

function latestOf(h: ReturnType<typeof harness>, tile: TileIndex): Pending {
  return [...h.pending].reverse().find((p) => p.url === urlOf(tile))!;
}
function latestAborted(h: ReturnType<typeof harness>, tile: TileIndex): boolean {
  return latestOf(h, tile).signal.aborted;
}

// ── Regressions from the review ──────────────────────────────────────────────

describe('TileStore protects the current frame before it evicts', () => {
  const [A, B, C, D] = [T(5, 1, 1), T(5, 2, 1), T(5, 3, 1), T(5, 4, 1)];

  /** The call order the tile layer uses each frame. */
  function frame(h: ReturnType<typeof harness>, wanted: TileIndex[]) {
    h.store.beginFrame();
    h.store.update(wanted);
    for (const t of wanted) h.store.get(t);
    h.store.endFrame();
  }

  it('keeps a tile that stays in view when new tiles arrive and the cache is full', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 3 });
    frame(h, [A, B, C]);
    for (const t of [A, B, C]) await h.done(urlOf(t), urlOf(t));

    frame(h, [A, B, D]);
    expect(h.store.get(A)?.state).toBe('ready');
    expect(h.store.get(B)?.state).toBe('ready');
    expect(h.store.get(C)).toBeUndefined(); // offscreen, so it makes room
    expect(h.disposed).toEqual([urlOf(C)]);
  });

  it('keeps the ancestor a loading tile is drawn with', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 2 });
    const parent = T(4, 5, 6);
    const other = T(5, 0, 0);
    frame(h, [parent, other]);
    await h.done(urlOf(parent), 'parent');
    await h.done(urlOf(other), 'other');

    frame(h, [T(5, 10, 12)]); // child of `parent`, not loaded
    expect(h.store.fallbackFor(T(5, 10, 12))?.entry.value).toBe('parent');
    expect(h.disposed).toEqual(['other']);
  });

  it('does not dispose and reload visible tiles when the working set exceeds the cache', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 2 });
    const wanted = [A, B, C];
    frame(h, wanted);
    for (const t of wanted) await h.done(urlOf(t), urlOf(t));
    const requests = h.pending.length;

    for (let i = 0; i < 5; i++) frame(h, wanted);
    expect(h.disposed).toEqual([]);
    expect(h.pending).toHaveLength(requests);
    for (const t of wanted) expect(h.store.get(t)?.state).toBe('ready');

    // Once the view shrinks, the cache comes back to its limit.
    frame(h, [A]);
    expect(h.store.cachedCount).toBeLessThanOrEqual(2);
  });
});

describe('TileStore retries without interaction', () => {
  const clockOptions = { now: () => Date.now(), preloadAncestors: 0, retryCooldownMs: 5000 };
  const tile = T(5, 1, 1);

  it('requests a transiently failed tile again when the cooldown ends, with no new update', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TypeError('offline'));
    expect(h.pending).toHaveLength(1);

    await h.settle(4999);
    expect(h.pending).toHaveLength(1);
    await h.settle(1);
    expect(h.pending).toHaveLength(2);
    expect(h.store.get(tile)?.state).toBe('loading');

    await h.done(urlOf(tile), 'recovered');
    expect(h.store.get(tile)).toMatchObject({ state: 'ready', value: 'recovered' });
    expect(h.changed).toHaveBeenCalledTimes(1);
  });

  it('waits longer after each failure, up to a limit', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TypeError('offline'));
    await h.settle(5000);
    expect(h.pending).toHaveLength(2);

    await h.fail(urlOf(tile), new TypeError('offline'));
    await h.settle(9999);
    expect(h.pending).toHaveLength(2); // second wait is twice as long
    await h.settle(1);
    expect(h.pending).toHaveLength(3);

    for (let i = 0; i < 10; i++) {
      await h.fail(urlOf(tile), new TypeError('offline'));
      await h.settle(60_000);
    }
    expect(h.pending.length).toBeGreaterThan(5); // the wait is capped at a minute
  });

  it('does not retry a tile that left the view before the deadline', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TypeError('offline'));
    h.store.update([T(5, 9, 9)]);
    await h.settle(60_000);
    expect(h.urls().filter((u) => u === urlOf(tile))).toHaveLength(1);
  });

  it('does not retry after destroy', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TypeError('offline'));
    h.store.destroy();
    await h.settle(60_000);
    expect(h.pending).toHaveLength(1);
  });

  it('never retries a permanent failure', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TileLoadError('gone', { status: 404, permanent: true }));
    await h.settle(3_600_000);
    expect(h.pending).toHaveLength(1);
  });

  it('does not start a second retry when an update already restarted the tile', async () => {
    const h = harness(clockOptions);
    h.store.update([tile]);
    await h.fail(urlOf(tile), new TypeError('offline'));
    await h.settle(5000); // timer retry
    expect(h.pending).toHaveLength(2);
    h.store.update([tile]);
    await h.settle(10_000); // well inside the request timeout
    expect(h.pending).toHaveLength(2);
  });
});

describe('TileStore reorders requests that are already queued', () => {
  it('starts the tile that became most important, not the one that was queued first', async () => {
    const h = harness({ preloadAncestors: 0, maxConcurrent: 1 });
    const [A, B, C] = [T(5, 1, 1), T(5, 2, 1), T(5, 3, 1)];
    h.store.update([A, B, C]);
    expect(h.urls()).toEqual([urlOf(A)]);

    h.store.update([C, B, A]);
    await h.done(urlOf(A));
    expect(h.urls()).toEqual([urlOf(A), urlOf(C)]);
    await h.done(urlOf(C));
    expect(h.urls()).toEqual([urlOf(A), urlOf(C), urlOf(B)]);
  });

  it('puts new important tiles ahead of old queued ones and never requests twice', async () => {
    const h = harness({ preloadAncestors: 0, maxConcurrent: 1 });
    const [A, B, C, D] = [T(5, 1, 1), T(5, 2, 1), T(5, 3, 1), T(5, 4, 1)];
    h.store.update([A, B, C]);
    h.store.update([D, B, C, A]);
    await h.done(urlOf(A));
    await h.done(urlOf(D));
    await h.done(urlOf(B));
    await h.done(urlOf(C));
    expect(h.urls()).toEqual([urlOf(A), urlOf(D), urlOf(B), urlOf(C)]);
  });

  it('keeps ancestors ahead of their tiles when reordering', async () => {
    const h = harness({ preloadAncestors: 1, maxConcurrent: 1 });
    const [A, B] = [T(6, 20, 24), T(6, 40, 24)];
    h.store.update([A, B]);
    h.store.update([B, A]);
    // The one in flight is the first ancestor; then ancestors of the current order, coarse first.
    await h.done(h.urls()[0]!);
    await h.done(h.urls()[1]!);
    const order = h.urls();
    expect(order.slice(0, 2).every((u) => /\/5\//.test(u))).toBe(true);
    expect(order[2]).toBe(urlOf(B));
  });
});

// ── Statistics ───────────────────────────────────────────────────────────────

describe('TileStore statistics', () => {
  const [A, B, C] = [T(5, 1, 1), T(5, 2, 1), T(5, 3, 1)];

  it('counts every load attempt, retries included', async () => {
    const h = harness({ preloadAncestors: 0, maxRetries: 2, now: () => Date.now() });
    h.store.update([A]);
    expect(h.store.stats.requests).toBe(1);
    await h.fail(urlOf(A), new TypeError('offline'));
    await h.settle(500); // the loader retries after its own delay
    expect(h.store.stats.requests).toBe(2);
    await h.done(urlOf(A));
    expect(h.store.stats.requests).toBe(2);
  });

  it('does not count a tile that is only read or asked for again while it loads', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([A]);
    h.store.update([A]);
    h.store.get(A);
    expect(h.store.stats.requests).toBe(1);
  });

  it('counts a reuse when a held tile becomes wanted again, once, not on every frame', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([A]);
    await h.done(urlOf(A));
    expect(h.store.stats.cacheReuses).toBe(0); // first time wanted: it had to load

    for (let i = 0; i < 3; i++) h.store.update([A]);
    expect(h.store.stats.cacheReuses).toBe(0); // still in view: not a reuse

    h.store.update([B]); // A leaves the view but its value is kept
    h.store.update([A, B]); // and returns
    expect(h.store.stats.cacheReuses).toBe(1);
    for (let i = 0; i < 3; i++) h.store.update([A, B]);
    expect(h.store.stats.cacheReuses).toBe(1);
    expect(h.pending).toHaveLength(2); // A was never requested again
  });

  it('counts every held tile that comes back after the view was emptied', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([A, B]);
    await h.done(urlOf(A));
    await h.done(urlOf(B));
    h.store.update([]);
    h.store.update([A, B]);
    expect(h.store.stats.cacheReuses).toBe(2);
  });

  it('counts evictions under cache pressure but not teardown', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 1 });
    h.store.beginFrame();
    h.store.update([A]);
    await h.done(urlOf(A));
    h.store.beginFrame();
    h.store.update([B]);
    await h.done(urlOf(B));
    h.store.endFrame();
    expect(h.store.stats.evictions).toBe(1);
    expect(h.disposed).toEqual([urlOf(A)]);

    h.store.destroy();
    expect(h.store.stats.evictions).toBe(1);
    expect(h.disposed).toEqual([urlOf(A), urlOf(B)]);
  });

  it('adds up the size of the values it holds and releases it on eviction and teardown', async () => {
    const h = harness({ preloadAncestors: 0, maxCachedTiles: 1, sizeOf: (value: string) => value.length });
    h.store.beginFrame();
    h.store.update([A]);
    await h.done(urlOf(A), 'aaaa');
    expect(h.store.stats.readyBytes).toBe(4);

    h.store.beginFrame();
    h.store.update([B]);
    await h.done(urlOf(B), 'bb');
    h.store.endFrame();
    expect(h.store.stats.readyBytes).toBe(2); // A was evicted
    expect(h.store.stats.cachedTiles).toBe(1);

    h.store.destroy();
    expect(h.store.stats.readyBytes).toBe(0);
    expect(h.store.stats.cachedTiles).toBe(0);
  });

  it('does not count the size of a value it had to throw away', async () => {
    const h = harness({ preloadAncestors: 0, sizeOf: (value: string) => value.length });
    h.store.update([A]);
    const request = latestOf(h, A);
    h.store.update([B]); // A is cancelled
    request.resolve('late');
    await h.settle();
    expect(h.store.stats.readyBytes).toBe(0);
  });

  it('reports what is loading, queued and waiting to retry', async () => {
    const h = harness({ preloadAncestors: 0, maxConcurrent: 1, maxRetries: 1, now: () => Date.now(), retryCooldownMs: 5000 });
    h.store.update([A, B, C]);
    expect(h.store.stats).toMatchObject({ inFlight: 1, queued: 2, waitingRetries: 0 });

    await h.fail(urlOf(A), new TypeError('offline')); // the loader will retry A after a delay
    expect(h.store.stats).toMatchObject({ inFlight: 1, queued: 1, waitingRetries: 1 });

    await h.settle(500);
    await h.done(urlOf(B)); // slots free up in order; A's retry joins the queue
    expect(h.store.stats.waitingRetries).toBe(0);
  });

  it('counts a tile in the store cooldown as waiting to retry until it is retried or leaves the view', async () => {
    const h = harness({ preloadAncestors: 0, now: () => Date.now(), retryCooldownMs: 5000 });
    h.store.update([A]);
    await h.fail(urlOf(A), new TypeError('offline'));
    expect(h.store.stats).toMatchObject({ inFlight: 0, queued: 0, waitingRetries: 1 });

    h.store.update([B]); // A leaves the view: no retry will happen
    expect(h.store.stats.waitingRetries).toBe(0);
  });

  it('does not wait to retry after a permanent failure', async () => {
    const h = harness({ preloadAncestors: 0 });
    h.store.update([A]);
    await h.fail(urlOf(A), new TileLoadError('gone', { status: 404, permanent: true }));
    expect(h.store.stats).toMatchObject({ inFlight: 0, queued: 0, waitingRetries: 0 });
  });
});
