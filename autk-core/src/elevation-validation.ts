/** Region-independent, conservative validation of isolated raster elevation errors. */
export interface ElevationValidationOptions {
    /** Smallest suspicious vertical departure, in meters. Default: 100. */
    minDeviation?: number;
    /** Allowed vertical departure per meter of sample spacing. Default: 8. */
    maxSlope?: number;
    /** Multiplier for the neighborhood's scaled median absolute deviation. Default: 8. */
    madMultiplier?: number;
}

export interface ElevationValidationStats {
    checked: number;
    rejected: number;
    corrected: number;
    unresolved: number;
}

export type ResolvedElevationValidation = Readonly<Required<ElevationValidationOptions>>;

/** Resolves sensitivity once; false preserves the input elevations exactly. */
export function resolveElevationValidation(options: false | ElevationValidationOptions = {}): ResolvedElevationValidation | undefined {
    if (options === false) return undefined;
    if (!options || typeof options !== 'object') throw new Error('Terrain validation must be false or an options object.');
    const resolved = { minDeviation: options.minDeviation ?? 100, maxSlope: options.maxSlope ?? 8, madMultiplier: options.madMultiplier ?? 8 };
    for (const [key, value] of Object.entries(resolved)) {
        if (!Number.isFinite(value) || value <= 0) throw new Error(`Terrain validation ${key} must be finite and positive.`);
    }
    return Object.freeze(resolved);
}

export interface ElevationAssessment {
    suspect: boolean;
    reference: number;
    tolerance: number;
    support: number;
}

/** Cheap spatial triage; numerical neighborhood rules are shared by both terrain adapters. */
export function isPotentialElevationOutlier(value: number, a: number, b: number, c: number, d: number, tolerance: number): boolean {
    return Number(value - a > tolerance) + Number(value - b > tolerance) + Number(value - c > tolerance) + Number(value - d > tolerance) >= 2
        || Number(a - value > tolerance) + Number(b - value > tolerance) + Number(c - value > tolerance) + Number(d - value > tolerance) >= 2;
}

/**
 * Assesses a sample against the 16 positions on a radius-two square ring,
 * ordered by row then column. Opposite supported positions preserve coherent
 * cliffs, ridges, and valleys. Missing neighbors defer the decision.
 */
export function assessElevationSample(value: number, ring: readonly number[], spacing: number, options: ResolvedElevationValidation): ElevationAssessment | undefined {
    if (!Number.isFinite(value) || !Number.isFinite(spacing) || spacing <= 0 || ring.length !== 16 || !ring.every(Number.isFinite)) return undefined;
    const sorted = [...ring].sort((a, b) => a - b);
    const reference = (sorted[7]! + sorted[8]!) / 2;
    const deviations = ring.map(height => Math.abs(height - reference)).sort((a, b) => a - b);
    const mad = (deviations[7]! + deviations[8]!) / 2;
    const tolerance = Math.max(options.minDeviation, spacing * options.maxSlope, 1.4826 * mad * options.madMultiplier);
    const support = ring.filter(height => Math.abs(height - reference) <= tolerance).length;
    let coherent = false;
    for (let i = 0; i < 8; i++) {
        if (Math.abs(ring[i]! - value) <= tolerance && Math.abs(ring[15 - i]! - value) <= tolerance) coherent = true;
    }
    return { suspect: !coherent && Math.abs(value - reference) > tolerance, reference, tolerance, support };
}

/** Uses corroborating coarse data or exceptionally strong local support; uncertain features remain unchanged. */
export function replaceElevationOutlier(value: number, assessment: ElevationAssessment, coarse = NaN): number {
    if (!assessment.suspect) return value;
    if (Number.isFinite(coarse)) {
        // Even partial same-sided support can corroborate a sharp feature lost by
        // coarse averaging. Disagreement in magnitude alone must not flatten it.
        const departure = value - assessment.reference;
        const coarseDeparture = coarse - assessment.reference;
        if (departure * coarseDeparture > 0 && Math.abs(coarseDeparture) > Math.max(assessment.tolerance / 4, Math.abs(departure) / 10)) return value;
        return Math.abs(coarse - assessment.reference) <= assessment.tolerance * 2
            && Math.abs(value - coarse) > assessment.tolerance ? coarse : value;
    }
    return assessment.support >= 14 && Math.abs(value - assessment.reference) > 4 * assessment.tolerance
        ? assessment.reference : value;
}

/** Rejects extreme fine/coarse contradictions only when the coarse neighborhood
 * independently supports a smooth surface. No absolute altitude cutoff is used.
 */
export function replaceElevationDiscontinuity(value: number, coarse: number, neighbors: readonly number[], spacing: number,
    options: ResolvedElevationValidation): number {
    const tolerance = Math.max(options.minDeviation, spacing * options.maxSlope);
    return Number.isFinite(value) && Number.isFinite(coarse) && neighbors.length === 4
        && Math.abs(value - coarse) > 16 * tolerance
        && neighbors.every(height => Number.isFinite(height) && Math.abs(height - coarse) <= 2 * tolerance)
        ? coarse : value;
}

/** Validates a standalone normalized grid without modifying the caller's data. */
export function validateElevationGrid(data: Float32Array, width: number, height: number, spacing: number, options: ResolvedElevationValidation) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height !== data.length || !Number.isFinite(spacing) || spacing <= 0) {
        throw new Error('Elevation grid dimensions and positive sample spacing must match its data.');
    }
    const values = data.slice();
    const stats: ElevationValidationStats = { checked: 0, rejected: 0, corrected: 0, unresolved: 0 };
    // Fill missing samples from nearby supported terrain instead of introducing sea-level pits.
    let missing = 0;
    for (const value of values) if (!Number.isFinite(value)) missing++;
    if (missing) {
        const queue = new Int32Array(values.length);
        let head = 0, tail = 0;
        for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) queue[tail++] = i;
        stats.rejected += missing;
        while (head < tail) {
            const at = queue[head++], x = at % width, y = Math.floor(at / width);
            for (const next of [x > 0 ? at - 1 : -1, x + 1 < width ? at + 1 : -1, y > 0 ? at - width : -1, y + 1 < height ? at + width : -1]) {
                if (next < 0 || Number.isFinite(values[next])) continue;
                values[next] = values[at]; queue[tail++] = next; stats.corrected++;
            }
        }
        stats.unresolved += missing - stats.corrected;
    }
    const input = missing ? values.slice() : data;
    // Mirror the neighborhood at raster edges so edge/corner errors are validated too.
    const mirror = (n: number, size: number): number => {
        if (size === 1) return 0;
        const period = 2 * (size - 1), v = ((n % period) + period) % period;
        return v < size ? v : period - v;
    };
    const atSample = (x: number, y: number) => input[mirror(y, height) * width + mirror(x, width)];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = y * width + x, value = input[at]!;
        stats.checked++;
        const threshold = Math.max(options.minDeviation, spacing * options.maxSlope);
        const interior = x >= 2 && y >= 2 && x < width - 2 && y < height - 2;
        const a = interior ? input[at - 2] : atSample(x - 2, y);
        const b = interior ? input[at + 2] : atSample(x + 2, y);
        const c = interior ? input[at - 2 * width] : atSample(x, y - 2);
        const d = interior ? input[at + 2 * width] : atSample(x, y + 2);
        if (!isPotentialElevationOutlier(value, a, b, c, d, threshold)) continue;
        const ring: number[] = [];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) ring.push(interior ? input[at + dy * width + dx] : atSample(x + dx, y + dy));
        }
        const assessment = assessElevationSample(value, ring, spacing, options);
        if (!assessment?.suspect) continue;
        const replacement = replaceElevationOutlier(value, assessment);
        if (replacement === value) { stats.unresolved++; continue; }
        stats.rejected++;
        if (Number.isFinite(replacement)) stats.corrected++; else stats.unresolved++;
        values[at] = replacement;
    }
    return { values, stats };
}
