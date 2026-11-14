/** Tile-aware elevation validation. All numerical assessment lives in autk-core. */
import { assessElevationSample, isPotentialElevationOutlier, replaceElevationOutlier, replaceElevationDiscontinuity } from '@urban-toolkit/autk-core';
import type { ElevationValidationStats, ResolvedElevationValidation } from '@urban-toolkit/autk-core';
import type { DemTile } from './dem-decode';
import { EARTH_RADIUS, WEB_MERCATOR_EXTENT } from './tile-projection';

interface ValidationBlock { tile?: DemTile; flags: Uint8Array; spacing: Float64Array; replacements?: Float32Array; reference?: number }

/** A frozen composition snapshot owns these decisions; new arrivals create a new validator. */
export class DemValidator {
    readonly stats: ElevationValidationStats = { checked: 0, rejected: 0, corrected: 0, unresolved: 0 };
    private readonly blocks = new Map<number, ValidationBlock>();
    private bytes = 0;
    private lastKey = -1;
    private lastBlock!: ValidationBlock;

    constructor(private readonly size: number, private readonly options: ResolvedElevationValidation,
        private readonly tile: (z: number, x: number, y: number) => DemTile | undefined,
        private readonly raw: (z: number, i: number, j: number) => number,
        private readonly coarse: (z: number, px: number, py: number, minZoom: number) => number,
        private readonly fallback: () => void, private readonly memory?: (bytes: number) => void) {}

    read(z: number, i: number, j: number, minZoom: number): number {
        const size = this.size, span = 2 ** z * size;
        i = ((i % span) + span) % span;
        j = Math.max(0, Math.min(span - 1, j));
        const x = Math.floor(i / size), y = Math.floor(j / size), key = (z * 4194304 + x) * 4194304 + y;
        let block = this.lastBlock;
        if (key !== this.lastKey) {
            block = this.blocks.get(key)!;
            if (!block) { block = { tile: this.tile(z, x, y), flags: new Uint8Array(size * size), spacing: new Float64Array(size) }; this.blocks.set(key, block); this.bytes += block.flags.byteLength + block.spacing.byteLength; this.memory?.(this.bytes); }
            this.lastKey = key; this.lastBlock = block;
        }
        const lx = i - x * size, ly = j - y * size, at = ly * size + lx;
        const value = block.tile?.heights[at] ?? NaN;
        const state = block.flags[at];
        if (state === 1) return value;
        if (state === 2) { this.fallback(); return block.replacements![at]!; }
        if (state === 3) { this.fallback(); return NaN; }
        block.flags[at] = 1;
        if (!Number.isFinite(value)) return NaN;
        this.stats.checked++;
        const spacing = block.spacing[ly] ||= 2 * WEB_MERCATOR_EXTENT / span
            / Math.cosh((WEB_MERCATOR_EXTENT - (j + 0.5) * 2 * WEB_MERCATOR_EXTENT / span) / EARTH_RADIUS);
        const threshold = Math.max(this.options.minDeviation, spacing * this.options.maxSlope);
        const interior = lx >= 2 && ly >= 2 && lx < size - 2 && ly < size - 2;
        const heights = block.tile!.heights;
        const a = interior ? heights[at - 2]! : this.raw(z, i - 2, j);
        const b = interior ? heights[at + 2]! : this.raw(z, i + 2, j);
        const c = interior ? heights[at - 2 * size]! : this.raw(z, i, j - 2);
        const d = interior ? heights[at + 2 * size]! : this.raw(z, i, j + 2);
        const potential = isPotentialElevationOutlier(value, a, b, c, d, threshold);
        if (!potential) {
            // Broad corrupt clusters can hide from the small local ring. A sparse tile
            // median identifies candidates cheaply; independent coarse data decides.
            if (block.reference === undefined) {
                const samples: number[] = [];
                for (let y = 0; y < size; y += 8) for (let x = 0; x < size; x += 8) {
                    const height = heights[y * size + x]; if (Number.isFinite(height)) samples.push(height);
                }
                samples.sort((a, b) => a - b); block.reference = samples[Math.floor(samples.length / 2)] ?? value;
            }
            if (Math.abs(value - block.reference) <= 16 * threshold) return value;
        }
        const coarse = this.coarse(z, i + 0.5, j + 0.5, minZoom);
        let replacement = value;
        if (Number.isFinite(coarse) && Math.abs(value - coarse) > 16 * threshold) {
            replacement = replaceElevationDiscontinuity(value, coarse,
                [[-4, 0], [4, 0], [0, -4], [0, 4]].map(([dx, dy]) => this.coarse(z, i + 0.5 + dx, j + 0.5 + dy, minZoom)),
                spacing, this.options);
        }
        if (replacement === value && !potential) return value;
        const neighbor = (dx: number, dy: number) => interior ? heights[at + dy * size + dx]! : this.raw(z, i + dx, j + dy);
        const ring: number[] = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) ring.push(neighbor(dx, dy));
        }
        const assessment = replacement === value ? assessElevationSample(value, ring, spacing, this.options) : undefined;
        if (assessment && !assessment.suspect) return value;
        if (replacement === value) replacement = assessment ? replaceElevationOutlier(value, assessment, coarse) : NaN;
        if (replacement === value) {
            if (!Number.isFinite(coarse)) { this.stats.unresolved++; this.fallback(); }
            return value;
        }
        this.stats.rejected++;
        this.fallback();
        if (Number.isFinite(replacement)) {
            this.stats.corrected++; block.flags[at] = 2;
            if (!block.replacements) { block.replacements = new Float32Array(size * size); this.bytes += block.replacements.byteLength; this.memory?.(this.bytes); }
            block.replacements[at] = replacement;
        } else { this.stats.unresolved++; block.flags[at] = 3; }
        return replacement;
    }
}
