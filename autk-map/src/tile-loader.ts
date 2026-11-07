/**
 * @module AutkMapTileLoader
 * Request queue for tile images.
 *
 * The loader limits how many tiles are fetched at once and decides which to
 * fetch next. The most recently requested tile goes first, so tiles for the
 * current view are served before tiles the view has already left, and asking
 * again for a queued tile moves it to the front. A tile no longer wanted is
 * dropped from the queue or aborted in flight. Transient failures are retried
 * with a growing delay; permanent ones (such as a missing tile) are not.
 *
 * The loader does no decoding or caching of its own: it is given a `load`
 * function and reports results through callbacks.
 */

/** Error raised for a tile that could not be loaded. */
export class TileLoadError extends Error {
    /** HTTP status, when the server answered. */
    readonly status: number | undefined;
    /** `true` when retrying cannot help, such as for a missing tile. */
    readonly permanent: boolean;

    constructor(message: string, options: { status?: number; permanent: boolean }) {
        super(message);
        this.name = 'TileLoadError';
        this.status = options.status;
        this.permanent = options.permanent;
    }
}

/**
 * Tells whether an HTTP status means the tile will never load.
 *
 * Client errors are permanent, except for timeouts and rate limiting, which
 * may pass.
 *
 * @param status - HTTP status code.
 * @returns `true` for a permanent failure.
 */
export function isPermanentStatus(status: number): boolean {
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Fetches and decodes one tile image.
 *
 * Needs a server that allows cross-origin requests, as the large tile
 * providers do.
 *
 * @param url - Tile URL.
 * @param signal - Aborts the request.
 * @returns The decoded image.
 * @throws {TileLoadError} For a non-success status or an undecodable image.
 */
export async function fetchTileImage(url: string, signal: AbortSignal): Promise<ImageBitmap> {
    const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
    if (!response.ok) {
        throw new TileLoadError(`Tile request failed with status ${response.status}: ${url}`, {
            status: response.status,
            permanent: isPermanentStatus(response.status),
        });
    }
    const blob = await response.blob();
    try {
        return await createImageBitmap(blob);
    } catch (error) {
        throw new TileLoadError(`Tile could not be decoded: ${url} (${(error as Error).message})`, { permanent: true });
    }
}

/** Options for a {@link TileLoader}. */
export interface TileLoaderOptions<T> {
    /** Loads one tile. It should reject with an `AbortError` when `signal` aborts. */
    load: (url: string, signal: AbortSignal) => Promise<T>;
    /** A tile loaded. */
    onLoaded: (key: string, value: T) => void;
    /** A tile failed for good, after any retries. */
    onFailed: (key: string, error: unknown, permanent: boolean) => void;
    /** A tile was cancelled before it loaded, so nothing will be reported for it. */
    onCancelled?: (key: string) => void;
    /** Releases a value that arrived after its tile was cancelled. */
    dispose?: (value: T) => void;
    /** Requests in flight at once. Defaults to 8. */
    maxConcurrent?: number;
    /** Retries after a transient failure. Defaults to 2. */
    maxRetries?: number;
    /** Delay before the first retry in ms, doubled for each further one. Defaults to 500. */
    retryDelayMs?: number;
    /** Gives up on a request after this many ms and treats it as a transient failure. Defaults to 15000. */
    timeoutMs?: number;
}

type TaskStatus = 'queued' | 'inflight' | 'waiting';

interface Task {
    readonly key: string;
    readonly url: string;
    status: TaskStatus;
    attempt: number;
    controller?: AbortController;
    timer?: ReturnType<typeof setTimeout>;
    cancelled: boolean;
}

const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Queue that loads tiles a few at a time, newest request first.
 *
 * @typeParam T - Value produced for a loaded tile.
 */
export class TileLoader<T> {
    private readonly options: TileLoaderOptions<T>;
    private readonly maxConcurrent: number;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private readonly timeoutMs: number;
    private readonly tasks = new Map<string, Task>();
    /** Keys of queued tasks; the front (index 0) is served first. */
    private queue: string[] = [];
    private active = 0;

    /**
     * Creates a loader.
     *
     * @param options - Load function, callbacks and limits.
     */
    constructor(options: TileLoaderOptions<T>) {
        this.options = options;
        this.maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT));
        this.maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
        this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
        this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }

    /** Tiles waiting to start, including those waiting to retry. */
    get pendingCount(): number {
        let waiting = 0;
        for (const task of this.tasks.values()) if (task.status !== 'inflight') waiting++;
        return waiting;
    }

    /** Requests currently running. */
    get inFlightCount(): number {
        return this.active;
    }

    /** Tasks ready to start, waiting for a free slot. */
    get queuedCount(): number {
        let queued = 0;
        for (const task of this.tasks.values()) if (task.status === 'queued') queued++;
        return queued;
    }

    /** Tasks waiting out a retry delay after a transient failure. */
    get waitingCount(): number {
        let waiting = 0;
        for (const task of this.tasks.values()) if (task.status === 'waiting') waiting++;
        return waiting;
    }

    /**
     * Asks for one tile. It goes to the front of the queue; a queued tile
     * already there is moved. A tile already loading or waiting to retry is left alone.
     *
     * @param key - Tile key.
     * @param url - Tile URL.
     */
    request(key: string, url: string): void {
        this.enqueue(key, url);
        this.pump();
    }

    /**
     * Asks for several tiles, listed from most to least important. The first
     * ends up at the front of the queue.
     *
     * @param items - Tiles in priority order.
     */
    requestAll(items: ReadonlyArray<{ key: string; url: string }>): void {
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i] as { key: string; url: string };
            this.enqueue(item.key, item.url);
        }
        this.pump();
    }

    /**
     * Cancels every tile not in the given set: queued ones leave the queue,
     * running ones are aborted, and retries are dropped.
     *
     * @param wanted - Keys to keep.
     */
    retainOnly(wanted: ReadonlySet<string>): void {
        for (const task of [...this.tasks.values()]) {
            if (!wanted.has(task.key)) this.cancel(task);
        }
    }

    /** Cancels everything. */
    clear(): void {
        this.retainOnly(new Set());
    }

    private enqueue(key: string, url: string): void {
        const existing = this.tasks.get(key);
        if (existing) {
            if (existing.status === 'queued') {
                this.queue.splice(this.queue.indexOf(key), 1);
                this.queue.unshift(key);
            }
            return;
        }
        this.tasks.set(key, { key, url, status: 'queued', attempt: 0, cancelled: false });
        this.queue.unshift(key);
    }

    private pump(): void {
        while (this.active < this.maxConcurrent && this.queue.length > 0) {
            const key = this.queue.shift() as string;
            const task = this.tasks.get(key);
            if (task) this.start(task);
        }
    }

    private start(task: Task): void {
        task.status = 'inflight';
        task.controller = new AbortController();
        const { controller } = task;
        this.active++;

        let timedOut = false;
        task.timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.timeoutMs);

        let promise: Promise<T>;
        try {
            promise = this.options.load(task.url, controller.signal);
        } catch (error) {
            promise = Promise.reject(error);
        }

        promise.then(
            (value) => {
                this.finish(task);
                try {
                    if (task.cancelled) {
                        this.options.dispose?.(value);
                    } else {
                        this.tasks.delete(task.key);
                        this.options.onLoaded(task.key, value);
                    }
                } finally {
                    this.pump();
                }
            },
            (error: unknown) => {
                this.finish(task);
                try {
                    if (!task.cancelled) {
                        this.handleFailure(task, timedOut
                            ? new TileLoadError(`Tile request timed out: ${task.url}`, { permanent: false })
                            : error);
                    }
                } finally {
                    this.pump();
                }
            },
        );
    }

    private finish(task: Task): void {
        clearTimeout(task.timer);
        task.timer = undefined;
        task.controller = undefined;
        this.active--;
    }

    private handleFailure(task: Task, error: unknown): void {
        const permanent = error instanceof TileLoadError && error.permanent;
        if (!permanent && task.attempt < this.maxRetries) {
            task.status = 'waiting';
            const delay = this.retryDelayMs * 2 ** task.attempt;
            task.attempt++;
            task.timer = setTimeout(() => {
                task.timer = undefined;
                task.status = 'queued';
                this.queue.push(task.key);
                this.pump();
            }, delay);
            return;
        }
        this.tasks.delete(task.key);
        this.options.onFailed(task.key, error, permanent);
    }

    private cancel(task: Task): void {
        this.tasks.delete(task.key);
        task.cancelled = true;
        if (task.status === 'queued') {
            this.queue.splice(this.queue.indexOf(task.key), 1);
        } else if (task.status === 'waiting') {
            clearTimeout(task.timer);
            task.timer = undefined;
        } else {
            task.controller?.abort();
        }
        this.options.onCancelled?.(task.key);
    }
}
