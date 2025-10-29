/**
 * Simple HTTP cache using Browser Cache API with TTL support
 */
export class HttpCache<T = any> {
    private cache: Cache | null = null;
    private readonly cacheName: string;
    private readonly ttl: number;

    /**
     * @param cacheName - Name of the cache storage
     * @param ttl - Time to live in milliseconds (default: 24 hours)
     */
    constructor(cacheName: string, ttl: number = 24 * 60 * 60 * 1000) {
        this.cacheName = cacheName;
        this.ttl = ttl;
    }

    /**
     * Initialize cache if available
     */
    private async init(): Promise<void> {
        if ('caches' in self && !this.cache) {
            try {
                this.cache = await caches.open(this.cacheName);
            } catch (e) {
                this.cache = null;
            }
        }
    }

    /**
     * Get data from cache if available and not expired
     */
    async get(key: string): Promise<T | null> {
        await this.init();
        if (!this.cache) return null;

        try {
            const response = await this.cache.match(key);
            if (!response) return null;

            const cached = await response.json();
            const now = Date.now();

            // Check if expired
            if (now - cached.timestamp > this.ttl) {
                await this.cache.delete(key);
                return null;
            }

            return cached.data as T;
        } catch (e) {
            return null;
        }
    }

    /**
     * Store data in cache with current timestamp
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

            await this.cache.put(key, response);
        } catch (e) {
            // Ignore cache errors
        }
    }

    /**
     * Delete a specific key from cache
     */
    async delete(key: string): Promise<void> {
        await this.init();
        if (!this.cache) return;

        try {
            await this.cache.delete(key);
        } catch (e) {
            // Ignore errors
        }
    }

    /**
     * Clear all items from this cache
     */
    async clear(): Promise<void> {
        await this.init();
        if (!this.cache) return;

        try {
            const keys = await this.cache.keys();
            await Promise.all(keys.map((request) => this.cache!.delete(request)));
        } catch (e) {
            // Ignore errors
        }
    }
}

