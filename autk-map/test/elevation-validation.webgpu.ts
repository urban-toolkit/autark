import { heightAt } from '../src/height-source';
import { elevationRegions, regionHeightSource } from './elevation-fixtures';
import { runTerrainProbes } from './terrain-shader.webgpu';

/** Checks the real shoreline defect through the production terrain vertex and normal functions. */
export async function runWebGpuCases() {
    const region = elevationRegions.find(site => site.name === 'rio-coast')!;
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const results: number[] = [];
    for (const validate of [false, true]) {
        const source = regionHeightSource(region, validate);
        const cell = source.levels[0]!.cellSizeX;
        const probe = { origin: [-8 * cell, -8 * cell] as [number, number], size: 16 * cell,
            local: [0.5, 0.5] as [number, number], seams: [0, 0, 0, 0] as [number, number, number, number] };
        const gpu = await runTerrainProbes(source, [probe]);
        assert(Math.abs(gpu[3]! - heightAt(source, 0, 0)) < 0.1, 'Rendered terrain vertex differs from the shared CPU height');
        assert(gpu.every(Number.isFinite), 'Height correction produced non-finite geometry or normals');
        results.push(gpu[3]!);
    }
    assert(results[0]! < -100 && Math.abs(results[1]!) < 20, `Real coastal pit remains in rendered geometry: ${results}`);
    return { status: 'passed', checks: ['real coastal source defect reproduced in production vertex shader', 'general validation removes the pit before mesh construction', 'finite normals and matching shared CPU/GPU elevations'] };
}
