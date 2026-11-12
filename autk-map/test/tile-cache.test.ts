import { describe, expect, it, vi } from 'vitest';
import { TileCache } from '../src/tile-cache';
import type { TileEntry } from '../src/tile-cache';
import type { TileIndex } from '../src/tile-index';

const tile = (x: number): TileIndex => ({ z: 4, x, y: 0 });

/** Adds a ready entry. */
function ready(cache: TileCache<string>, name: string, value = name): TileEntry<string> {
  cache.startLoading(name, tile(0));
  return cache.resolve(name, value)!;
}

describe('TileCache states', () => {
  it('moves loading to ready with a value', () => {
    const cache = new TileCache<string>(4);
    const entry = cache.startLoading('a', tile(1));
    expect(entry.state).toBe('loading');
    expect(cache.resolve('a', 'texture')).toBe(entry);
    expect(entry).toMatchObject({ state: 'ready', value: 'texture' });
  });

  it('moves loading to missing with an error and a retry time', () => {
    const cache = new TileCache<string>(4);
    cache.startLoading('a', tile(1));
    const entry = cache.fail('a', new Error('x'), 1234)!;
    expect(entry).toMatchObject({ state: 'missing', retryAfter: 1234 });
    expect(entry.error).toBeInstanceOf(Error);
  });

  it('refuses a result for an entry that is not loading, so the caller can release it', () => {
    const cache = new TileCache<string>(4);
    expect(cache.resolve('nothing', 'v')).toBeUndefined();
    ready(cache, 'a');
    expect(cache.resolve('a', 'again')).toBeUndefined();
    expect(cache.fail('a', new Error('late'), 0)).toBeUndefined();
    expect(cache.peek('a')?.value).toBe('a');
  });

  it('puts a missing entry back to loading and keeps a loading or ready one as is', () => {
    const cache = new TileCache<string>(4);
    cache.startLoading('a', tile(1));
    cache.fail('a', new Error('x'), Infinity);
    const again = cache.startLoading('a', tile(1));
    expect(again).toMatchObject({ state: 'loading', retryAfter: 0 });
    expect(again.error).toBeUndefined();

    const done = ready(cache, 'b');
    expect(cache.startLoading('b', tile(2))).toBe(done);
    expect(done.state).toBe('ready');
  });
});

describe('TileCache eviction', () => {
  it('evicts the least recently used ready entry and reports its value', () => {
    // The cache clears an entry's value after the handler returns, so record it inside the handler.
    const evicted: Array<[string, string | undefined]> = [];
    const cache = new TileCache<string>(2, (entry) => evicted.push([entry.key, entry.value]));
    ready(cache, 'a');
    ready(cache, 'b');
    cache.beginFrame();
    ready(cache, 'c');
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBeDefined();
    expect(evicted).toEqual([['a', 'a']]);
  });

  it('counts a read as use, so a read entry outlives an untouched one', () => {
    const cache = new TileCache<string>(2);
    ready(cache, 'a');
    ready(cache, 'b');
    cache.beginFrame();
    cache.get('a');
    cache.beginFrame();
    ready(cache, 'c');
    expect(cache.peek('a')).toBeDefined();
    expect(cache.peek('b')).toBeUndefined();
  });

  it('does not count a peek as use', () => {
    const cache = new TileCache<string>(2);
    ready(cache, 'a');
    ready(cache, 'b');
    cache.beginFrame();
    cache.peek('a');
    ready(cache, 'c');
    expect(cache.peek('a')).toBeUndefined();
  });

  it('never evicts an entry read in the current frame, and trims at the next frame', () => {
    const onEvict = vi.fn();
    const cache = new TileCache<string>(1, onEvict);
    cache.beginFrame();
    ready(cache, 'a');
    ready(cache, 'b');
    cache.get('a');
    cache.get('b');
    ready(cache, 'c');
    cache.get('c');
    expect(cache.size).toBe(3);
    expect(onEvict).not.toHaveBeenCalled();
    cache.beginFrame();
    expect(cache.size).toBe(3); // starting a frame evicts nothing, so the frame can claim what it needs first
    cache.trim();
    expect(cache.size).toBe(1);
    expect(onEvict).toHaveBeenCalledTimes(2);
  });

  it('lets a new frame claim entries before trim evicts the rest', () => {
    const onEvict = vi.fn();
    const cache = new TileCache<string>(2, onEvict);
    cache.beginFrame();
    ready(cache, 'a');
    ready(cache, 'b');
    ready(cache, 'c');
    cache.beginFrame();
    cache.get('a'); // claimed by the new frame, though it is the oldest
    cache.trim();
    expect(cache.peek('a')).toBeDefined();
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.peek('c')).toBeDefined();
    expect(onEvict).toHaveBeenCalledTimes(1);
  });

  it('never evicts an entry that is still loading', () => {
    const cache = new TileCache<string>(1);
    cache.beginFrame();
    cache.startLoading('loading', tile(1));
    cache.beginFrame();
    ready(cache, 'a');
    ready(cache, 'b');
    cache.beginFrame();
    cache.trim();
    // Both ready entries are older than this frame and over the limit; the loading one stays.
    expect(cache.peek('loading')).toBeDefined();
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it('evicts missing entries without calling the handler', () => {
    const onEvict = vi.fn();
    const cache = new TileCache<string>(1, onEvict);
    cache.startLoading('gone', tile(1));
    cache.fail('gone', new Error('x'), Infinity);
    cache.beginFrame();
    ready(cache, 'a');
    expect(cache.peek('gone')).toBeUndefined();
    expect(onEvict).not.toHaveBeenCalled();
  });

  it('trims when the limit is lowered', () => {
    const onEvict = vi.fn();
    const cache = new TileCache<string>(4, onEvict);
    ['a', 'b', 'c', 'd'].forEach((k) => ready(cache, k));
    cache.beginFrame();
    cache.setLimit(2);
    expect(cache.size).toBe(2);
    expect(cache.limit).toBe(2);
    expect(onEvict).toHaveBeenCalledTimes(2);
    cache.setLimit(0);
    expect(cache.limit).toBe(1);
  });
});

describe('TileCache removal', () => {
  it('reports a value on delete and clear but not for entries without one', () => {
    const onEvict = vi.fn();
    const cache = new TileCache<string>(8, onEvict);
    ready(cache, 'a');
    cache.startLoading('b', tile(1));
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.delete('b')).toBe(true);
    expect(onEvict).toHaveBeenCalledTimes(1);

    ready(cache, 'c');
    ready(cache, 'd');
    cache.startLoading('e', tile(2));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(onEvict).toHaveBeenCalledTimes(3);
  });

  it('drops the value from an entry it released', () => {
    const cache = new TileCache<string>(8);
    const entry = ready(cache, 'a');
    cache.delete('a');
    expect(entry.value).toBeUndefined();
  });
});

describe('TileCache statistics and eviction reasons', () => {
  it('counts the entries that hold a value', () => {
    const cache = new TileCache<string>(8);
    ready(cache, 'a');
    ready(cache, 'b');
    cache.startLoading('c', tile(3));
    cache.startLoading('d', tile(4));
    cache.fail('d', new Error('x'), 0);
    expect(cache.readyCount).toBe(2);
    expect(cache.size).toBe(4);
  });

  it('tells pressure eviction from removal', () => {
    const reasons: Array<[string, string]> = [];
    const cache = new TileCache<string>(1, (entry, reason) => reasons.push([entry.key, reason]));
    cache.beginFrame();
    ready(cache, 'a');
    cache.beginFrame();
    ready(cache, 'b');
    cache.trim(); // 'a' goes because the cache needs room
    cache.delete('b'); // the caller removed it
    ready(cache, 'c');
    cache.clear();
    expect(reasons).toEqual([['a', 'pressure'], ['b', 'removed'], ['c', 'removed']]);
  });
});
