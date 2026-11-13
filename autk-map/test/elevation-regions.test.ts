import { expect, it } from 'vitest';
import { resolveElevationValidation } from '@urban-toolkit/autk-core';
import { DemSampler } from '../src/dem-sample';
import { heightAt } from '../src/height-source';
import { elevationRegions, regionLookup, regionHeightSource } from './elevation-fixtures';

for (const region of elevationRegions) it(`validates real ${region.name} elevations without region-specific rules`, () => {
    const n = 2 ** 14 * 256;
    const i = Math.round((region.longitude + 180) / 360 * n - 0.5);
    const j = Math.round((1 - Math.asinh(Math.tan(region.latitude * Math.PI / 180)) / Math.PI) / 2 * n - 0.5);
    const lookup = regionLookup(region);
    const raw = new DemSampler(lookup, 256).sample(14, i + 0.5, j + 0.5, 13);
    const sampler = new DemSampler(lookup, 256, resolveElevationValidation());
    const clean = sampler.sample(14, i + 0.5, j + 0.5, 13);
    if (region.expected === 'repair') {
        expect(raw).toBeLessThan(-2000);
        expect(Math.abs(clean)).toBeLessThan(20);
        expect(sampler.validationStats!.corrected).toBeGreaterThan(0);
        expect(heightAt(regionHeightSource(region, false), 0, 0)).toBeLessThan(-100);
        expect(Math.abs(heightAt(regionHeightSource(region, true), 0, 0))).toBeLessThan(20);
    } else {
        expect(clean).toBe(raw);
        expect(sampler.validationStats!.rejected).toBe(0);
        if (['netherlands', 'dead-sea', 'ocean'].includes(region.name)) expect(clean).toBeLessThan(0);
    }
});
