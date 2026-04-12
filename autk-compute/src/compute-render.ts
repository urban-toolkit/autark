/// <reference types="@webgpu/types" />

import { FeatureCollection } from 'geojson';
import { ColorRGB, Camera, TriangulatorBuildings } from 'autk-core';
import { GpuPipeline } from './compute-pipeline';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface RenderLayer {
    /** GeoJSON buildings (Polygon / MultiPolygon / LineString footprints). */
    geojson: FeatureCollection;
    /** RGBA color used to paint this layer's geometry. r/g/b in [0-1], alpha in [0-1]. */
    color: ColorRGB;
}

export interface RenderComputeParams {
    /** Geometry layers to render (e.g. buildings). */
    layers: RenderLayer[];
    /**
     * Viewpoint features (LineString or Point).
     * One tile is rendered per feature.
     */
    viewpoints: FeatureCollection;
    /** Camera eye height above ground in scene units (default 1.7). */
    eyeHeight?: number;
    /** Horizontal field of view in degrees (default 90). */
    fov?: number;
    /** Near clipping plane (default 1). */
    near?: number;
    /** Far clipping plane (default 5000). */
    far?: number;
    /** Tile resolution in pixels — must be a multiple of 8 (default 64). */
    tileSize?: number;
    /** Background "sky" colour [0-1] RGBA (default opaque black [0,0,0,1]). */
    clearColor?: [number, number, number, number];
}

// ── WGSL shaders ─────────────────────────────────────────────────────────────

const VERT_SHADER = /* wgsl */`
@group(0) @binding(0) var<uniform> viewProj: mat4x4f;
@vertex
fn main(@location(0) pos: vec3f) -> @builtin(position) vec4f {
    return viewProj * vec4f(pos, 1.0);
}
`;

const FRAG_SHADER = /* wgsl */`
@group(1) @binding(0) var<uniform> flatColor: vec4f;
@fragment
fn main() -> @location(0) vec4f {
    return flatColor;
}
`;

const COUNT_SHADER = /* wgsl */`
struct Params {
    gridSize  : u32,
    tileSize  : u32,
    totalTiles: u32,
    _pad      : u32,
    clearR    : f32,
    clearG    : f32,
    clearB    : f32,
    clearA    : f32,
}
@group(0) @binding(0) var tiledTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> results: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let ti = gid.z;
    if ti >= params.totalTiles { return; }
    if gid.x >= params.tileSize || gid.y >= params.tileSize { return; }

    let col = ti % params.gridSize;
    let row = ti / params.gridSize;
    let px  = col * params.tileSize + gid.x;
    let py  = row * params.tileSize + gid.y;

    let pixel = textureLoad(tiledTex, vec2u(px, py), 0);
    let isSky =
        abs(pixel.r - params.clearR) < 0.01 &&
        abs(pixel.g - params.clearG) < 0.01 &&
        abs(pixel.b - params.clearB) < 0.01 &&
        abs(pixel.a - params.clearA) < 0.01;

    if !isSky {
        atomicAdd(&results[ti], 1u);
    }
}
`;

export class ComputeRender extends GpuPipeline {
    /**
     * Renders each viewpoint feature into an offscreen tile and counts
     * non-sky (building) pixels.
     */
    public async renderIntoMetrics(params: RenderComputeParams): Promise<FeatureCollection> {
        const { layers, viewpoints, eyeHeight = 1.7, fov = 90, near = 1, far = 5000, tileSize = 64, clearColor = [0, 0, 0, 1] } = params;

        if (layers.length === 0) throw new Error('RenderCompute: at least one layer is required.');
        if (tileSize % 8 !== 0) throw new Error('RenderCompute: tileSize must be a multiple of 8.');

        const N = viewpoints.features.length;
        if (N === 0) return viewpoints;

        // Use autk-core triangulation
        const origin = TriangulatorBuildings.computeOrigin(layers[0].geojson);
        const meshes = layers.map(l => ({
            mesh:  TriangulatorBuildings.triangulate(l.geojson, { origin }),
            color: l.color,
        }));

        const cameras = buildRoadCameras(viewpoints, origin, eyeHeight, fov, near, far);
        const gridSize = Math.ceil(Math.sqrt(N));
        const texSize  = gridSize * tileSize;

        const device = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;

        const tileTexture = device.createTexture({
            size:  [texSize, texSize],
            format: 'rgba8unorm',
            usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        const tileView = tileTexture.createView();

        const gpuLayers = meshes.map(({ mesh, color }) => {
            const vBuf = device.createBuffer({ size: mesh.positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(vBuf, 0, mesh.positions);
            const iBuf = device.createBuffer({ size: mesh.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(iBuf, 0, mesh.indices);
            const colorBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(colorBuf, 0, new Float32Array([color.r, color.g, color.b, color.alpha]));
            return { vBuf, iBuf, indexCount: mesh.indices.length, colorBuf };
        });

        const cameraStride = Math.max(64, alignment);
        const cameraRaw    = new ArrayBuffer(N * cameraStride);
        for (let i = 0; i < N; i++) {
            new Float32Array(cameraRaw, i * cameraStride, 16).set(cameras.subarray(i * 16, i * 16 + 16));
        }
        const cameraBuf = device.createBuffer({ size: N * cameraStride, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(cameraBuf, 0, cameraRaw);

        const resultsBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const paramsData = new ArrayBuffer(32);
        const pv = new DataView(paramsData);
        pv.setUint32(0, gridSize, true); pv.setUint32(4, tileSize, true); pv.setUint32(8, N, true);
        pv.setFloat32(16, clearColor[0], true); pv.setFloat32(20, clearColor[1], true); pv.setFloat32(24, clearColor[2], true); pv.setFloat32(28, clearColor[3], true);
        const paramsBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(paramsBuf, 0, paramsData);

        const camBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 } }] });
        const colorBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: 16 } }] });
        const renderPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [camBGL, colorBGL] }),
            vertex: { module: device.createShaderModule({ code: VERT_SHADER }), entryPoint: 'main', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
            fragment: { module: device.createShaderModule({ code: FRAG_SHADER }), entryPoint: 'main', targets: [{ format: 'rgba8unorm' }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        const camBG = device.createBindGroup({ layout: camBGL, entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }] });
        const colorBGs = gpuLayers.map(({ colorBuf }) => device.createBindGroup({ layout: colorBGL, entries: [{ binding: 0, resource: { buffer: colorBuf } }] }));

        const countBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float', viewDimension: '2d' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 32 } }] });
        const countPipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [countBGL] }), compute: { module: device.createShaderModule({ code: COUNT_SHADER }), entryPoint: 'main' } });
        const countBG = device.createBindGroup({ layout: countBGL, entries: [{ binding: 0, resource: tileTexture.createView() }, { binding: 1, resource: { buffer: resultsBuf } }, { binding: 2, resource: { buffer: paramsBuf } }] });

        const stagingBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

        const encoder = device.createCommandEncoder();
        for (let i = 0; i < N; i++) {
            const col = i % gridSize, row = Math.floor(i / gridSize);
            const pass = encoder.beginRenderPass({ colorAttachments: [{ view: tileView, loadOp: i === 0 ? 'clear' : 'load', storeOp: 'store', clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] } }] });
            pass.setPipeline(renderPipeline);
            pass.setViewport(col * tileSize, row * tileSize, tileSize, tileSize, 0, 1);
            pass.setScissorRect(col * tileSize, row * tileSize, tileSize, tileSize);
            pass.setBindGroup(0, camBG, [i * cameraStride]);
            for (let j = 0; j < gpuLayers.length; j++) {
                const { vBuf, iBuf, indexCount } = gpuLayers[j];
                pass.setBindGroup(1, colorBGs[j]); pass.setVertexBuffer(0, vBuf); pass.setIndexBuffer(iBuf, 'uint32'); pass.drawIndexed(indexCount);
            }
            pass.end();
        }

        const ts8 = tileSize / 8;
        const cPass = encoder.beginComputePass();
        cPass.setPipeline(countPipeline); cPass.setBindGroup(0, countBG); cPass.dispatchWorkgroups(ts8, ts8, N);
        cPass.end();

        encoder.copyBufferToBuffer(resultsBuf, 0, stagingBuf, 0, N * 4);
        device.queue.submit([encoder.finish()]);

        await stagingBuf.mapAsync(GPUMapMode.READ);
        const rawResults = new Uint32Array(stagingBuf.getMappedRange().slice(0));
        stagingBuf.unmap();

        tileTexture.destroy(); cameraBuf.destroy(); resultsBuf.destroy(); paramsBuf.destroy(); stagingBuf.destroy();
        for (const { vBuf, iBuf, colorBuf } of gpuLayers) { vBuf.destroy(); iBuf.destroy(); colorBuf.destroy(); }

        const totalPixels = tileSize * tileSize;
        return {
            ...viewpoints,
            features: viewpoints.features.map((feature, i) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    compute: { ...(feature.properties?.compute ?? {}), buildingCoverage: rawResults[i] / totalPixels, skyViewFactor: 1 - rawResults[i] / totalPixels }
                }
            }))
        } as FeatureCollection;
    }
}

function buildRoadCameras(viewpoints: FeatureCollection, origin: [number, number], eyeHeight: number, fovDeg: number, near: number, far: number): Float32Array {
    const N = viewpoints.features.length;
    const cameras = new Float32Array(N * 16);
    for (let i = 0; i < N; i++) {
        const geom = viewpoints.features[i].geometry as any;
        let p0: number[], p1: number[];
        if (geom.type === 'LineString') {
            p0 = geom.coordinates[0]; p1 = geom.coordinates.length > 1 ? geom.coordinates[1] : [geom.coordinates[0][0] + 1, geom.coordinates[0][1]];
        } else if (geom.type === 'MultiLineString') {
            p0 = geom.coordinates[0][0]; p1 = geom.coordinates[0].length > 1 ? geom.coordinates[0][1] : [geom.coordinates[0][0][0] + 1, geom.coordinates[0][0][1]];
        } else {
            p0 = [geom.coordinates[0], geom.coordinates[1]]; p1 = [geom.coordinates[0], geom.coordinates[1] + 1];
        }
        const mx = (p0[0] + p1[0]) * 0.5 - origin[0], my = (p0[1] + p1[1]) * 0.5 - origin[1];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dlen = Math.sqrt(dx * dx + dy * dy);
        const ndx = dlen > 0 ? dx / dlen : 1, ndy = dlen > 0 ? dy / dlen : 0;
        cameras.set(Camera.buildViewProjection({ eye: [mx, my, eyeHeight], lookAt: [mx + ndx, my + ndy, eyeHeight], up: [0, 0, 1], fovDeg, aspect: 1.0, near, far }), i * 16);
    }
    return cameras;
}
