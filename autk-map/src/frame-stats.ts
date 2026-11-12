/**
 * @module AutkMapFrameStats
 * CPU time and rate of the frames a map renders.
 *
 * Time is measured on the CPU around the work of preparing and submitting a
 * frame. It does not include the GPU executing the commands, so it can look
 * healthy while the GPU is the bottleneck. In on-demand mode frames come in
 * bursts, so the rate describes the bursts and falls to zero when rendering
 * stops, instead of keeping the last value.
 */

/** A snapshot of frame statistics. */
export interface FrameStatsSnapshot {
    /** Frames rendered since the map was created. Stops increasing when the map is idle. */
    frameCount: number;
    /** CPU milliseconds the last frame took to prepare and submit; 0 before the first frame. */
    lastFrameCpuMs: number;
    /** Average CPU milliseconds per frame over the recent frames; 0 when there are none. */
    averageFrameCpuMs: number;
    /** Frames per second while frames are being rendered; 0 when fewer than two frames came in the last second. */
    framesPerSecond: number;
}

/** Recent frames kept for the average and the rate. */
const MAX_RECENT_FRAMES = 240;
/** How far back the rate looks, in milliseconds. */
const RATE_WINDOW_MS = 1000;

/** Collects frame durations and end times. */
export class FrameStats {
    private frameCount = 0;
    private lastFrameCpuMs = 0;
    private readonly ends: number[] = [];
    private readonly durations: number[] = [];

    /**
     * Records a rendered frame.
     *
     * @param cpuMs - CPU milliseconds spent on the frame.
     * @param endMs - Clock time, in milliseconds, at which the frame finished.
     */
    record(cpuMs: number, endMs: number): void {
        this.frameCount++;
        this.lastFrameCpuMs = cpuMs;
        this.ends.push(endMs);
        this.durations.push(cpuMs);
        if (this.ends.length > MAX_RECENT_FRAMES) {
            this.ends.shift();
            this.durations.shift();
        }
    }

    /**
     * Reads the statistics at a moment in time.
     *
     * @param nowMs - Clock time, in milliseconds, on the same clock as {@link FrameStats.record}.
     * @returns A snapshot; the rate counts only frames from the last second before `nowMs`.
     */
    snapshot(nowMs: number): FrameStatsSnapshot {
        const average = this.durations.length > 0
            ? this.durations.reduce((sum, d) => sum + d, 0) / this.durations.length
            : 0;

        const recent = this.ends.filter((t) => nowMs - t <= RATE_WINDOW_MS);
        const span = recent.length >= 2 ? (recent[recent.length - 1] as number) - (recent[0] as number) : 0;
        const framesPerSecond = span > 0 ? ((recent.length - 1) / span) * 1000 : 0;

        return {
            frameCount: this.frameCount,
            lastFrameCpuMs: this.lastFrameCpuMs,
            averageFrameCpuMs: average,
            framesPerSecond,
        };
    }
}
