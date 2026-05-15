/**
 * Simple HTTP cache using Browser Cache API with TTL support
 */
export class HttpCache<T = any> {
    private cache: Cache | null = null;
    private readonly cacheName: string;
    private readonly ttl: number;

    /**
     * Creates an HTTP cache with the given name and TTL.
     *
     * @param cacheName Name of the cache storage.
     * @param ttl Time to live in milliseconds (default: 24 hours).
     * @throws Never throws.
     */
    constructor(cacheName: string, ttl: number = 24 * 60 * 60 * 1000) {
        this.cacheName = cacheName;
        this.ttl = ttl;
    }

    /**
     * Initializes the Cache API storage if available.
     *
     * @throws Never throws. Failures leave the cache as `null`.
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
     * Returns cached data for a key, or `null` if missing or expired.
     *
     * @param key Cache key to look up.
     * @returns Cached data or `null`.
     * @throws Never throws. Errors are caught and return `null`.
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

    private toRequest(key: string): Request {
        return new Request(`https://cache.local/${encodeURIComponent(key)}`);
    }

    /**
     * Stores data in the cache with a current timestamp.
     *
     * @param key Cache key to store under.
     * @param data Value to cache.
     * @returns Nothing.
     * @throws Never throws. Errors are silently caught.
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
     * Deletes a specific key from the cache.
     *
     * @param key Cache key to remove.
     * @returns Nothing.
     * @throws Never throws. Errors are silently caught.
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
     * Clears all items from this cache.
     *
     * @returns Nothing.
     * @throws Never throws. Errors are silently caught.
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

