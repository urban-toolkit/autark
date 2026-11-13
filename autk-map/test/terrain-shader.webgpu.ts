import { heightAt, packHeightUniform } from '../src/height-source';
import type { HeightLevel, HeightSource } from '../src/height-source';
import terrainVertex from '../src/shaders/terrain.vert.wgsl';


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

/** Runs the production shader probes on a required browser GPU adapter. */
export async function runTerrainProbes(source: HeightSource, probes: Probe[]): Promise<Float32Array> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('A WebGPU adapter is required for the browser regression.');
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
  const texture = device.createTexture({ size: [source.levels[0]!.width, source.levels[0]!.height, source.levels.length], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  source.levels.forEach((level, layer) => {
    device.queue.writeTexture({ texture, origin: [0, 0, layer] }, level.data, { bytesPerRow: level.width * 4 }, [level.width, level.height, 1]);
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
  for (const resource of [cameraBuffer, heightBuffer, texture, probeBuffer, resultBuffer, readBuffer]) resource.destroy();
  device.destroy();
  return out;
}


/** Real browser shader parity: height blending, normals, and seam interpolation. */
export async function runWebGpuCases() {
    const source = buildSource();
    const near = (actual: number, expected: number, tolerance: number, label: string) => {
        if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: ${actual} != ${expected}`);
    };
    const probes: Probe[] = [];
    for (let i = 0; i < 40; i++) probes.push({ origin: [-40 + i * 3, -30 + i * 2], size: 64,
        local: [(i % 7) / 7, (i % 5) / 5], seams: [0, 0, 0, 0] });
    const output = await runTerrainProbes(source, probes);
    probes.forEach((probe, i) => {
        const x = probe.origin[0] + probe.local[0] * probe.size;
        const y = probe.origin[1] + probe.local[1] * probe.size;
        near(output[i * 4 + 3]!, heightAt(source, x, y), 0.01, 'Blended height');
        const normal = cpuNormal(source, x, y, probe.size / CELLS);
        normal.forEach((value, channel) => near(output[i * 4 + channel]!, value, 0.001, 'Normal'));
    });
    const seams: Probe[] = [];
    for (const gap of [1, 2, 3, 6]) for (let j = 0; j <= CELLS; j++) {
        seams.push({ origin: [0, 0], size: 64, local: [1, j / CELLS], seams: [0, gap, 0, 0] });
    }
    const stitched = await runTerrainProbes(source, seams);
    seams.forEach((probe, i) => {
        const spacing = 64 / CELLS * 2 ** probe.seams[1];
        const y = probe.local[1] * 64;
        const lower = Math.floor(y / spacing) * spacing;
        const weight = (y - lower) / spacing;
        near(stitched[i * 4 + 3]!, (1 - weight) * heightAt(source, 64, lower) + weight * heightAt(source, 64, lower + spacing), 0.01, 'Seam height');
        const a = cpuNormal(source, 64, lower, spacing), b = cpuNormal(source, 64, lower + spacing, spacing);
        const normal = a.map((value, channel) => value * (1 - weight) + b[channel]! * weight);
        const length = Math.hypot(...normal);
        normal.forEach((value, channel) => near(stitched[i * 4 + channel]!, value / length, 0.001, 'Seam normal'));
    });
    return { status: 'passed', checks: ['40 GPU height-blending and normal probes', '68 GPU seam-height and normal probes across 1/2/3/6-level gaps'] };
}
