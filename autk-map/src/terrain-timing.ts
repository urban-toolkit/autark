/**
 * @module terrain-timing
 * Rolling timings of terrain work, summarized as percentiles.
 */

/** Percentiles of a set of durations, in milliseconds. All zero when there are none. */
export interface TimingSummary {
    /** Durations recorded in the window. */
    count: number;
    /** Median. */
    p50: number;
    /** 95th percentile. */
    p95: number;
    /** 99th percentile. */
    p99: number;
    /** Largest. */
    max: number;
}

/** Durations kept when none is given. */
export const DEFAULT_TIMING_CAPACITY = 2000;

/** The most recent durations, summarized on demand. */
export class TimingWindow {
    private readonly values: number[] = [];
    private cached: TimingSummary | undefined;

    /** @param capacity - Most recent durations kept. */
    constructor(private readonly capacity: number = DEFAULT_TIMING_CAPACITY) {}

    /**
     * Records one duration.
     *
     * @param ms - Duration in milliseconds; negative or non-finite values are ignored.
     */
    record(ms: number): void {
        if (!Number.isFinite(ms) || ms < 0) return;
        this.cached = undefined;
        this.values.push(ms);
        if (this.values.length > this.capacity) this.values.shift();
    }

    /** Forgets every duration. */
    reset(): void {
        this.values.length = 0;
        this.cached = undefined;
    }

    /**
     * Percentiles of the durations kept, by nearest rank.
     *
     * @returns The summary; zeros when nothing was recorded.
     */
    summary(): TimingSummary {
        if (this.cached) return { ...this.cached };
        const count = this.values.length;
        if (count === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
        const sorted = [...this.values].sort((a, b) => a - b);
        const at = (fraction: number): number => sorted[Math.min(count - 1, Math.max(0, Math.ceil(fraction * count) - 1))]!;
        this.cached = { count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[count - 1]! };
        return { ...this.cached };
    }
}
