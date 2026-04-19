/// <reference types="@webgpu/types" />

import { FeatureCollection } from 'geojson';

import {
    flattenMesh,
    LayerGeometry,
    TriangulatorBuildings,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    computeOrigin,
} from 'autk-core';

import type { RenderAggregation, RenderLayer, RenderPipelineParams } from './api';
import { GpuPipeline } from './compute-pipeline';
import COUNT_SHADER from './shaders/render-count.wgsl?raw';
import FRAG_SHADER from './shaders/render-frag.wgsl?raw';
import VERT_SHADER from './shaders/render-vert.wgsl?raw';
import type { GpuFeatureDraw } from './types-render';
import { buildCameraMatrices, expandCameraSamples, generateViewOrigins, type CameraSample } from './viewpoint';

type LayerMeshData = {
    geometries: LayerGeometry[];
    layer: RenderLayer;
    layerIndex: number;
};

type LayerFeatureMeta = {
    layerTypeIndex: number;
    objectIndex: number;
    objectKey: string;
};

type RenderMetadata = {
    layerTypes: string[];
    objectKeys: string[];
    layerTypeIndexByLayer: number[];
    featureMetaByLayer: LayerFeatureMeta[][];
    includeBackgroundLayerType: boolean;
    includeClasses: boolean;
    includeObjects: boolean;
    flags: number;
};

type CountBuffers = {
    layerTypeBuf: GPUBuffer;
    objectBuf: GPUBuffer;
    sampleSourcesBuf: GPUBuffer;
    paramsBuf: GPUBuffer;
    layerTypeSize: number;
    objectSize: number;
};

type RenderObjectMetric = {
    visible: boolean;
    sampleRatio: number;
};

const ENCODED_LAYER_TYPE_BYTE_COUNT = 1;
const ENCODED_OBJECT_ID_BYTE_COUNT = 2;
const MAX_ENCODED_LAYER_TYPE_COUNT = (1 << (ENCODED_LAYER_TYPE_BYTE_COUNT * 8)) - 1;
const MAX_ENCODED_OBJECT_ID_COUNT = (1 << (ENCODED_OBJECT_ID_BYTE_COUNT * 8)) - 1;
const ENCODED_BYTE_MASK = 0xff;

/**
 * Samples rendered views from source feature origins and aggregates class
 * shares and object visibility back onto the source features.
 *
 * @extends GpuPipeline
 *
 * @see {@link ComputeGpgpu} for the GPGPU analytical pipeline.
 */
export class ComputeRender extends GpuPipeline {
    /**
     * Renders views from each source feature origin and aggregates class shares
     * and object visibility metrics back onto the source features.
     *
     * @param params - Render pipeline parameters.
     * @param params.layers - Geometry layers to render.
     * @param params.source - Source features used to derive view origins.
     * @param params.aggregation - Reduction strategy applied to sampled renders.
     * @param params.viewSampling - Direction sampling applied to each origin.
     * @param params.fov - Horizontal FOV in degrees (default: 90).
     * @param params.near - Near clip plane (default: 1).
     * @param params.far - Far clip plane (default: 5000).
     * @param params.tileSize - Tile resolution in pixels, must be multiple of 8 (default: 64).
     * @returns A new FeatureCollection with aggregated render metrics in `.properties.compute.render`.
     * @throws If no layers are provided or tileSize is not a multiple of 8.
     */
    async run(params: RenderPipelineParams): Promise<FeatureCollection> {
        const {
            layers,
            source,
            aggregation,
            viewSampling,
            fov = 90,
            near = 1,
            far = 5000,
            tileSize = 64,
        } = params;

        if (layers.length === 0) {
            throw new Error('ComputeRender: at least one layer is required.');
        }
        if (tileSize % 8 !== 0) {
            throw new Error('ComputeRender: tileSize must be a multiple of 8.');
        }

        const viewOrigins = generateViewOrigins(source);
        const samples = expandCameraSamples(viewOrigins, viewSampling);
        const metadata = this.buildRenderMetadata(layers, aggregation);
        const sampleCount = samples.length;

        if (sampleCount === 0) {
            return this.applyAggregation(source, samples, metadata, new Uint32Array(0), new Uint32Array(0), tileSize);
        }

        const origin = computeOrigin(source);
        const layerMeshes = layers
            .map((layer, layerIndex) => this.triangulateLayer(layer, origin, layerIndex))
            .filter((entry): entry is LayerMeshData => entry !== null);
        const cameras = buildCameraMatrices(samples, origin, fov, near, far);

        const device = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;
        const cameraStride = Math.max(64, alignment);
        this.validateAggregationBufferSizes(device, source.features.length, metadata);
        const batchSize = this.computeMaxBatchSize(device, tileSize, cameraStride, metadata);

        const createdBuffers: GPUBuffer[] = [];

        try {
            const draws = metadata.includeObjects
                ? layerMeshes.flatMap((entry) =>
                    this.uploadLayerToGpu(device, entry, metadata.featureMetaByLayer[entry.layerIndex])
                )
                : layerMeshes.flatMap((entry) =>
                    this.uploadMergedLayerToGpu(device, entry, metadata.layerTypeIndexByLayer[entry.layerIndex] ?? 0)
                );
            for (const draw of draws) {
                createdBuffers.push(draw.vBuf, draw.iBuf, draw.idBuf);
            }

            const { renderPipeline, camBGL, idBGL } = this.buildRenderPipeline(device);
            const idBGs = draws.map((draw) =>
                device.createBindGroup({
                    layout: idBGL,
                    entries: [{ binding: 0, resource: { buffer: draw.idBuf } }],
                })
            );

            const rawClasses = metadata.includeClasses
                ? new Uint32Array(source.features.length * metadata.layerTypes.length)
                : new Uint32Array(0);
            const rawObjects = metadata.includeObjects
                ? new Uint32Array(sampleCount * metadata.objectKeys.length)
                : new Uint32Array(0);

            for (let batchStart = 0; batchStart < sampleCount; batchStart += batchSize) {
                const batchSamples = samples.slice(batchStart, Math.min(sampleCount, batchStart + batchSize));
                const batchCount = batchSamples.length;
                const batchGridSize = Math.ceil(Math.sqrt(batchCount));
                const texSize = batchGridSize * tileSize;
                const batchCameraData = cameras.subarray(batchStart * 16, (batchStart + batchCount) * 16);

                const tileTexture = this.createTileTexture(device, texSize);
                const cameraBuf = this.buildCameraBuffer(device, batchCameraData, batchCount, alignment).cameraBuf;
                const countBuffers = this.buildCountBuffers(
                    device,
                    source.features.length,
                    batchCount,
                    batchGridSize,
                    tileSize,
                    batchSamples,
                    metadata
                );

                try {
                    const tileView = tileTexture.createView();
                    const { countPipeline, countBG } = this.buildCountPipeline(device, tileView, countBuffers);
                    const camBG = device.createBindGroup({
                        layout: camBGL,
                        entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }],
                    });

                    const encoder = device.createCommandEncoder();
                    this.encodeRenderPasses(
                        encoder,
                        batchCount,
                        batchGridSize,
                        tileSize,
                        tileView,
                        renderPipeline,
                        camBG,
                        cameraStride,
                        draws,
                        idBGs,
                    );
                    this.encodeCountPass(encoder, countPipeline, countBG, tileSize, batchCount);

                    const classStage = countBuffers.layerTypeSize > 0
                        ? this.createStagingBuffer(device, countBuffers.layerTypeSize)
                        : null;
                    const objectStage = countBuffers.objectSize > 0
                        ? this.createStagingBuffer(device, countBuffers.objectSize)
                        : null;

                    if (classStage) {
                        encoder.copyBufferToBuffer(countBuffers.layerTypeBuf, 0, classStage, 0, countBuffers.layerTypeSize);
                    }
                    if (objectStage) {
                        encoder.copyBufferToBuffer(countBuffers.objectBuf, 0, objectStage, 0, countBuffers.objectSize);
                    }
                    device.queue.submit([encoder.finish()]);

                    const batchClasses = classStage
                        ? await this.mapReadBuffer(classStage, Uint32Array)
                        : null;
                    const batchObjects = objectStage
                        ? await this.mapReadBuffer(objectStage, Uint32Array)
                        : null;

                    if (batchClasses) {
                        for (let i = 0; i < rawClasses.length; i++) {
                            rawClasses[i] += batchClasses[i] ?? 0;
                        }
                    }
                    if (batchObjects) {
                        rawObjects.set(batchObjects, batchStart * metadata.objectKeys.length);
                    }
                } finally {
                    tileTexture.destroy();
                    cameraBuf.destroy();
                    countBuffers.layerTypeBuf.destroy();
                    countBuffers.objectBuf.destroy();
                    countBuffers.sampleSourcesBuf.destroy();
                    countBuffers.paramsBuf.destroy();
                }
            }

            return this.applyAggregation(source, samples, metadata, rawClasses, rawObjects, tileSize);
        } finally {
            for (const buffer of createdBuffers) {
                buffer.destroy();
            }
        }
    }

    private computeMaxBatchSize(
        device: GPUDevice,
        tileSize: number,
        cameraStride: number,
        metadata: RenderMetadata,
    ): number {
        const tilesPerSide = Math.floor(device.limits.maxTextureDimension2D / tileSize);
        const byTexture = tilesPerSide * tilesPerSide;
        const byCamera = Math.floor(device.limits.maxBufferSize / cameraStride);
        const bySampleSources = Math.floor(device.limits.maxStorageBufferBindingSize / 4);
        const byWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
        const objectStride = metadata.includeObjects ? Math.max(1, metadata.objectKeys.length) * 4 : 4;
        const byObjects = metadata.includeObjects
            ? Math.floor(device.limits.maxStorageBufferBindingSize / objectStride)
            : Number.MAX_SAFE_INTEGER;

        const batchSize = Math.min(byTexture, byCamera, bySampleSources, byWorkgroups, byObjects);
        if (batchSize < 1) {
            throw new Error('ComputeRender: tileSize exceeds WebGPU device limits.');
        }
        return batchSize;
    }

    private validateAggregationBufferSizes(
        device: GPUDevice,
        sourceCount: number,
        metadata: RenderMetadata,
    ): void {
        if (!metadata.includeClasses) {
            return;
        }

        const layerTypeBufferSize = sourceCount * metadata.layerTypes.length * 4;
        if (layerTypeBufferSize > device.limits.maxStorageBufferBindingSize) {
            throw new Error(
                `RenderPipeline: class aggregation requires ${layerTypeBufferSize} bytes, exceeding maxStorageBufferBindingSize ${device.limits.maxStorageBufferBindingSize}.`
            );
        }
    }

    private buildRenderMetadata(layers: RenderLayer[], aggregation: RenderAggregation): RenderMetadata {
        const layerTypes: string[] = [];
        const layerTypeIndexById = new Map<string, number>();
        const layerTypeIndexByLayer: number[] = [];
        const objectKeys: string[] = [];
        const featureMetaByLayer: LayerFeatureMeta[][] = [];

        const includeClasses = aggregation.type === 'classes';
        const includeObjects = aggregation.type === 'objects';
        const includeBackgroundLayerType = aggregation.type === 'classes' && Boolean(aggregation.includeBackground);
        const seenLayerIds = includeObjects ? new Set<string>() : null;

        layers.forEach((layer) => {
            let layerTypeIndex = layerTypeIndexById.get(layer.layerType);
            if (layerTypeIndex === undefined) {
                layerTypeIndex = layerTypes.length;
                layerTypes.push(layer.layerType);
                layerTypeIndexById.set(layer.layerType, layerTypeIndex);
            }

            layerTypeIndexByLayer.push(layerTypeIndex);
            if (includeObjects) {
                if (layer.layerId.length === 0) {
                    throw new Error('ComputeRender: layerId must be non-empty when object aggregation is enabled.');
                }
                if (seenLayerIds?.has(layer.layerId)) {
                    throw new Error(`ComputeRender: duplicate layerId "${layer.layerId}" is not allowed for object aggregation.`);
                }
                seenLayerIds?.add(layer.layerId);

                const featureMeta = layer.geojson.features.map((feature, featureIndex) => {
                    const rawId = layer.objectIdProperty
                        ? feature.properties?.[layer.objectIdProperty]
                        : undefined;
                    const objectKey = this.buildObjectKey(layer.layerId, rawId ?? featureIndex);
                    const objectIndex = objectKeys.length;
                    objectKeys.push(objectKey);
                    return { layerTypeIndex, objectIndex, objectKey };
                });
                featureMetaByLayer.push(featureMeta);
            } else {
                featureMetaByLayer.push([]);
            }
        });

        if (includeBackgroundLayerType) {
            layerTypes.push(aggregation.backgroundLayerType ?? 'background');
        }

        if (includeClasses && layerTypes.length > MAX_ENCODED_LAYER_TYPE_COUNT) {
            throw new Error(
                `ComputeRender: class aggregation currently supports at most ${MAX_ENCODED_LAYER_TYPE_COUNT} layer types.`
            );
        }

        let flags = 0;
        if (includeClasses) flags |= 1;
        if (includeObjects) flags |= 2;
        if (includeBackgroundLayerType) flags |= 4;

        if (includeObjects && objectKeys.length > MAX_ENCODED_OBJECT_ID_COUNT) {
            throw new Error(
                `ComputeRender: object visibility currently supports at most ${MAX_ENCODED_OBJECT_ID_COUNT} objects.`
            );
        }

        return {
            layerTypes,
            objectKeys,
            layerTypeIndexByLayer,
            featureMetaByLayer,
            includeBackgroundLayerType,
            includeClasses,
            includeObjects,
            flags,
        };
    }

    private triangulateLayer(layer: RenderLayer, origin: [number, number], layerIndex: number): LayerMeshData | null {
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
                console.warn(`ComputeRender: unsupported layer type "${layer.type}", skipping.`);
                return null;
        }

        return { geometries, layer, layerIndex };
    }

    private uploadLayerToGpu(
        device: GPUDevice,
        layerMesh: LayerMeshData,
        featureMeta: LayerFeatureMeta[],
    ): GpuFeatureDraw[] {
        const grouped = new Map<number, LayerGeometry[]>();
        for (const geometry of layerMesh.geometries) {
            const featureIndex = geometry.featureIndex ?? 0;
            if (!grouped.has(featureIndex)) grouped.set(featureIndex, []);
            grouped.get(featureIndex)!.push(geometry);
        }

        const draws: GpuFeatureDraw[] = [];
        for (const [featureIndex, geometries] of grouped.entries()) {
            const meta = featureMeta[featureIndex];
            if (!meta) continue;

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
            const idBuf = this.createBuffer(
                device,
                16,
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                this.encodeIds(meta.layerTypeIndex, meta.objectIndex)
            );

            draws.push({
                vBuf,
                iBuf,
                indexCount: indices.length,
                idBuf,
            });
        }

        return draws;
    }

    private uploadMergedLayerToGpu(
        device: GPUDevice,
        layerMesh: LayerMeshData,
        layerTypeIndex: number,
    ): GpuFeatureDraw[] {
        const mesh = flattenMesh(layerMesh.geometries);
        if (mesh.indices.length === 0) {
            return [];
        }

        const vBuf = this.createBuffer(
            device,
            mesh.positions.byteLength,
            GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mesh.positions
        );
        const iBuf = this.createBuffer(
            device,
            mesh.indices.byteLength,
            GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mesh.indices
        );
        const idBuf = this.createBuffer(
            device,
            16,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            this.encodeIds(layerTypeIndex, 0)
        );

        return [{
            vBuf,
            iBuf,
            indexCount: mesh.indices.length,
            idBuf,
        }];
    }

    private encodeIds(layerTypeIndex: number, objectIndex: number): Float32Array {
        const encodedObject = objectIndex + 1;
        const low = encodedObject & ENCODED_BYTE_MASK;
        const high = (encodedObject >> 8) & ENCODED_BYTE_MASK;
        return new Float32Array([
            (layerTypeIndex + 1) / MAX_ENCODED_LAYER_TYPE_COUNT,
            low / ENCODED_BYTE_MASK,
            high / ENCODED_BYTE_MASK,
            1,
        ]);
    }

    private buildObjectKey(layerId: string, rawObjectId: unknown): string {
        return `${encodeURIComponent(layerId)}:${encodeURIComponent(String(rawObjectId))}`;
    }

    private createTileTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    private buildCameraBuffer(
        device: GPUDevice,
        cameras: Float32Array,
        sampleCount: number,
        alignment: number,
    ): { cameraBuf: GPUBuffer; cameraStride: number } {
        const cameraStride = Math.max(64, alignment);
        const raw = new ArrayBuffer(sampleCount * cameraStride);
        for (let i = 0; i < sampleCount; i++) {
            new Float32Array(raw, i * cameraStride, 16).set(cameras.subarray(i * 16, i * 16 + 16));
        }
        const cameraBuf = this.createBuffer(
            device,
            sampleCount * cameraStride,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(raw)
        );
        return { cameraBuf, cameraStride };
    }

    private buildCountBuffers(
        device: GPUDevice,
        sourceCount: number,
        sampleCount: number,
        gridSize: number,
        tileSize: number,
        samples: CameraSample[],
        metadata: RenderMetadata,
    ): CountBuffers {
        const layerTypeSize = metadata.includeClasses ? sourceCount * metadata.layerTypes.length * 4 : 0;
        const objectSize = metadata.includeObjects ? sampleCount * metadata.objectKeys.length * 4 : 0;
        const sampleSourcesSize = Math.max(4, sampleCount * 4);

        const layerTypeBuf = device.createBuffer({
            size: Math.max(4, layerTypeSize),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const objectBuf = device.createBuffer({
            size: Math.max(4, objectSize),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const sampleSourcesBuf = this.createBuffer(
            device,
            sampleSourcesSize,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            new Uint32Array(samples.map(sample => sample.sourceIndex))
        );

        const paramsData = new ArrayBuffer(32);
        const pv = new DataView(paramsData);
        pv.setUint32(0, gridSize, true);
        pv.setUint32(4, tileSize, true);
        pv.setUint32(8, sampleCount, true);
        pv.setUint32(12, metadata.layerTypes.length, true);
        pv.setUint32(16, metadata.objectKeys.length, true);
        pv.setUint32(20, metadata.flags, true);
        const paramsBuf = this.createBuffer(
            device,
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(paramsData)
        );

        return {
            layerTypeBuf,
            objectBuf,
            sampleSourcesBuf,
            paramsBuf,
            layerTypeSize,
            objectSize,
        };
    }

    private buildRenderPipeline(device: GPUDevice): {
        renderPipeline: GPURenderPipeline;
        camBGL: GPUBindGroupLayout;
        idBGL: GPUBindGroupLayout;
    } {
        const camBGL = device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 },
            }],
        });
        const idBGL = device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform', minBindingSize: 16 },
            }],
        });

        const renderPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [camBGL, idBGL] }),
            vertex: {
                module: device.createShaderModule({ code: VERT_SHADER }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                }],
            },
            fragment: {
                module: device.createShaderModule({ code: FRAG_SHADER }),
                entryPoint: 'main',
                targets: [{ format: 'rgba8unorm' }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        return { renderPipeline, camBGL, idBGL };
    }

    private buildCountPipeline(
        device: GPUDevice,
        tileView: GPUTextureView,
        countBuffers: CountBuffers,
    ): { countPipeline: GPUComputePipeline; countBG: GPUBindGroup } {
        const countBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float', viewDimension: '2d' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 32 } },
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
                { binding: 1, resource: { buffer: countBuffers.layerTypeBuf } },
                { binding: 2, resource: { buffer: countBuffers.objectBuf } },
                { binding: 3, resource: { buffer: countBuffers.sampleSourcesBuf } },
                { binding: 4, resource: { buffer: countBuffers.paramsBuf } },
            ],
        });

        return { countPipeline, countBG };
    }

    private encodeRenderPasses(
        encoder: GPUCommandEncoder,
        sampleCount: number,
        gridSize: number,
        tileSize: number,
        tileView: GPUTextureView,
        renderPipeline: GPURenderPipeline,
        camBG: GPUBindGroup,
        cameraStride: number,
        draws: GpuFeatureDraw[],
        idBGs: GPUBindGroup[],
    ): void {
        for (let i = 0; i < sampleCount; i++) {
            const col = i % gridSize;
            const row = Math.floor(i / gridSize);

            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: tileView,
                    loadOp: i === 0 ? 'clear' : 'load',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                }],
            });

            pass.setPipeline(renderPipeline);
            pass.setViewport(col * tileSize, row * tileSize, tileSize, tileSize, 0, 1);
            pass.setScissorRect(col * tileSize, row * tileSize, tileSize, tileSize);
            pass.setBindGroup(0, camBG, [i * cameraStride]);

            for (let j = 0; j < draws.length; j++) {
                const draw = draws[j];
                pass.setBindGroup(1, idBGs[j]);
                pass.setVertexBuffer(0, draw.vBuf);
                pass.setIndexBuffer(draw.iBuf, 'uint32');
                pass.drawIndexed(draw.indexCount);
            }

            pass.end();
        }
    }

    private encodeCountPass(
        encoder: GPUCommandEncoder,
        countPipeline: GPUComputePipeline,
        countBG: GPUBindGroup,
        tileSize: number,
        sampleCount: number,
    ): void {
        const ts8 = tileSize / 8;
        const cPass = encoder.beginComputePass();
        cPass.setPipeline(countPipeline);
        cPass.setBindGroup(0, countBG);
        cPass.dispatchWorkgroups(ts8, ts8, sampleCount);
        cPass.end();
    }

    private applyAggregation(
        source: FeatureCollection,
        samples: CameraSample[],
        metadata: RenderMetadata,
        rawClasses: Uint32Array,
        rawObjects: Uint32Array,
        tileSize: number,
    ): FeatureCollection {
        const totalPixels = tileSize * tileSize;
        const sampleCounts = new Uint32Array(source.features.length);
        for (const sample of samples) {
            sampleCounts[sample.sourceIndex] += 1;
        }

        return {
            ...source,
            features: source.features.map((feature, sourceIndex) => {
                const sampleCount = sampleCounts[sourceIndex];
                const render: Record<string, unknown> = {
                    sampleCount,
                };

                if (metadata.includeClasses) {
                    const classes: Record<string, number> = {};
                    for (let layerTypeIndex = 0; layerTypeIndex < metadata.layerTypes.length; layerTypeIndex++) {
                        const raw = rawClasses[sourceIndex * metadata.layerTypes.length + layerTypeIndex] ?? 0;
                        classes[metadata.layerTypes[layerTypeIndex]] = sampleCount > 0 ? raw / (totalPixels * sampleCount) : 0;
                    }
                    render.classes = classes;
                }

                if (metadata.includeObjects) {
                    const objects: Record<string, RenderObjectMetric> = {};
                    for (let objectIndex = 0; objectIndex < metadata.objectKeys.length; objectIndex++) {
                        let visibleSamples = 0;
                        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
                            if (samples[sampleIndex].sourceIndex !== sourceIndex) continue;
                            if ((rawObjects[sampleIndex * metadata.objectKeys.length + objectIndex] ?? 0) > 0) {
                                visibleSamples += 1;
                            }
                        }

                        if (visibleSamples > 0) {
                            objects[metadata.objectKeys[objectIndex]] = {
                                visible: true,
                                sampleRatio: sampleCount > 0 ? visibleSamples / sampleCount : 0,
                            };
                        }
                    }
                    render.objects = objects;
                }

                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        compute: {
                            ...(feature.properties?.compute ?? {}),
                            render: {
                                ...((feature.properties?.compute as any)?.render ?? {}),
                                ...render,
                            },
                        },
                    },
                };
            }),
        } as FeatureCollection;
    }
}
