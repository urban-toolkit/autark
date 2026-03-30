/// <reference types="@webgpu/types" />

import { FeatureCollection, LineString, MultiLineString } from 'geojson';
import { buildViewProjection } from './camera';
import { computeOrigin, triangulateBuildings } from './triangulate';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface RenderLayer {
    /** GeoJSON buildings (Polygon / MultiPolygon / LineString footprints). */
    geojson: FeatureCollection;
    /** Flat RGBA color [0-1] used to paint this layer's geometry. */
    color: [number, number, number, number];
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

// ── WGSL shaders (inline) ─────────────────────────────────────────────────────

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

// ── RenderCompute ─────────────────────────────────────────────────────────────

export class RenderCompute {
    private devicePromise: Promise<GPUDevice> | null = null;
    private hasTimestamps = false;

    private async getOrCreateDevice(): Promise<GPUDevice> {
        if (!this.devicePromise) {
            this.devicePromise = (async () => {
                if (!('gpu' in navigator)) throw new Error('WebGPU not supported.');
                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter) throw new Error('Failed to get GPU adapter.');
                this.hasTimestamps = adapter.features.has('timestamp-query');
                return adapter.requestDevice({
                    requiredFeatures: this.hasTimestamps ? ['timestamp-query'] : [],
                    requiredLimits: {
                        maxBufferSize: adapter.limits.maxBufferSize,
                        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                    },
                });
            })();
        }
        return this.devicePromise;
    }

    /**
     * Renders each viewpoint feature into an offscreen tile and counts
     * non-sky (building) pixels.  Returns the viewpoints FeatureCollection
     * with `feature.properties.compute.buildingCoverage` and
     * `feature.properties.compute.skyViewFactor` added to every feature.
     */
    public async renderIntoMetrics(params: RenderComputeParams): Promise<FeatureCollection> {
        const {
            layers,
            viewpoints,
            eyeHeight  = 1.7,
            fov        = 90,
            near       = 1,
            far        = 5000,
            tileSize   = 64,
            clearColor = [0, 0, 0, 1],
        } = params;

        if (layers.length === 0) throw new Error('RenderCompute: at least one layer is required.');
        if (tileSize % 8 !== 0) throw new Error('RenderCompute: tileSize must be a multiple of 8.');

        const N = viewpoints.features.length;
        if (N === 0) return viewpoints;

        const t0 = performance.now();

        // ── 1. Origin + triangulation ─────────────────────────────────────────
        const origin = computeOrigin(layers[0].geojson);

        const meshes = layers.map(l => ({
            mesh:  triangulateBuildings(l.geojson, origin),
            color: l.color,
        }));

        const t1 = performance.now();

        // ── 2. Camera matrices ────────────────────────────────────────────────
        const cameras = buildRoadCameras(viewpoints, origin, eyeHeight, fov, near, far);

        // ── 3. Tiling layout ──────────────────────────────────────────────────
        const gridSize = Math.ceil(Math.sqrt(N));
        const texSize  = gridSize * tileSize;
        if (texSize > 8192) {
            throw new Error(
                `RenderCompute: required texture size ${texSize}px exceeds WebGPU limit (8192). ` +
                `Reduce tileSize or number of viewpoints.`,
            );
        }

        const device    = await this.getOrCreateDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment; // ≥ 256

        const t2 = performance.now();

        // ── 4. GPU resources ──────────────────────────────────────────────────

        // Tiled colour texture (render target + texture binding for compute)
        const tileTexture = device.createTexture({
            size:  [texSize, texSize],
            format: 'rgba8unorm',
            usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        const tileView = tileTexture.createView();

        // Geometry buffers per layer
        const gpuLayers = meshes.map(({ mesh, color }) => {
            const vBuf = device.createBuffer({
                size:  mesh.positions.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(vBuf, 0, mesh.positions as Float32Array<ArrayBuffer>);

            const iBuf = device.createBuffer({
                size:  mesh.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(iBuf, 0, mesh.indices as Uint32Array<ArrayBuffer>);

            const colorBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(colorBuf, 0, new Float32Array(color));

            return { vBuf, iBuf, indexCount: mesh.indices.length, colorBuf };
        });

        // Camera buffer — one padded slot per viewpoint (dynamic-offset uniform)
        const cameraStride = Math.max(64, alignment);
        const cameraRaw    = new ArrayBuffer(N * cameraStride);
        for (let i = 0; i < N; i++) {
            const slot = new Float32Array(cameraRaw, i * cameraStride, 16);
            slot.set(cameras.subarray(i * 16, i * 16 + 16));
        }
        const cameraBuf = device.createBuffer({
            size:  N * cameraStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(cameraBuf, 0, cameraRaw);

        // Results buffer (zero-initialised by WebGPU spec)
        const resultsBuf = device.createBuffer({
            size:  N * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Params uniform for the count shader
        const paramsData = new ArrayBuffer(32);
        const pv = new DataView(paramsData);
        pv.setUint32( 0, gridSize,       true);
        pv.setUint32( 4, tileSize,       true);
        pv.setUint32( 8, N,              true);
        pv.setUint32(12, 0,              true); // pad
        pv.setFloat32(16, clearColor[0], true);
        pv.setFloat32(20, clearColor[1], true);
        pv.setFloat32(24, clearColor[2], true);
        pv.setFloat32(28, clearColor[3], true);
        const paramsBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(paramsBuf, 0, paramsData);

        // ── 5. Pipelines + bind groups ────────────────────────────────────────

        // Render pipeline
        const camBGL = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 } }],
        });
        const colorBGL = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform', minBindingSize: 16 } }],
        });

        const renderPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [camBGL, colorBGL] }),
            vertex: {
                module:     device.createShaderModule({ code: VERT_SHADER }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                }],
            },
            fragment: {
                module:     device.createShaderModule({ code: FRAG_SHADER }),
                entryPoint: 'main',
                targets: [{ format: 'rgba8unorm' }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        const camBG    = device.createBindGroup({
            layout: camBGL,
            entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }],
        });
        const colorBGs = gpuLayers.map(({ colorBuf }) => device.createBindGroup({
            layout: colorBGL,
            entries: [{ binding: 0, resource: { buffer: colorBuf } }],
        }));

        // Count compute pipeline
        const countBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: 'float', viewDimension: '2d' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform', minBindingSize: 32 } },
            ],
        });
        const countPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [countBGL] }),
            compute: { module: device.createShaderModule({ code: COUNT_SHADER }), entryPoint: 'main' },
        });
        const countBG = device.createBindGroup({
            layout: countBGL,
            entries: [
                { binding: 0, resource: tileTexture.createView() },
                { binding: 1, resource: { buffer: resultsBuf } },
                { binding: 2, resource: { buffer: paramsBuf } },
            ],
        });

        // Staging buffer for CPU readback
        const stagingBuf = device.createBuffer({
            size:  N * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        // ── 6. Encode commands ────────────────────────────────────────────────
        const encoder = device.createCommandEncoder();

        // N render passes — one tile per viewpoint
        for (let i = 0; i < N; i++) {
            const col  = i % gridSize;
            const row  = Math.floor(i / gridSize);
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view:       tileView,
                    loadOp:     i === 0 ? 'clear' : 'load',
                    storeOp:    'store',
                    clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
                }],
            });

            pass.setPipeline(renderPipeline);
            pass.setViewport(col * tileSize, row * tileSize, tileSize, tileSize, 0, 1);
            pass.setScissorRect(col * tileSize, row * tileSize, tileSize, tileSize);
            pass.setBindGroup(0, camBG, [i * cameraStride]);

            for (let j = 0; j < gpuLayers.length; j++) {
                const { vBuf, iBuf, indexCount } = gpuLayers[j];
                pass.setBindGroup(1, colorBGs[j]);
                pass.setVertexBuffer(0, vBuf);
                pass.setIndexBuffer(iBuf, 'uint32');
                pass.drawIndexed(indexCount);
            }
            pass.end();
        }

        // Compute pass — pixel counting
        const ts8  = tileSize / 8;
        const cPass = encoder.beginComputePass();
        cPass.setPipeline(countPipeline);
        cPass.setBindGroup(0, countBG);
        cPass.dispatchWorkgroups(ts8, ts8, N);
        cPass.end();

        // Copy results to staging
        encoder.copyBufferToBuffer(resultsBuf, 0, stagingBuf, 0, N * 4);

        const t3 = performance.now();
        device.queue.submit([encoder.finish()]);

        // ── 7. Readback ───────────────────────────────────────────────────────
        await stagingBuf.mapAsync(GPUMapMode.READ);
        const rawResults = new Uint32Array(stagingBuf.getMappedRange().slice(0));
        stagingBuf.unmap();

        const t4 = performance.now();

        console.log(
            `[RenderCompute] N=${N}  tex=${texSize}×${texSize}  tileSize=${tileSize}\n` +
            `  triangulate : ${(t1 - t0).toFixed(1)} ms\n` +
            `  setup (GPU) : ${(t2 - t1).toFixed(1)} ms\n` +
            `  encode      : ${(t3 - t2).toFixed(1)} ms\n` +
            `  GPU+readback: ${(t4 - t3).toFixed(1)} ms\n` +
            `  total       : ${(t4 - t0).toFixed(1)} ms`,
        );

        // ── 8. Cleanup ────────────────────────────────────────────────────────
        tileTexture.destroy();
        cameraBuf.destroy();
        resultsBuf.destroy();
        paramsBuf.destroy();
        stagingBuf.destroy();
        for (const { vBuf, iBuf, colorBuf } of gpuLayers) {
            vBuf.destroy(); iBuf.destroy(); colorBuf.destroy();
        }

        // ── 9. Enrich viewpoints GeoJSON ──────────────────────────────────────
        const totalPixels = tileSize * tileSize;
        const features    = viewpoints.features.map((feature, i) => ({
            ...feature,
            properties: {
                ...feature.properties,
                compute: {
                    ...(feature.properties?.compute ?? {}),
                    buildingCoverage: rawResults[i] / totalPixels,
                    skyViewFactor:    1 - rawResults[i] / totalPixels,
                },
            },
        }));

        return { ...viewpoints, features } as FeatureCollection;
    }
}

// ── Camera helpers ────────────────────────────────────────────────────────────

function buildRoadCameras(
    viewpoints: FeatureCollection,
    origin:     [number, number],
    eyeHeight:  number,
    fovDeg:     number,
    near:       number,
    far:        number,
): Float32Array {
    const N       = viewpoints.features.length;
    const cameras = new Float32Array(N * 16);

    for (let i = 0; i < N; i++) {
        const feature = viewpoints.features[i];
        const geom    = feature.geometry;

        let p0: number[], p1: number[];

        if (geom.type === 'LineString') {
            const coords = (geom as LineString).coordinates;
            p0 = coords[0];
            p1 = coords.length > 1 ? coords[1] : [coords[0][0] + 1, coords[0][1]];
        } else if (geom.type === 'MultiLineString') {
            const coords = (geom as MultiLineString).coordinates[0];
            p0 = coords[0];
            p1 = coords.length > 1 ? coords[1] : [coords[0][0] + 1, coords[0][1]];
        } else {
            // Point or unknown — look north
            const c = (geom as any).coordinates as number[];
            p0 = [c[0], c[1]];
            p1 = [c[0], c[1] + 1];
        }

        const mx = (p0[0] + p1[0]) * 0.5 - origin[0];
        const my = (p0[1] + p1[1]) * 0.5 - origin[1];

        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const dlen = Math.sqrt(dx * dx + dy * dy);
        const ndx  = dlen > 0 ? dx / dlen : 1;
        const ndy  = dlen > 0 ? dy / dlen : 0;

        const mat = buildViewProjection({
            eye:    [mx, my, eyeHeight],
            lookAt: [mx + ndx, my + ndy, eyeHeight],
            up:     [0, 0, 1],
            fovDeg,
            aspect: 1.0,
            near,
            far,
        });

        cameras.set(mat, i * 16);
    }

    return cameras;
}
