/**
 * @module AutkComputeRender
 * Render-compute pipeline for sampled viewpoint aggregation.
 *
 * This module defines `ComputeRender`, which triangulates render layers,
 * uploads them to WebGPU, runs a tiled visibility pass for each sampled
 * viewpoint, and writes aggregated render metrics back onto the source
 * feature collection. It also owns pipeline caching, batch sizing, and the
 * aggregation limits used for class and object visibility accumulation.
 */

/// <reference types="@webgpu/types" />

import COUNT_SHADER from './shaders/render-count.wgsl?raw';
import FRAG_SHADER from './shaders/render-frag.wgsl?raw';
import VERT_SHADER from './shaders/render-vert.wgsl?raw';

import { FeatureCollection } from 'geojson';

import {
    LayerGeometry,
    TriangulatorBuildings,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    computeOrigin,
} from 'autk-core';

import type { RenderAggregation, RenderLayer, RenderPipelineParams } from './api';

import { GpuPipeline } from './compute-pipeline';

import type {
    CachedCountPipeline,
    CachedRenderPipeline,
    CountBuffers,
    GpuFeatureDraw,
    LayerFeatureMeta,
    LayerMeshData,
    RenderMetadata,
    RenderObjectMetric,
} from './types-render';

import { 
    buildCameraMatrices,
    resolveRenderViewpoints
} from './viewpoint';

import type { CameraSample } from './viewpoint';


const ENCODED_LAYER_TYPE_BYTE_COUNT = 1;
const ENCODED_OBJECT_ID_BYTE_COUNT = 2;
const MAX_ENCODED_LAYER_TYPE_COUNT = (1 << (ENCODED_LAYER_TYPE_BYTE_COUNT * 8)) - 1;
const MAX_ENCODED_OBJECT_ID_COUNT = (1 << (ENCODED_OBJECT_ID_BYTE_COUNT * 8)) - 1;
const ENCODED_BYTE_MASK = 0xff;
const OBJECT_VISIBILITY_COUNT_BYTES_PER_ENTRY = Uint32Array.BYTES_PER_ELEMENT;
const MAX_CPU_OBJECT_VISIBILITY_ACCUMULATION_BYTES = 256 * 1024 * 1024;

/**
 * Computes render-derived metrics for a feature collection.
 *
 * `ComputeRender` coordinates triangulation, GPU upload, batched render and
 * count passes, and CPU-side reduction of the sampled results. The class
 * caches device-scoped pipelines and enforces the supported limits for class
 * and object aggregation.
 */
export class ComputeRender extends GpuPipeline {
    /** Cached render pipeline per GPU device. */
    private renderPipelineCache = new WeakMap<GPUDevice, CachedRenderPipeline>();
    /** Cached count pipeline per GPU device. */
    private countPipelineCache = new WeakMap<GPUDevice, CachedCountPipeline>();

    /**
     * Samples each resolved viewpoint, aggregates the render results, and writes
     * the metrics back into the collection.
     *
     * The render pass is executed in batches sized to the current WebGPU device
     * limits. Each batch renders all eligible layers into a tiled texture,
     * counts visible classes and objects, and accumulates the raw counts before
     * a final aggregation step updates `feature.properties.compute.render`.
     *
     * @returns A copied collection with per-feature render metrics attached.
     *
     * @param params Render pipeline parameters.
     * @param params.layers Geometry layers to render.
     * @param params.viewpoints Viewpoint collection and sampling strategy.
     * @param params.aggregation Reduction strategy applied to sampled renders.
     * @param params.camera Optional camera controls.
     * @param params.tileSize Tile resolution in pixels; must be a multiple of 8.
     * @throws If no layers are provided or tileSize is not a multiple of 8.
     */
    async run(params: RenderPipelineParams): Promise<FeatureCollection> {
        const {
            layers,
            viewpoints,
            aggregation,
            camera,
            tileSize = 64,
        } = params;
        const fov = camera?.fov ?? 90;
        const near = camera?.clip?.near ?? 1;
        const far = camera?.clip?.far ?? 5000;

        if (layers.length === 0) {
            throw new Error('ComputeRender: at least one layer is required.');
        }
        if (tileSize % 8 !== 0) {
            throw new Error('ComputeRender: tileSize must be a multiple of 8.');
        }

        const resolvedViewpoints = resolveRenderViewpoints(viewpoints);
        const resolvedCollection = resolvedViewpoints.collection;
        const samples = resolvedViewpoints.samples;
        const metadata = this.buildRenderMetadata(layers, aggregation);
        const sampleCount = samples.length;

        if (sampleCount === 0) {
            return this.applyAggregation(resolvedCollection, samples, metadata, new Uint32Array(0), new Uint32Array(0), tileSize);
        }

        const origin = computeOrigin(resolvedCollection);
        const layerMeshes = layers
            .map((layer, layerIndex) => this.triangulateLayer(layer, origin, layerIndex))
            .filter((entry): entry is LayerMeshData => entry !== null);
        const cameras = buildCameraMatrices(samples, origin, fov, near, far);

        const device = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;
        const cameraStride = Math.max(64, alignment);
        this.validateAggregationBufferSizes(device, resolvedCollection.features.length, metadata);
        this.validateObjectAggregationCpuBufferSize(resolvedCollection.features.length, metadata);
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

            const { renderPipeline, camBGL, idBGL } = this.getRenderPipeline(device);
            const { countPipeline, countBGL } = this.getCountPipeline(device);
            const idBGs = draws.map((draw) =>
                device.createBindGroup({
                    layout: idBGL,
                    entries: [{ binding: 0, resource: { buffer: draw.idBuf } }],
                })
            );

            const rawClasses = metadata.includeClasses
                ? new Uint32Array(resolvedCollection.features.length * metadata.layerTypes.length)
                : new Uint32Array(0);
            const objectVisibleCounts = metadata.includeObjects
                ? new Uint32Array(resolvedCollection.features.length * metadata.objectKeys.length)
                : new Uint32Array(0);

            for (let batchStart = 0; batchStart < sampleCount; batchStart += batchSize) {
                const batchSamples = samples.slice(batchStart, Math.min(sampleCount, batchStart + batchSize));
                const batchCount = batchSamples.length;
                const batchGridSize = Math.ceil(Math.sqrt(batchCount));
                const texSize = batchGridSize * tileSize;
                const batchCameraData = cameras.subarray(batchStart * 16, (batchStart + batchCount) * 16);

                const tileTexture = this.createTileTexture(device, texSize);
                const depthTexture = this.createDepthTexture(device, texSize);
                const cameraBuf = this.buildCameraBuffer(device, batchCameraData, batchCount, alignment).cameraBuf;
                const countBuffers = this.buildCountBuffers(
                    device,
                    resolvedCollection.features.length,
                    batchCount,
                    batchGridSize,
                    tileSize,
                    batchSamples,
                    metadata
                );
                let classStage: GPUBuffer | null = null;
                let objectStage: GPUBuffer | null = null;

                try {
                    const tileView = tileTexture.createView();
                    const depthView = depthTexture.createView();
                    const countBG = this.buildCountBindGroup(device, countBGL, tileView, countBuffers);
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
                        depthView,
                        renderPipeline,
                        camBG,
                        cameraStride,
                        draws,
                        idBGs,
                    );
                    this.encodeCountPass(encoder, countPipeline, countBG, tileSize, batchCount);

                    classStage = countBuffers.layerTypeSize > 0
                        ? this.createStagingBuffer(device, countBuffers.layerTypeSize)
                        : null;
                    objectStage = countBuffers.objectSize > 0
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
                        this.accumulateObjectVisibilityCounts(
                            objectVisibleCounts,
                            batchObjects,
                            batchSamples,
                            metadata.objectKeys.length
                        );
                    }
                } finally {
                    classStage?.destroy();
                    objectStage?.destroy();
                    depthTexture.destroy();
                    tileTexture.destroy();
                    cameraBuf.destroy();
                    countBuffers.layerTypeBuf.destroy();
                    countBuffers.objectBuf.destroy();
                    countBuffers.sampleSourcesBuf.destroy();
                    countBuffers.paramsBuf.destroy();
                }
            }

            return this.applyAggregation(resolvedCollection, samples, metadata, rawClasses, objectVisibleCounts, tileSize);
        } finally {
            for (const buffer of createdBuffers) {
                buffer.destroy();
            }
        }
    }

    /**
     * Computes the largest sample batch supported by the current device.
     *
     * The batch size is constrained by tile texture dimensions, uniform-buffer
     * capacity, storage-buffer limits, and compute workgroup limits. Object
     * aggregation adds an additional storage-buffer bound.
     */
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

    /**
     * Ensures class aggregation fits within the device storage-buffer limit.
     *
     * Object aggregation is validated separately because it uses CPU-side
     * accumulation after the GPU pass.
     */
    private validateAggregationBufferSizes(
        device: GPUDevice,
        collectionCount: number,
        metadata: RenderMetadata,
    ): void {
        if (!metadata.includeClasses) {
            return;
        }

        const layerTypeBufferSize = collectionCount * metadata.layerTypes.length * 4;
        if (layerTypeBufferSize > device.limits.maxStorageBufferBindingSize) {
            throw new Error(
                `RenderPipeline: class aggregation requires ${layerTypeBufferSize} bytes, exceeding maxStorageBufferBindingSize ${device.limits.maxStorageBufferBindingSize}.`
            );
        }
    }

    /**
     * Ensures object visibility accumulation fits within the supported CPU budget.
     */
    private validateObjectAggregationCpuBufferSize(collectionCount: number, metadata: RenderMetadata): void {
        if (!metadata.includeObjects) {
            return;
        }

        const requiredBytes =
            collectionCount * metadata.objectKeys.length * OBJECT_VISIBILITY_COUNT_BYTES_PER_ENTRY;
        if (requiredBytes > MAX_CPU_OBJECT_VISIBILITY_ACCUMULATION_BYTES) {
            throw new Error(
                `ComputeRender: object aggregation requires ${requiredBytes} bytes on the CPU, exceeding the supported accumulation limit of ${MAX_CPU_OBJECT_VISIBILITY_ACCUMULATION_BYTES} bytes.`
            );
        }
    }

    /**
     * Resolves aggregation metadata for the current layer set.
     *
     * This collects the distinct layer types used for class aggregation,
     * prepares object keys and per-feature lookup metadata when object
     * visibility is requested, and encodes the flags consumed by the GPU
     * count pass.
     */
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
            let layerTypeIndex = layerTypeIndexById.get(layer.type);
            if (layerTypeIndex === undefined) {
                layerTypeIndex = layerTypes.length;
                layerTypes.push(layer.type);
                layerTypeIndexById.set(layer.type, layerTypeIndex);
            }

            layerTypeIndexByLayer.push(layerTypeIndex);
            if (includeObjects) {
                if (layer.id.length === 0) {
                    throw new Error('ComputeRender: layer id must be non-empty when object aggregation is enabled.');
                }
                if (seenLayerIds?.has(layer.id)) {
                    throw new Error(`ComputeRender: duplicate layer id "${layer.id}" is not allowed for object aggregation.`);
                }
                seenLayerIds?.add(layer.id);

                const seenObjectKeys = layer.objectIdProperty ? new Set<string>() : null;
                const featureMeta = layer.collection.features.map((feature, featureIndex) => {
                    const rawId = layer.objectIdProperty
                        ? feature.properties?.[layer.objectIdProperty]
                        : undefined;
                    const objectKey =
                        rawId === undefined || rawId === null
                            ? this.buildObjectKey(layer.id, featureIndex)
                            : this.buildObjectKey(layer.id, rawId);

                    if (seenObjectKeys?.has(objectKey)) {
                        throw new Error(
                            `ComputeRender: duplicate ${layer.objectIdProperty} value "${String(rawId)}" in layer "${layer.id}" is not allowed for object aggregation.`
                        );
                    }
                    seenObjectKeys?.add(objectKey);

                    const objectIndex = objectKeys.length;
                    objectKeys.push(objectKey);
                    return { layerTypeIndex, objectIndex };
                });
                featureMetaByLayer.push(featureMeta);
            } else {
                featureMetaByLayer.push([]);
            }
        });

        if (includeBackgroundLayerType) {
            const backgroundLayerType = aggregation.backgroundLayerType ?? 'background';
            if (layerTypeIndexById.has(backgroundLayerType)) {
                throw new Error(
                    `ComputeRender: backgroundLayerType "${backgroundLayerType}" must not match a rendered layer type when class aggregation includes background.`
                );
            }
            layerTypes.push(backgroundLayerType);
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
            includeClasses,
            includeObjects,
            flags,
        };
    }

    /**
     * Triangulates a render layer into mesh data relative to the shared origin.
     *
     * Unsupported layer types are skipped so they do not participate in the
     * render pass.
     */
    private triangulateLayer(layer: RenderLayer, origin: [number, number], layerIndex: number): LayerMeshData | null {
        let geometries;
        switch (layer.type) {
            case 'buildings':
                [geometries] = TriangulatorBuildings.buildMesh(layer.collection, origin);
                break;
            case 'polygons':
            case 'surface':
            case 'water':
            case 'parks':
                [geometries] = TriangulatorPolygons.buildMesh(layer.collection, origin);
                break;
            case 'roads':
            case 'polylines':
                [geometries] = TriangulatorPolylines.buildMesh(layer.collection, origin);
                break;
            case 'points':
                [geometries] = TriangulatorPoints.buildMesh(layer.collection, origin);
                break;
            default:
                console.warn(`ComputeRender: unsupported layer type "${layer.type}", skipping.`);
                return null;
        }

        return { geometries, layer, layerIndex };
    }

    /**
     * Uploads per-feature geometry for object aggregation.
     *
     * Geometries are grouped by source feature, flattened into shared GPU
     * buffers, and tagged with encoded layer and object identifiers so the
     * fragment shader can write visibility counts back into the correct slots.
     */
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

    /**
     * Uploads a layer as a single draw for class aggregation.
     *
     * This path merges all geometry in the layer into one GPU draw and encodes
     * only the layer type, which is sufficient when object-level visibility is
     * not requested.
     */
    private uploadMergedLayerToGpu(
        device: GPUDevice,
        layerMesh: LayerMeshData,
        layerTypeIndex: number,
    ): GpuFeatureDraw[] {
        const dimension = layerMesh.layer.type === 'buildings' ? 3 : 2;

        let totalVerts = 0;
        let totalIndices = 0;
        for (const geometry of layerMesh.geometries) {
            if (geometry.position.length % dimension !== 0) {
                throw new Error(
                        `ComputeRender: layer '${layerMesh.layer.id}' has invalid position data for ${dimension}D geometry.`
                    );
                }

            totalVerts += (geometry.position.length / dimension) * 3;
            totalIndices += geometry.indices?.length ?? 0;
        }

        const positions = new Float32Array(totalVerts);
        const indices = new Uint32Array(totalIndices);

        let vOffset = 0;
        let iOffset = 0;
        let vertexCount = 0;

        for (const geometry of layerMesh.geometries) {
            const vertsAdded = geometry.position.length / dimension;

            if (dimension === 2) {
                for (let i = 0, j = 0; i < geometry.position.length; i += 2, j += 3) {
                    positions[vOffset + j] = geometry.position[i];
                    positions[vOffset + j + 1] = geometry.position[i + 1];
                    positions[vOffset + j + 2] = 0;
                }
            } else {
                positions.set(geometry.position, vOffset);
            }

            if (geometry.indices) {
                for (let i = 0; i < geometry.indices.length; i++) {
                    indices[iOffset + i] = geometry.indices[i] + vertexCount;
                }
                iOffset += geometry.indices.length;
            }

            vOffset += vertsAdded * 3;
            vertexCount += vertsAdded;
        }

        const mesh = { positions, indices };
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

    /**
     * Encodes layer and object identifiers for shader consumption.
     */
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

    /**
     * Builds a stable object key from the layer id and source object id.
     */
    private buildObjectKey(layerId: string, rawObjectId: unknown): string {
        return `${encodeURIComponent(layerId)}:${encodeURIComponent(String(rawObjectId))}`;
    }

    /**
     * Creates the shared color attachment used by tiled render sampling.
     */
    private createTileTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    /**
     * Creates the depth attachment used by tiled render sampling.
     */
    private createDepthTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    /**
     * Packs per-sample camera matrices into a uniform buffer.
     */
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

    /**
     * Allocates the storage and uniform buffers required by the count pass.
     */
    private buildCountBuffers(
        device: GPUDevice,
        collectionCount: number,
        sampleCount: number,
        gridSize: number,
        tileSize: number,
        samples: CameraSample[],
        metadata: RenderMetadata,
    ): CountBuffers {
        const layerTypeSize = metadata.includeClasses ? collectionCount * metadata.layerTypes.length * 4 : 0;
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
            new Uint32Array(samples.map(sample => sample.collectionIndex))
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

    /**
     * Builds the render pipeline used to rasterize each sampled viewport.
     */
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
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
        });

        return { renderPipeline, camBGL, idBGL };
    }

    /**
     * Returns the cached render pipeline for a device, building it on demand.
     */
    private getRenderPipeline(device: GPUDevice): CachedRenderPipeline {
        const cached = this.renderPipelineCache.get(device);
        if (cached) {
            return cached;
        }

        const pipeline = this.buildRenderPipeline(device);
        this.renderPipelineCache.set(device, pipeline);
        return pipeline;
    }

    /**
     * Builds the compute pipeline that reduces tiled render output.
     */
    private buildCountPipeline(device: GPUDevice): {
        countPipeline: GPUComputePipeline;
        countBGL: GPUBindGroupLayout;
    } {
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

        return { countPipeline, countBGL };
    }

    /**
     * Returns the cached count pipeline for a device, building it on demand.
     */
    private getCountPipeline(device: GPUDevice): CachedCountPipeline {
        const cached = this.countPipelineCache.get(device);
        if (cached) {
            return cached;
        }

        const pipeline = this.buildCountPipeline(device);
        this.countPipelineCache.set(device, pipeline);
        return pipeline;
    }

    /**
     * Binds the tile texture and reduction buffers for the count pass.
     */
    private buildCountBindGroup(
        device: GPUDevice,
        countBGL: GPUBindGroupLayout,
        tileView: GPUTextureView,
        countBuffers: CountBuffers,
    ): GPUBindGroup {
        return device.createBindGroup({
            layout: countBGL,
            entries: [
                { binding: 0, resource: tileView },
                { binding: 1, resource: { buffer: countBuffers.layerTypeBuf } },
                { binding: 2, resource: { buffer: countBuffers.objectBuf } },
                { binding: 3, resource: { buffer: countBuffers.sampleSourcesBuf } },
                { binding: 4, resource: { buffer: countBuffers.paramsBuf } },
            ],
        });
    }

    /**
     * Encodes one render pass per sample into the tiled target texture.
     *
     * Each sample writes into a viewport-scoped tile, reusing the same shared
     * attachments across the batch.
     */
    private encodeRenderPasses(
        encoder: GPUCommandEncoder,
        sampleCount: number,
        gridSize: number,
        tileSize: number,
        tileView: GPUTextureView,
        depthView: GPUTextureView,
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
                depthStencilAttachment: {
                    view: depthView,
                    depthLoadOp: i === 0 ? 'clear' : 'load',
                    depthStoreOp: 'store',
                    depthClearValue: 1,
                },
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

    /**
     * Encodes the compute pass that counts visible classes and objects.
     */
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

    /**
     * Writes aggregated render metrics back onto the feature collection.
     *
     * Class metrics are normalized by rendered pixels and sample count, while
     * object metrics are written only for objects observed in at least one
     * sample.
     */
    private applyAggregation(
        collection: FeatureCollection,
        samples: CameraSample[],
        metadata: RenderMetadata,
        rawClasses: Uint32Array,
        objectVisibleCounts: Uint32Array,
        tileSize: number,
    ): FeatureCollection {
        const totalPixels = tileSize * tileSize;
        const sampleCounts = new Uint32Array(collection.features.length);
        for (const sample of samples) {
            sampleCounts[sample.collectionIndex] += 1;
        }

        return {
            ...collection,
            features: collection.features.map((feature, collectionIndex) => {
                const sampleCount = sampleCounts[collectionIndex];
                const render: Record<string, unknown> = {
                    sampleCount,
                };

                if (metadata.includeClasses) {
                    const classes: Record<string, number> = {};
                    for (let layerTypeIndex = 0; layerTypeIndex < metadata.layerTypes.length; layerTypeIndex++) {
                        const raw = rawClasses[collectionIndex * metadata.layerTypes.length + layerTypeIndex] ?? 0;
                        classes[metadata.layerTypes[layerTypeIndex]] = sampleCount > 0 ? raw / (totalPixels * sampleCount) : 0;
                    }
                    render.classes = classes;
                }

                if (metadata.includeObjects) {
                    const objects: Record<string, RenderObjectMetric> = {};
                    for (let objectIndex = 0; objectIndex < metadata.objectKeys.length; objectIndex++) {
                        const visibleSamples =
                            objectVisibleCounts[collectionIndex * metadata.objectKeys.length + objectIndex] ?? 0;

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

    /**
     * Accumulates per-object visibility counts from one batch into the totals.
     */
    private accumulateObjectVisibilityCounts(
        objectVisibleCounts: Uint32Array,
        batchObjects: Uint32Array,
        batchSamples: CameraSample[],
        objectCount: number,
    ): void {
        for (let sampleIndex = 0; sampleIndex < batchSamples.length; sampleIndex++) {
            const collectionIndex = batchSamples[sampleIndex]?.collectionIndex;
            if (collectionIndex === undefined) continue;

            const batchOffset = sampleIndex * objectCount;
            const collectionOffset = collectionIndex * objectCount;
            for (let objectIndex = 0; objectIndex < objectCount; objectIndex++) {
                if ((batchObjects[batchOffset + objectIndex] ?? 0) > 0) {
                    objectVisibleCounts[collectionOffset + objectIndex] += 1;
                }
            }
        }
    }
}
