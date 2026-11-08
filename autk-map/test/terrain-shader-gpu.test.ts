// Runs the real terrain shader code (height lookup, seam morph, normals) on a GPU and compares it with
// the CPU twins. Optional: it needs the `webgpu` npm package (Dawn, the engine under Chrome, with the
// Tint compiler) and a GPU adapter, neither of which is a project dependency. When either is missing
// the tests skip. To run them locally: `npm install --no-save webgpu`, then `npx vitest run test/terrain-shader-gpu.test.ts`.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { heightAt, packHeightUniform } from '../src/height-source';
import type { HeightLevel, HeightSource } from '../src/height-source';
import terrainVertex from '../src/shaders/terrain.vert.wgsl';

const require = createRequire(import.meta.url);

interface DawnModule { create: (flags: string[]) => GPU; globals: object }

/** The `webgpu` package, or `null` when it is not installed. */
function loadDawn(): DawnModule | null {
  try {
    return require('webgpu') as DawnModule;
  } catch {
    return null;
  }
}

const CELLS = 16;
const SIZE = 64;
const field = (x: number, y: number): number => 300 * Math.sin(x / 90) + 200 * Math.cos(y / 70) + 40 * Math.sin((x + y) / 17);

function buildSource(): HeightSource {
  const levels: HeightLevel[] = [];
  for (let k = 0; k < 3; k++) {
    const cell = 4 * 2 ** k;
    const originX = -(SIZE / 2) * cell;
    const originY = originX;
    const data = new Float32Array(SIZE * SIZE);
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) data[j * SIZE + i] = field(originX + i * cell, originY + j * cell);
    levels.push({ originX, originY, cellSizeX: cell, cellSizeY: cell, width: SIZE, height: SIZE, data });
  }
  return { levels, bounds: [-1e4, -1e4, 1e4, 1e4], minHeight: -600, maxHeight: 600, version: 1, levelVersions: [1, 1, 1] };
}

function cpuNormal(source: HeightSource, x: number, y: number, sampleDistance: number): [number, number, number] {
  const d = Math.max(sampleDistance, 1);
  const hL = heightAt(source, x - d, y);
  const hR = heightAt(source, x + d, y);
  const hD = heightAt(source, x, y - d);
  const hU = heightAt(source, x, y + d);
  const n = [hL - hR, hD - hU, 2 * d];
  const len = Math.hypot(...n);
  return [n[0]! / len, n[1]! / len, n[2]! / len];
}

interface Probe { origin: [number, number]; size: number; local: [number, number]; seams: [number, number, number, number] }

/** Runs the probes on a GPU, or returns `null` when there is no `webgpu` package or no adapter. */
async function runProbes(source: HeightSource, probes: Probe[]): Promise<Float32Array | null> {
  const dawn = loadDawn();
  if (!dawn) return null;
  Object.assign(globalThis, dawn.globals);
  const adapter = await dawn.create([]).requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  device.pushErrorScope('validation');

  const code = `${terrainVertex}
struct Probe { origin: vec2<f32>, size: f32, pad: f32, local: vec2<f32>, pad2: vec2<f32>, seams: vec4<f32> };
@group(1) @binding(0) var<storage, read> probes: array<Probe>;
@group(1) @binding(1) var<storage, read_write> results: array<vec4<f32>>;
@compute @workgroup_size(1)
fn probeMain(@builtin(global_invocation_id) id: vec3<u32>) {
  let p = probes[id.x];
  let v = patchVertex(p.origin, p.size, p.local, p.seams);
  results[id.x] = vec4<f32>(v.normal, v.height);
}`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m: { type: string }) => m.type === 'error');
  if (errors.length) throw new Error(errors.map((m: { message: string }) => m.message).join('\n'));

  const camera = new Float32Array(48);
  camera[27] = CELLS;
  const cameraBuffer = device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(cameraBuffer, 0, camera);
  const heightBuffer = device.createBuffer({ size: 272, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(heightBuffer, 0, packHeightUniform(source));
  const texture = device.createTexture({ size: [SIZE, SIZE, 3], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  source.levels.forEach((level, layer) => {
    device.queue.writeTexture({ texture, origin: [0, 0, layer] }, level.data, { bytesPerRow: SIZE * 4 }, [SIZE, SIZE, 1]);
  });

  const probeData = new Float32Array(probes.length * 12);
  probes.forEach((p, i) => probeData.set([p.origin[0], p.origin[1], p.size, 0, p.local[0], p.local[1], 0, 0, ...p.seams], i * 12));
  const probeBuffer = device.createBuffer({ size: probeData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(probeBuffer, 0, probeData);
  const resultSize = probes.length * 16;
  const resultBuffer = device.createBuffer({ size: resultSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: resultSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  const layout0 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const layout1 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout0, layout1] }),
    compute: { module, entryPoint: 'probeMain' },
  });
  const group0 = device.createBindGroup({
    layout: layout0,
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: texture.createView({ dimension: '2d-array' }) },
      { binding: 4, resource: { buffer: heightBuffer } },
    ],
  });
  const group1 = device.createBindGroup({
    layout: layout1,
    entries: [
      { binding: 0, resource: { buffer: probeBuffer } },
      { binding: 1, resource: { buffer: resultBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group0);
  pass.setBindGroup(1, group1);
  pass.dispatchWorkgroups(probes.length);
  pass.end();
  encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, resultSize);
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  const error = await device.popErrorScope();
  if (error) throw new Error(error.message);
  return out;
}

describe('terrain shader on a GPU', () => {
  const source = buildSource();

  it('matches the CPU height and normal away from seams', async (ctx) => {
    const probes: Probe[] = [];
    for (let i = 0; i < 40; i++) {
      const size = 64;
      probes.push({ origin: [-40 + i * 3, -30 + i * 2], size, local: [(i % 7) / 7, (i % 5) / 5], seams: [0, 0, 0, 0] });
    }
    const out = await runProbes(source, probes);
    if (!out) return ctx.skip();
    probes.forEach((p, i) => {
      const x = p.origin[0] + p.local[0] * p.size;
      const y = p.origin[1] + p.local[1] * p.size;
      expect(out[i * 4 + 3]).toBeCloseTo(heightAt(source, x, y), 2);
      const n = cpuNormal(source, x, y, p.size / CELLS);
      for (let c = 0; c < 3; c++) expect(out[i * 4 + c]).toBeCloseTo(n[c]!, 3);
    });
  });

  it('matches the CPU morph for a seam vertex and interpolates the neighbour normals', async (ctx) => {
    const probes: Probe[] = [];
    const cases: Array<{ levels: number; j: number }> = [];
    for (const levels of [1, 2, 3, 6]) for (let j = 0; j <= CELLS; j++) cases.push({ levels, j });
    // Fine block at (0, 0), size 64: its maximum-X edge borders a coarser neighbour.
    for (const c of cases) probes.push({ origin: [0, 0], size: 64, local: [1, c.j / CELLS], seams: [0, c.levels, 0, 0] });
    const out = await runProbes(source, probes);
    if (!out) return ctx.skip();
    cases.forEach((c, i) => {
      const own = 64 / CELLS;
      const spacing = own * 2 ** c.levels;
      const y = (c.j / CELLS) * 64;
      const lower = Math.floor(y / spacing) * spacing;
      const w = (y - lower) / spacing;
      const h = (1 - w) * heightAt(source, 64, lower) + w * heightAt(source, 64, lower + spacing);
      expect(out[i * 4 + 3]).toBeCloseTo(h, 2);
      const a = cpuNormal(source, 64, lower, spacing);
      const b = cpuNormal(source, 64, lower + spacing, spacing);
      const n = [(1 - w) * a[0] + w * b[0], (1 - w) * a[1] + w * b[1], (1 - w) * a[2] + w * b[2]];
      const len = Math.hypot(...n);
      for (let k = 0; k < 3; k++) expect(out[i * 4 + k]).toBeCloseTo(n[k]! / len, 3);
    });
  });

  it('draws the same edge from both sides: heights and normals meet', async (ctx) => {
    // Coarse block over x in [64, 192], spacing 16 (size 256, 16 cells): its minimum-X edge touches the fine block's maximum-X edge at x = 64? Use aligned blocks.
    const coarseSize = 256; // spacing 16, aligned to 256
    const probes: Probe[] = [];
    for (let j = 0; j <= CELLS; j++) probes.push({ origin: [64, 0], size: coarseSize, local: [0, j / CELLS], seams: [0, 0, 0, 0] });
    for (let j = 0; j <= CELLS; j++) probes.push({ origin: [0, 0], size: 64, local: [1, j / CELLS], seams: [0, 2, 0, 0] });
    const out = await runProbes(source, probes);
    if (!out) return ctx.skip();
    const coarse = (j: number) => [...out.slice(j * 4, j * 4 + 4)];
    for (let j = 0; j <= CELLS; j++) {
      const f = [...out.slice((CELLS + 1 + j) * 4, (CELLS + 1 + j) * 4 + 4)];
      // Fine vertex j is at y = 4j; coarse vertices are at y = 16m. Interpolate the coarse edge.
      const y = 4 * j;
      const m = Math.floor(y / 16);
      const w = (y - 16 * m) / 16;
      const a = coarse(m);
      const b = coarse(Math.min(m + 1, CELLS));
      const h = (1 - w) * a[3]! + w * b[3]!;
      expect(f[3]).toBeCloseTo(h, 2);
      const n = [0, 1, 2].map((k) => (1 - w) * a[k]! + w * b[k]!);
      const len = Math.hypot(...n);
      for (let k = 0; k < 3; k++) expect(f[k]).toBeCloseTo(n[k]! / len, 3);
    }
  });
});
