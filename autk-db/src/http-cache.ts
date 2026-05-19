/**
 * Wraps the browser Cache API with TTL-based JSON storage.
 *
 * Provides a best-effort cache for environments where `caches` is available, while silently degrading when it is not.
 *
 * @param cacheName - Unique cache storage name used by the browser.
 * @param ttl - Maximum age in milliseconds before cached entries are treated as expired.
 * @returns A cache instance that stores and retrieves JSON-serializable values.
 * @throws Never throws. Construction only stores configuration.
 * @example
 * const cache = new HttpCache<string>('tiles', 60_000);
 * await cache.set('a', 'value');
 * console.log(await cache.get('a')); // 'value'
 */
export class HttpCache<T = any> {
    /** Cache API handle opened for `cacheName`, or `null` when unavailable. */
    private cache: Cache | null = null;

    /** Stable browser cache storage name for this instance. */
    private readonly cacheName: string;

    /** Entry lifetime in milliseconds before reads treat data as expired. */
    private readonly ttl: number;

    /**
     * Creates a TTL-backed cache wrapper around the browser Cache API.
     *
     * Stores the cache configuration lazily and defers opening the underlying cache until the first operation.
     *
     * @param cacheName - Name of the browser cache storage bucket.
     * @param ttl - Time to live in milliseconds for stored entries.
     * @returns A configured `HttpCache` instance.
     * @throws Never throws.
     * @example
     * const cache = new HttpCache('api-responses', 24 * 60 * 60 * 1000);
     * console.log(cache instanceof HttpCache); // true
     */
    constructor(cacheName: string, ttl: number = 24 * 60 * 60 * 1000) {
        this.cacheName = cacheName;
        this.ttl = ttl;
    }

    /**
     * Opens the underlying browser cache on first use.
     *
     * Leaves `cache` as `null` when the Cache API is unavailable or opening the store fails.
     *
     * @returns Resolves when initialization has been attempted.
     * @throws Never throws. Failures leave the cache as `null`.
     * @example
     * const cache = new HttpCache('demo');
     * await (cache as any).init();
     * console.log(true); // true
     */
    private async init(): Promise<void> {
        if ('caches' in self && !this.cache) {
            try {
                this.cache = await caches.open(this.cacheName);
            } catch {
                this.cache = null;
            }
        }
    }

    /**
     * Returns a non-network `Request` object for an internal cache key.
     *
     * Uses a synthetic `https://cache.local/` URL so cache operations can reuse the browser Cache API request matching model.
     *
     * @param key - Logical cache key provided by the caller.
     * @returns Request instance used for cache `match`, `put`, and `delete` operations.
     * @throws Never throws.
     * @example
     * const cache = new HttpCache('demo');
     * const request = (cache as any).toRequest('road layer');
     * console.log(request.url); // 'https://cache.local/road%20layer'
     */
    private toRequest(key: string): Request {
        return new Request(`https://cache.local/${encodeURIComponent(key)}`);
    }

    /**
     * Reads a cached value when the entry exists and is still fresh.
     *
     * Expired entries are removed as a side effect so later reads do not return stale data.
     *
     * @param key - Cache key to look up.
     * @returns The cached value, or `null` when missing, expired, or unreadable.
     * @throws Never throws. Errors are caught and return `null`.
     * @example
     * const cache = new HttpCache<string>('demo');
     * await cache.set('theme', 'dark');
     * console.log(await cache.get('theme')); // 'dark'
     */
    async get(key: string): Promise<T | null> {
        await this.init();
        if (!this.cache) return null;

        try {
            const response = await this.cache.match(this.toRequest(key));
            if (!response) return null;

            const cached = await response.json();
            const now = Date.now();

            // Check if expired
            if (now - cached.timestamp > this.ttl) {
                await this.cache.delete(this.toRequest(key));
                return null;
            }

            return cached.data as T;
        } catch {
            return null;
        }
    }

    /**
     * Stores a value in the cache together with its write timestamp.
     *
     * Serializes the payload as JSON so future reads can validate TTL expiration without extra metadata storage.
     *
     * @param key - Cache key to store under.
     * @param data - Value to cache.
     * @returns Resolves when the write attempt has finished.
     * @throws Never throws. Errors are silently caught.
     * @example
     * const cache = new HttpCache<number>('demo');
     * await cache.set('zoom', 12);
     * console.log(await cache.get('zoom')); // 12
     */
    async set(key: string, data: T): Promise<void> {
        await this.init();
        if (!this.cache) return;

        try {
            const cached = {
                data,
                timestamp: Date.now(),
            };

            const response = new Response(JSON.stringify(cached), {
                headers: { 'Content-Type': 'application/json' },
            });

            await this.cache.put(this.toRequest(key), response);
        } catch {
            // Ignore cache errors
        }
    }

    /**
     * Removes a single cached entry when it exists.
     *
     * This is a best-effort invalidation helper and ignores Cache API failures.
     *
     * @param key - Cache key to remove.
     * @returns Resolves when the delete attempt has finished.
     * @throws Never throws. Errors are silently caught.
     * @example
     * const cache = new HttpCache<string>('demo');
     * await cache.delete('theme');
     * console.log(await cache.get('theme')); // null
     */
    async delete(key: string): Promise<void> {
        await this.init();
        if (!this.cache) return;

        try {
            await this.cache.delete(this.toRequest(key));
        } catch {
            // Ignore errors
        }
    }

    /**
     * Removes every cached entry from this cache store.
     *
     * Clears only keys visible through the current cache handle and ignores failures so callers do not depend on cache availability.
     *
     * @returns Resolves when the clear attempt has finished.
     * @throws Never throws. Errors are silently caught.
     * @example
     * const cache = new HttpCache<string>('demo');
     * await cache.clear();
     * console.log(await cache.get('any-key')); // null
     */
    async clear(): Promise<void> {
        await this.init();
        if (!this.cache) return;

        try {
            const keys = await this.cache.keys();
            await Promise.all(keys.map((request) => this.cache!.delete(request)));
        } catch {
            // Ignore errors
        }
    }
}
