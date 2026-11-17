import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OsmProcessingPipeline } from '../src/internal/process-osm/pipeline';
import { LoadOsmFromOverpassApiUseCase } from '../src/use-cases/load-osm-overpass/use-case';

// Exercise HTTP acquisition without starting DuckDB or contacting the public service.
let api: { fetchWithRetry(query: string): Promise<Response>; waitForSlot(): Promise<void> };
const query = '[out:json][timeout:60];node(40.700,-74.019,40.714,-74.003);out;';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // Neutral jitter for exact backoff assertions.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  api = new LoadOsmFromOverpassApiUseCase({} as AsyncDuckDBConnection, {} as OsmProcessingPipeline) as unknown as typeof api;
  vi.spyOn(api, 'waitForSlot').mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Overpass HTTP retries', () => {
  it.each([429, 502, 503])('waits before retrying HTTP %i and preserves the query on recovery', async status => {
    const success = new Response('{"elements":[]}');
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('All query workers are busy and the request queue is full.', { status }))
      .mockResolvedValueOnce(new Response('Still at capacity.', { status }))
      .mockResolvedValueOnce(success);
    const result = api.fetchWithRetry(query).then(response => ({ response }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(44_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ response: success });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toBe('https://overpass-api.de/api/interpreter');
      expect(options?.method).toBe('POST');
      expect(new URLSearchParams(String(options?.body)).get('data')).toBe(query);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after six retries and preserves the final 502 capacity error', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      '<h1>502 Gateway Timeout</h1><p>All query workers are busy and the request queue is full.</p>',
      { status: 502, statusText: 'Bad Gateway' },
    ));
    const result = expect(api.fetchWithRetry(query)).rejects.toThrow(
      'Overpass API error: 502 Bad Gateway: 502 Gateway Timeout All query workers are busy and the request queue is full.',
    );
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(console.warn).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry malformed queries', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<p>Error: line 1: parse error.</p>', { status: 400, statusText: 'Bad Request' },
    ));
    await expect(api.fetchWithRetry(query)).rejects.toThrow('Overpass API error: 400 Bad Request: Error: line 1: parse error.');
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still reduces query timeout after a 504 gateway timeout', async () => {
    const success = new Response('{"elements":[]}');
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Gateway timeout', { status: 504 }))
      .mockResolvedValueOnce(success);
    const result = api.fetchWithRetry(query);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe(success);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URLSearchParams(String(fetch.mock.calls[1][1]?.body)).get('data')).toContain('[timeout:45]');
    expect(vi.getTimerCount()).toBe(0);
  });
});
