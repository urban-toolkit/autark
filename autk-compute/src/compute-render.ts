/// <reference types="@webgpu/types" />

import {
    ColorRGB,
    LayerGeometry,
    TriangulatorBuildings,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorPoints,
    computeOrigin,
} from 'autk-core';

import { GpuPipeline } from './compute-pipeline';
import { generateViewpoints, buildCameraMatrices } from './viewpoint';
import type { RenderLayer, RenderPipelineParams } from './api';
import type { GpuLayerData } from './types-render';

import VERT_SHADER from './shaders/render-vert.wgsl?raw';
import FRAG_SHADER from './shaders/render-frag.wgsl?raw';
import COUNT_SHADER from './shaders/render-count.wgsl?raw';
import { FeatureCollection } from 'geojson';

type LayerMeshData = { geometries: LayerGeometry[]; color: ColorRGB };

/**
 * Renders a scene from multiple street-level viewpoints into offscreen tiles and
 * counts non-sky pixels per tile using a WebGPU compute shader.
 *
 * `ComputeRender` generates viewpoints automatically from `params.source` via
 * {@link generateViewpoints}, renders the scene from each viewpoint into an
 * offscreen tile, and computes visibility metrics:
 *
 * - `buildingCoverage` — fraction of tile pixels occupied by geometry [0–1]
 * - `skyViewFactor` — fraction of tile pixels showing sky (1 − buildingCoverage)
 *
 * The pipeline uses a tile-based batch rendering approach:
 * 1. All viewpoints are packed into a grid of tiles (e.g., 64×64 pixels each)
 * 2. One render pass per viewpoint draws all layers into its tile
 * 3. A compute pass counts non-sky pixels across all tiles in parallel
 *
 * @extends GpuPipeline
 *
 * @example
 * // Basic render pipeline usage
 * const render = new ComputeRender();
 * const result = await render.run({
 *   layers: [
 *     { geojson: buildings, color: { r: 128, g: 128, b: 128, alpha: 1 }, type: 'buildings' },
 *     { geojson: parks, color: { r: 34, g: 139, b: 34, alpha: 0.8 }, type: 'parks' }
 *   ],
 *   source: streetNetwork,
 *   eyeHeight: 1.7,
 *   fov: 90,
 *   tileSize: 64
 * });
 *
 * @example
 * // Access results
 * result.features.forEach(feature => {
 *   const { buildingCoverage, skyViewFactor } = feature.properties.compute;
 *   console.log(`Coverage: ${buildingCoverage.toFixed(2)}, Sky: ${skyViewFactor.toFixed(2)}`);
 * });
 */
export class ComputeRender extends GpuPipeline {
    /**
     * Runs the render pipeline and returns the generated viewpoints annotated with
     * per-viewpoint coverage metrics.
     *
     * The pipeline executes in the following stages:
     * 1. Generate viewpoints from `params.source` using {@link generateViewpoints}
     * 2. Triangulate all layers using the appropriate `autk-core` triangulator
     * 3. Build view-projection matrices using {@link buildCameraMatrices}
     * 4. Upload geometry and colors to GPU buffers
     * 5. Render all viewpoints into a tiled texture
     * 6. Count non-sky pixels using a compute shader
     * 7. Write metrics back to viewpoint features
     *
     * @param params - Render pipeline parameters.
     * @param params.layers - Geometry layers to render.
     * @param params.source - Source for viewpoint generation.
     * @param params.eyeHeight - Camera eye height (default: 1.7).
     * @param params.fov - Horizontal FOV in degrees (default: 90).
     * @param params.near - Near clip plane (default: 1).
     * @param params.far - Far clip plane (default: 5000).
     * @param params.tileSize - Tile resolution in pixels, must be multiple of 8 (default: 64).
     * @param params.clearColor - Background color [R, G, B, A] in [0–1] (default: [0, 0, 0, 1]).
     * @returns FeatureCollection of viewpoints with `buildingCoverage` and `skyViewFactor` metrics.
     * @throws If `layers` is empty.
     * @throws If `tileSize` is not a multiple of 8.
     *
     * @example
     * const result = await render.run({
     *   layers: [buildingsLayer],
     *   source: viewpoints,
     *   tileSize: 128,
     *   clearColor: [0.1, 0.2, 0.3, 1.0] // twilight sky
     * });
     */
    async run(params: RenderPipelineParams): Promise<FeatureCollection> {
        const {
            layers,
            source,
            eyeHeight = 1.7,
            fov = 90,
            near = 1,
            far = 5000,
            tileSize = 64,
            clearColor = [0, 0, 0, 1],
        } = params;

        if (layers.length === 0) {
            throw new Error('RenderPipeline: at least one layer is required.');
        }
        if (tileSize % 8 !== 0) {
            throw new Error('RenderPipeline: tileSize must be a multiple of 8.');
        }

        const viewpoints = generateViewpoints(source);
        const N = viewpoints.features.length;
        if (N === 0) {
            return viewpoints;
        }

        const origin = computeOrigin(source);

        const meshes = layers
            .map((l) => this.triangulateLayer(l, origin))
            .filter((m): m is LayerMeshData => m !== null);

        if (meshes.length === 0) {
            return viewpoints;
        }

        const cameras = buildCameraMatrices(viewpoints, origin, eyeHeight, fov, near, far);
        const gridSize = Math.ceil(Math.sqrt(N));
        const texSize = gridSize * tileSize;

        const device = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;

        // --- GPU resource allocation ---
        const tileTexture = this.createTileTexture(device, texSize);
        const depthTexture = this.createDepthTexture(device, texSize);
        const tileView = tileTexture.createView();
        const depthView = depthTexture.createView();
        const gpuLayers = meshes.map((m) => this.uploadLayerToGpu(device, m));
        const { cameraBuf, cameraStride } = this.buildCameraBuffer(device, cameras, N, alignment);
        const { resultsBuf, paramsBuf } = this.buildCountBuffers(device, N, gridSize, tileSize, clearColor);

        // --- Pipeline creation ---
        const { renderPipeline, camBGL, colorBGL } = this.buildRenderPipeline(device);
        const { countPipeline, countBG } = this.buildCountPipeline(device, tileView, resultsBuf, paramsBuf);
        const camBG = device.createBindGroup({
            layout: camBGL,
            entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }],
        });
        const colorBGs = gpuLayers.map(({ colorBuf }) =>
            device.createBindGroup({
                layout: colorBGL,
                entries: [{ binding: 0, resource: { buffer: colorBuf } }],
            })
        );

        // --- Command encoding ---
        const encoder = device.createCommandEncoder();
        this.encodeRenderPasses(
            encoder, N, gridSize, tileSize, tileView, depthView, renderPipeline, camBG, cameraStride, colorBGs, gpuLayers, clearColor
        );
        this.encodeCountPass(encoder, countPipeline, countBG, tileSize, N);

        // --- Readback ---
        const stagingBuf = this.createStagingBuffer(device, N * 4);
        encoder.copyBufferToBuffer(resultsBuf, 0, stagingBuf, 0, N * 4);
        device.queue.submit([encoder.finish()]);

        const rawResults = await this.mapReadBuffer(stagingBuf, Uint32Array);

        // --- Cleanup ---
        tileTexture.destroy();
        depthTexture.destroy();
        cameraBuf.destroy();
        resultsBuf.destroy();
        paramsBuf.destroy();
        for (const { vBuf, iBuf, colorBuf } of gpuLayers) {
            vBuf.destroy();
            iBuf.destroy();
            colorBuf.destroy();
        }

        return this.applyMetrics(viewpoints, rawResults, tileSize);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Triangulates a layer using the appropriate autk-core strategy.
     *
     * @param layer - Render layer with GeoJSON and type.
     * @param origin - Scene origin for coordinate normalization.
     * @returns Triangulated mesh data or null if unsupported.
     * @private
     */
    private triangulateLayer(layer: RenderLayer, origin: [number, number]): LayerMeshData | null {
        let geometries;
        switch (layer.type) {
            case 'buildings':
                [geometries] = TriangulatorBuildings.buildMesh(layer.geojson, origin);
                break;
            case 'polygons':
            case 'surface':
            case 'water':
            case 'parks':
                [geometries] = TriangulatorPolygons.buildMesh(layer.geojson, origin);
                break;
            case 'roads':
            case 'polylines':
                [geometries] = TriangulatorPolylines.buildMesh(layer.geojson, origin);
                break;
            case 'points':
                [geometries] = TriangulatorPoints.buildMesh(layer.geojson, origin);
                break;
            default:
                console.warn(`RenderPipeline: unsupported layer type "${layer.type}", skipping.`);
                return null;
        }
        return { geometries, color: layer.color };
    }

    /**
     * Creates an RGBA8 texture for rendering the tiled output.
     *
     * @param device - GPU device.
     * @param texSize - Texture dimension (square).
     * @returns GPUTexture with RENDER_ATTACHMENT and TEXTURE_BINDING usage.
     * @private
     */
    private createTileTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    /**
     * Creates a depth32float texture for depth testing during rendering.
     *
     * @param device - GPU device.
     * @param texSize - Texture dimension (square).
     * @returns GPUTexture with RENDER_ATTACHMENT usage.
     * @private
     */
    private createDepthTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    /**
     * Uploads a layer's mesh and colour to GPU buffers.
     *
     * Positions are always promoted to 3D (Z=0 for 2D triangulator output) to satisfy
     * the render shader's float32x3 vertex format.
     *
     * @param device - GPU device.
     * @param geometries - Triangulated layer geometries.
     * @param color - Layer color in ColorRGB format.
     * @returns GPU buffer handles for rendering.
     * @private
     */
    private uploadLayerToGpu(device: GPUDevice, { geometries, color }: LayerMeshData): GpuLayerData {
        let totalVerts = 0;
        let totalIndices = 0;
        for (const g of geometries) {
            const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
            totalVerts += (is2D ? g.position.length / 2 : g.position.length / 3) * 3;
            totalIndices += g.indices?.length ?? 0;
        }

        const positions = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);
        let vOffset = 0;
        let iOffset = 0;
        let vertexCount = 0;

        for (const g of geometries) {
            const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
            if (is2D) {
                for (let i = 0, j = 0; i < g.position.length; i += 2, j += 3) {
                    positions[vOffset + j] = g.position[i];
                    positions[vOffset + j + 1] = g.position[i + 1];
                    // positions[vOffset + j + 2] stays 0
                }
            } else {
                positions.set(g.position, vOffset);
            }
            if (g.indices) {
                for (let i = 0; i < g.indices.length; i++) {
                    indices[iOffset + i] = g.indices[i] + vertexCount;
                }
                iOffset += g.indices.length;
            }
            const vertsAdded = is2D ? g.position.length / 2 : g.position.length / 3;
            vOffset += vertsAdded * 3;
            vertexCount += vertsAdded;
        }

        const vBuf = this.createBuffer(
            device,
            positions.byteLength,
            GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            positions
        );
        const iBuf = this.createBuffer(
            device,
            indices.byteLength,
            GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            indices
        );
        // ColorRGB r/g/b are in [0–255]; normalise to [0–1] for the WGSL vec4f uniform.
        const colorBuf = this.createBuffer(
            device,
            16,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Float32Array([color.r / 255, color.g / 255, color.b / 255, color.alpha])
        );
        return { vBuf, iBuf, indexCount: indices.length, colorBuf };
    }

    /**
     * Packs view-projection matrices into a stride-aligned uniform buffer.
     *
     * Each matrix is padded to `minUniformBufferOffsetAlignment` (typically 256 bytes)
     * to allow dynamic offsets when binding per-viewpoint cameras.
     *
     * @param device - GPU device.
     * @param cameras - Flat array of 4×4 matrices (16 floats each).
     * @param N - Number of viewpoints.
     * @param alignment - Device uniform buffer alignment.
     * @returns Buffer and stride for dynamic offset binding.
     * @private
     */
    private buildCameraBuffer(
        device: GPUDevice,
        cameras: Float32Array,
        N: number,
        alignment: number,
    ): { cameraBuf: GPUBuffer; cameraStride: number } {
        const cameraStride = Math.max(64, alignment);
        const raw = new ArrayBuffer(N * cameraStride);
        for (let i = 0; i < N; i++) {
            new Float32Array(raw, i * cameraStride, 16).set(cameras.subarray(i * 16, i * 16 + 16));
        }
        const cameraBuf = this.createBuffer(
            device,
            N * cameraStride,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(raw)
        );
        return { cameraBuf, cameraStride };
    }

    /**
     * Creates the pixel-count storage buffer and the params uniform buffer.
     *
     * The params buffer contains:
     * - gridSize (uint32)
     * - tileSize (uint32)
     * - N viewport count (uint32)
     * - _pad (uint32)
     * - clearColor (4× float32)
     *
     * @param device - GPU device.
     * @param N - Number of viewpoints.
     * @param gridSize - Tile grid dimension.
     * @param tileSize - Tile size in pixels.
     * @param clearColor - Clear color [R, G, B, A].
     * @returns Results and params buffers.
     * @private
     */
    private buildCountBuffers(
        device: GPUDevice,
        N: number,
        gridSize: number,
        tileSize: number,
        clearColor: [number, number, number, number],
    ): { resultsBuf: GPUBuffer; paramsBuf: GPUBuffer } {
        const resultsBuf = device.createBuffer({
            size: N * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const paramsData = new ArrayBuffer(32);
        const pv = new DataView(paramsData);
        pv.setUint32(0, gridSize, true);
        pv.setUint32(4, tileSize, true);
        pv.setUint32(8, N, true);
        // offset 12 is _pad
        pv.setFloat32(16, clearColor[0], true);
        pv.setFloat32(20, clearColor[1], true);
        pv.setFloat32(24, clearColor[2], true);
        pv.setFloat32(28, clearColor[3], true);
        const paramsBuf = this.createBuffer(
            device,
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(paramsData)
        );

        return { resultsBuf, paramsBuf };
    }

    /**
     * Creates the render pipeline with depth testing and alpha blending.
     *
     * The pipeline uses:
     * - Vertex shader with position input (float32x3)
     * - Fragment shader with alpha blending (src-alpha, one-minus-src-alpha)
     * - Depth testing (less-than comparison, depth write enabled)
     * - No culling (both front and back faces rendered)
     *
     * @param device - GPU device.
     * @returns Render pipeline and bind group layouts.
     * @private
     */
    private buildRenderPipeline(device: GPUDevice): {
        renderPipeline: GPURenderPipeline;
        camBGL: GPUBindGroupLayout;
        colorBGL: GPUBindGroupLayout;
    } {
        const camBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 },
                },
            ],
        });
        const colorBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform', minBindingSize: 16 },
                },
            ],
        });

        const renderPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [camBGL, colorBGL] }),
            vertex: {
                module: device.createShaderModule({ code: VERT_SHADER }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 12,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        ],
                    },
                ],
            },
            fragment: {
                module: device.createShaderModule({ code: FRAG_SHADER }),
                entryPoint: 'main',
                targets: [
                    {
                        format: 'rgba8unorm',
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                        },
                    },
                ],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: 'depth32float',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        return { renderPipeline, camBGL, colorBGL };
    }

    /**
     * Creates the pixel-counting compute pipeline and its bind group.
     *
     * The compute shader samples the rendered texture and counts pixels
     * that are not fully transparent (alpha > 0).
     *
     * @param device - GPU device.
     * @param tileView - Rendered texture view.
     * @param resultsBuf - Output storage buffer for counts.
     * @param paramsBuf - Uniform buffer with grid params.
     * @returns Compute pipeline and bind group.
     * @private
     */
    private buildCountPipeline(
        device: GPUDevice,
        tileView: GPUTextureView,
        resultsBuf: GPUBuffer,
        paramsBuf: GPUBuffer,
    ): { countPipeline: GPUComputePipeline; countBG: GPUBindGroup } {
        const countBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: 'float', viewDimension: '2d' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform', minBindingSize: 32 },
                },
            ],
        });

        const countPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [countBGL] }),
            compute: {
                module: device.createShaderModule({ code: COUNT_SHADER }),
                entryPoint: 'main',
            },
        });

        const countBG = device.createBindGroup({
            layout: countBGL,
            entries: [
                { binding: 0, resource: tileView },
                { binding: 1, resource: { buffer: resultsBuf } },
                { binding: 2, resource: { buffer: paramsBuf } },
            ],
        });

        return { countPipeline, countBG };
    }

    /**
     * Encodes one render pass per viewpoint, each restricted to its tile via viewport + scissor.
     *
     * The depth attachment is cleared per pass so each tile's depth is independent.
     * The colour attachment is only cleared on the first pass; subsequent passes load the
     * previously rendered tiles and only write within their scissor region.
     *
     * @param encoder - Command encoder.
     * @param N - Number of viewpoints.
     * @param gridSize - Tile grid dimension.
     * @param tileSize - Tile size in pixels.
     * @param tileView - Render target texture view.
     * @param depthView - Depth texture view.
     * @param renderPipeline - Render pipeline.
     * @param camBG - Camera bind group.
     * @param cameraStride - Camera buffer stride for dynamic offsets.
     * @param colorBGs - Color bind groups (one per layer).
     * @param gpuLayers - GPU layer data.
     * @param clearColor - Clear color for first pass.
     * @private
     */
    private encodeRenderPasses(
        encoder: GPUCommandEncoder,
        N: number,
        gridSize: number,
        tileSize: number,
        tileView: GPUTextureView,
        depthView: GPUTextureView,
        renderPipeline: GPURenderPipeline,
        camBG: GPUBindGroup,
        cameraStride: number,
        colorBGs: GPUBindGroup[],
        gpuLayers: GpuLayerData[],
        clearColor: [number, number, number, number],
    ): void {
        for (let i = 0; i < N; i++) {
            const col = i % gridSize;
            const row = Math.floor(i / gridSize);

            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: tileView,
                        loadOp: i === 0 ? 'clear' : 'load',
                        storeOp: 'store',
                        clearValue: {
                            r: clearColor[0],
                            g: clearColor[1],
                            b: clearColor[2],
                            a: clearColor[3],
                        },
                    },
                ],
                depthStencilAttachment: {
                    view: depthView,
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear', // each tile gets a fresh depth buffer
                    depthStoreOp: 'discard', // depth is not needed after the pass
                },
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
    }

    /**
     * Dispatches the pixel-counting compute shader over all tiles.
     *
     * The compute shader is dispatched with a 3D grid:
     * - X: tileSize / 8 workgroups (tile width)
     * - Y: tileSize / 8 workgroups (tile height)
     * - Z: N workgroups (one per viewpoint/tile)
     *
     * @param encoder - Command encoder.
     * @param countPipeline - Compute pipeline.
     * @param countBG - Compute bind group.
     * @param tileSize - Tile size in pixels.
     * @param N - Number of viewpoints.
     * @private
     */
    private encodeCountPass(
        encoder: GPUCommandEncoder,
        countPipeline: GPUComputePipeline,
        countBG: GPUBindGroup,
        tileSize: number,
        N: number,
    ): void {
        const ts8 = tileSize / 8;
        const cPass = encoder.beginComputePass();
        cPass.setPipeline(countPipeline);
        cPass.setBindGroup(0, countBG);
        cPass.dispatchWorkgroups(ts8, ts8, N);
        cPass.end();
    }

    /**
     * Writes coverage metrics back into the viewpoint features.
     *
     * @param viewpoints - Viewpoint FeatureCollection.
     * @param rawResults - Non-sky pixel counts per viewpoint.
     * @param tileSize - Tile size in pixels.
     * @returns FeatureCollection with `buildingCoverage` and `skyViewFactor` added.
     * @private
     */
    private applyMetrics(
        viewpoints: FeatureCollection,
        rawResults: Uint32Array,
        tileSize: number,
    ): FeatureCollection {
        const totalPixels = tileSize * tileSize;
        return {
            ...viewpoints,
            features: viewpoints.features.map((feature, i) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    compute: {
                        ...(feature.properties?.compute ?? {}),
                        buildingCoverage: rawResults[i] / totalPixels,
                        skyViewFactor: 1 - rawResults[i] / totalPixels,
                    },
                },
            })),
        } as FeatureCollection;
    }
}
