import { describe, expect, it } from 'vitest';
import { assessElevationSample, replaceElevationOutlier, resolveElevationValidation, validateElevationGrid } from '../src/elevation-validation';

const settings = resolveElevationValidation()!;
const ring = (height: (x: number, y: number) => number) => {
    const values: number[] = [];
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.max(Math.abs(x), Math.abs(y)) === 2) values.push(height(x, y));
    return values;
};

describe('region-independent elevation validation', () => {
    for (const base of [-5000, -430, -7, 0, 1500, 5000]) {
        for (const error of [-2000, 2000]) it(`rejects an isolated ${error} m error around ${base} m`, () => {
            const assessment = assessElevationSample(base + error, ring(() => base), 10, settings)!;
            expect(assessment.suspect).toBe(true);
            expect(replaceElevationOutlier(base + error, assessment, base + 1)).toBe(base + 1);
        });
    }
    for (const [name, surface] of [
        ['plain', () => -430], ['slope', (x: number, y: number) => 1500 + x * 200 + y * 300],
        ['cliff', (x: number) => x < 0 ? -600 : 600], ['narrow ridge', (x: number) => x === 0 ? 1200 : 0],
        ['narrow valley', (x: number) => x === 0 ? -600 : 800],
    ] as const) it(`preserves a coherent ${name}`, () => {
        const at = (x: number, y: number) => surface(x, y);
        expect(assessElevationSample(at(0, 0), ring(at), 10, settings)!.suspect).toBe(false);
    });
    it('retains an isolated peak corroborated by coarser data', () => {
        const assessment = assessElevationSample(900, ring(() => 0), 10, settings)!;
        expect(assessment.suspect).toBe(true);
        expect(replaceElevationOutlier(900, assessment, 850)).toBe(900);
        expect(replaceElevationOutlier(900, assessment, 100)).toBe(900); // partial support after coarse averaging
    });
    it('uses physical spacing and local variation instead of a global altitude cutoff', () => {
        expect(assessElevationSample(-400, ring(() => 0), 100, settings)!.suspect).toBe(false);
        expect(assessElevationSample(1000, ring((x, y) => x * 500 + y * 500), 1, settings)!.suspect).toBe(false);
    });
    it('defers uncertain cases and uses local interpolation only with very strong support', () => {
        expect(assessElevationSample(1000, [...new Array(15).fill(0), NaN], 10, settings)).toBeUndefined();
        expect(replaceElevationOutlier(250, assessElevationSample(250, ring(() => 0), 10, settings)!)).toBe(250);
        expect(replaceElevationOutlier(2500, assessElevationSample(2500, ring(() => -430), 10, settings)!)).toBe(-430);
    });
    it('repairs a standalone grid without modifying the original or clamping negatives', () => {
        const grid = new Float32Array(81).fill(-430); grid[40] = -3000;
        const result = validateElevationGrid(grid, 9, 9, 10, settings);
        expect(result.values[40]).toBe(-430);
        expect(grid[40]).toBe(-3000);
        expect(result.stats).toMatchObject({ rejected: 1, corrected: 1, unresolved: 0 });
    });
    it('validates sensitivity and permits exact raw-data behavior', () => {
        expect(resolveElevationValidation(false)).toBeUndefined();
        for (const key of ['minDeviation', 'maxSlope', 'madMultiplier']) for (const value of [0, -1, NaN, Infinity]) {
            expect(() => resolveElevationValidation({ [key]: value })).toThrow(/finite and positive/);
        }
    });
});
