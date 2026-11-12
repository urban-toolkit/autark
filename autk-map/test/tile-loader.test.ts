import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TileLoadError, TileLoader, fetchTileImage, isPermanentStatus } from '../src/tile-loader';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A load the test settles by hand. */
interface Pending {
  url: string;
  signal: AbortSignal;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}

function harness(options: { maxConcurrent?: number; maxRetries?: number; retryDelayMs?: number; timeoutMs?: number } = {}) {
  const pending: Pending[] = [];
  const events: string[] = [];
  const loader = new TileLoader<string>({
    ...options,
    load: (url, signal) => new Promise<string>((resolve, reject) => {
      pending.push({ url, signal, resolve, reject });
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
    onLoaded: (key, value) => events.push(`loaded ${key}=${value}`),
    onFailed: (key, error, permanent) => events.push(`failed ${key} ${permanent ? 'permanent' : 'transient'} ${(error as Error).message}`),
    onCancelled: (key) => events.push(`cancelled ${key}`),
    dispose: (value) => events.push(`disposed ${value}`),
  });
  const started = () => pending.map((p) => p.url);
  /** The most recent load started for a URL, which is the one still waiting. */
  const latest = (url: string) => [...pending].reverse().find((p) => p.url === url)!;
  const done = async (url: string, value = url) => {
    latest(url).resolve(value);
    await vi.advanceTimersByTimeAsync(0);
  };
  const fail = async (url: string, error: unknown) => {
    latest(url).reject(error);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { loader, pending, events, started, done, fail };
}

describe('TileLoader ordering and limits', () => {
  it('runs at most maxConcurrent requests at once', async () => {
    const h = harness({ maxConcurrent: 2 });
    h.loader.request('a', 'A');
    h.loader.request('b', 'B');
    h.loader.request('c', 'C');
    expect(h.started()).toEqual(['A', 'B']);
    expect(h.loader.inFlightCount).toBe(2);
    expect(h.loader.pendingCount).toBe(1);
    await h.done('A');
    expect(h.started()).toEqual(['A', 'B', 'C']);
  });

  it('serves the most recently requested tile first', async () => {
    const h = harness({ maxConcurrent: 1 });
    h.loader.request('a', 'A');
    h.loader.request('b', 'B');
    h.loader.request('c', 'C');
    h.loader.request('d', 'D');
    await h.done('A');
    await h.done('D');
    await h.done('C');
    expect(h.started()).toEqual(['A', 'D', 'C', 'B']);
  });

  it('puts the first tile of requestAll at the front', async () => {
    const h = harness({ maxConcurrent: 1 });
    h.loader.request('old', 'OLD');
    h.loader.requestAll([{ key: 'x', url: 'X' }, { key: 'y', url: 'Y' }, { key: 'z', url: 'Z' }]);
    await h.done('OLD');
    await h.done('X');
    await h.done('Y');
    expect(h.started()).toEqual(['OLD', 'X', 'Y', 'Z']);
  });

  it('moves a queued tile to the front when it is asked for again', async () => {
    const h = harness({ maxConcurrent: 1 });
    h.loader.request('a', 'A');
    h.loader.request('b', 'B');
    h.loader.request('c', 'C');
    h.loader.request('b', 'B');
    await h.done('A');
    expect(h.started()).toEqual(['A', 'B']);
  });

  it('ignores a request for a tile already loading', () => {
    const h = harness();
    h.loader.request('a', 'A');
    h.loader.request('a', 'A');
    expect(h.started()).toEqual(['A']);
    expect(h.loader.inFlightCount).toBe(1);
  });
});

describe('TileLoader results', () => {
  it('reports a loaded tile once and then forgets it', async () => {
    const h = harness();
    h.loader.request('a', 'A');
    await h.done('A', 'bitmap');
    expect(h.events).toEqual(['loaded a=bitmap']);
    expect(h.loader.inFlightCount).toBe(0);
    expect(h.loader.pendingCount).toBe(0);
    h.loader.request('a', 'A');
    expect(h.started()).toEqual(['A', 'A']);
  });

  it('keeps loading after a callback throws', async () => {
    const pending: Array<() => void> = [];
    const loader = new TileLoader<string>({
      maxConcurrent: 1,
      load: (url) => new Promise<string>((resolve) => pending.push(() => resolve(url))),
      onLoaded: (key) => {
        if (key === 'a') throw new Error('callback failed');
      },
      onFailed: () => {},
    });
    // The rejection from the throwing callback is not the loader's to handle.
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    loader.request('a', 'A');
    loader.request('b', 'B');
    pending[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(pending).toHaveLength(2);
    process.off('unhandledRejection', unhandled);
  });
});

describe('TileLoader failures', () => {
  it('does not retry a permanent failure', async () => {
    const h = harness();
    h.loader.request('a', 'A');
    await h.fail('A', new TileLoadError('gone', { status: 404, permanent: true }));
    expect(h.events).toEqual(['failed a permanent gone']);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.started()).toEqual(['A']);
  });

  it('retries a transient failure with doubling delays, then gives up', async () => {
    const h = harness({ maxRetries: 2, retryDelayMs: 500 });
    h.loader.request('a', 'A');
    await h.fail('A', new TileLoadError('busy', { status: 503, permanent: false }));
    expect(h.started()).toHaveLength(1);
    expect(h.loader.pendingCount).toBe(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(h.started()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.started()).toHaveLength(2);

    await h.fail('A', new TileLoadError('busy', { status: 503, permanent: false }));
    await vi.advanceTimersByTimeAsync(999);
    expect(h.started()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.started()).toHaveLength(3);

    await h.fail('A', new TileLoadError('still busy', { status: 503, permanent: false }));
    expect(h.events).toEqual(['failed a transient still busy']);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.started()).toHaveLength(3);
  });

  it('treats an unknown error as transient', async () => {
    const h = harness({ maxRetries: 0 });
    h.loader.request('a', 'A');
    await h.fail('A', new TypeError('network down'));
    expect(h.events).toEqual(['failed a transient network down']);
  });

  it('times out a request that never answers and counts it as transient', async () => {
    const h = harness({ timeoutMs: 1000, maxRetries: 0 });
    h.loader.request('a', 'A');
    await vi.advanceTimersByTimeAsync(999);
    expect(h.pending[0]!.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.pending[0]!.signal.aborted).toBe(true);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatch(/^failed a transient Tile request timed out: A/);
  });

  it('lets other tiles run while one waits to retry', async () => {
    const h = harness({ maxConcurrent: 1, maxRetries: 1, retryDelayMs: 500 });
    h.loader.request('a', 'A');
    h.loader.request('b', 'B');
    await h.fail('A', new TypeError('blip'));
    expect(h.started()).toEqual(['A', 'B']);
    await h.done('B');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.started()).toEqual(['A', 'B', 'A']);
  });
});

describe('TileLoader cancellation', () => {
  it('drops queued tiles that are not wanted and reports them cancelled', async () => {
    const h = harness({ maxConcurrent: 1 });
    h.loader.request('a', 'A');
    h.loader.request('b', 'B');
    h.loader.request('c', 'C');
    h.loader.retainOnly(new Set(['a', 'c']));
    expect(h.events).toEqual(['cancelled b']);
    await h.done('A');
    await h.done('C');
    expect(h.started()).toEqual(['A', 'C']);
  });

  it('aborts a running request that is not wanted and does not report it as failed', async () => {
    const h = harness();
    h.loader.request('a', 'A');
    h.loader.retainOnly(new Set());
    expect(h.pending[0]!.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.events).toEqual(['cancelled a']);
    expect(h.loader.inFlightCount).toBe(0);
  });

  it('releases a value that arrives after its tile was cancelled', async () => {
    const pending: Array<(v: string) => void> = [];
    const events: string[] = [];
    const loader = new TileLoader<string>({
      load: () => new Promise<string>((resolve) => pending.push(resolve)),
      onLoaded: (key) => events.push(`loaded ${key}`),
      onFailed: () => events.push('failed'),
      dispose: (v) => events.push(`disposed ${v}`),
    });
    loader.request('a', 'A');
    loader.clear();
    pending[0]!('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual(['disposed late']);
  });

  it('drops a tile waiting to retry', async () => {
    const h = harness({ maxRetries: 1, retryDelayMs: 500 });
    h.loader.request('a', 'A');
    await h.fail('A', new TypeError('blip'));
    h.loader.retainOnly(new Set());
    expect(h.events).toEqual(['cancelled a']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.started()).toEqual(['A']);
  });

  it('can ask again for a cancelled tile', async () => {
    const h = harness();
    h.loader.request('a', 'A');
    h.loader.clear();
    h.loader.request('a', 'A');
    expect(h.started()).toEqual(['A', 'A']);
    await h.done('A');
    expect(h.events).toContain('loaded a=A');
  });
});

describe('TileLoader queue state', () => {
  it('separates queued tasks from those waiting out a retry delay', async () => {
    const { loader, fail, started } = harness({ maxConcurrent: 1, maxRetries: 1, retryDelayMs: 500 });
    loader.requestAll([{ key: 'a', url: 'a' }, { key: 'b', url: 'b' }, { key: 'c', url: 'c' }]);
    expect(started()).toEqual(['a']);
    expect(loader).toMatchObject({ inFlightCount: 1, queuedCount: 2, waitingCount: 0 });

    await fail('a', new TypeError('offline')); // a waits 500 ms, b starts
    expect(loader).toMatchObject({ inFlightCount: 1, queuedCount: 1, waitingCount: 1 });
    expect(loader.pendingCount).toBe(2); // queued and waiting together, as before

    await vi.advanceTimersByTimeAsync(500); // a's delay ends and it queues behind c
    expect(loader).toMatchObject({ queuedCount: 2, waitingCount: 0 });
  });

  it('counts nothing once cleared', () => {
    const { loader } = harness({ maxConcurrent: 1 });
    loader.requestAll([{ key: 'a', url: 'a' }, { key: 'b', url: 'b' }]);
    loader.clear();
    expect(loader).toMatchObject({ queuedCount: 0, waitingCount: 0 });
  });
});

describe('isPermanentStatus', () => {
  it.each([
    [400, true], [403, true], [404, true], [410, true],
    [408, false], [429, false],
    [500, false], [502, false], [503, false],
    [200, false], [304, false],
  ])('status %i is permanent: %s', (status, expected) => {
    expect(isPermanentStatus(status)).toBe(expected);
  });
});

describe('fetchTileImage', () => {
  const signal = new AbortController().signal;

  it('fetches with CORS and no credentials and decodes the image', async () => {
    const bitmap = { width: 256 } as ImageBitmap;
    const fetchMock = vi.fn(async () => new Response(new Blob(['x'])));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    await expect(fetchTileImage('https://e.org/1/2/3.png', signal)).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledWith('https://e.org/1/2/3.png', { signal, mode: 'cors', credentials: 'omit' });
  });

  it.each([[404, true], [503, false], [429, false]])('turns status %i into a TileLoadError (permanent: %s)', async (status, permanent) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })));
    await expect(fetchTileImage('https://e.org/x', signal)).rejects.toMatchObject({ name: 'TileLoadError', status, permanent });
  });

  it('turns a decode failure into a permanent error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['not an image']))));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad data'); }));
    await expect(fetchTileImage('https://e.org/x', signal)).rejects.toMatchObject({ permanent: true, message: expect.stringContaining('bad data') });
  });

  it('lets a network error through unchanged, so the loader retries it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchTileImage('https://e.org/x', signal)).rejects.toBeInstanceOf(TypeError);
  });
});
