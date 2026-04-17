/// <reference types="@webgpu/types" />

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
    classIndex: number;
    objectIndex: number;
    objectKey: string;
};

type RenderMetadata = {
    classIds: string[];
    objectKeys: string[];
    featureMetaByLayer: LayerFeatureMeta[][];
    includeCoverage: boolean;
    includeClasses: boolean;
    includeObjects: boolean;
    flags: number;
};

type CountBuffers = {
    coverageBuf: GPUBuffer;
    classBuf: GPUBuffer;
    objectBuf: GPUBuffer;
    sampleSourcesBuf: GPUBuffer;
    paramsBuf: GPUBuffer;
    coverageSize: number;
    classSize: number;
    objectSize: number;
};

type RenderObjectMetric = {
    visible: boolean;
    sampleRatio: number;
};

/**
 * Samples rendered views from source feature origins and aggregates coverage,
 * class shares, and object visibility back onto the source features.
 */
export class ComputeRender extends GpuPipeline {
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
            throw new Error('RenderPipeline: at least one layer is required.');
        }
        if (tileSize % 8 !== 0) {
            throw new Error('RenderPipeline: tileSize must be a multiple of 8.');
        }

        const viewOrigins = generateViewOrigins(source);
        const samples = expandCameraSamples(viewOrigins, viewSampling);
        const metadata = this.buildRenderMetadata(layers, aggregation);
        const sampleCount = samples.length;

        if (sampleCount === 0) {
            return this.applyAggregation(source, samples, metadata, new Uint32Array(0), new Uint32Array(0), new Uint32Array(0), tileSize);
        }

        const origin = computeOrigin(source);
        const layerMeshes = layers
            .map((layer, layerIndex) => this.triangulateLayer(layer, origin, layerIndex))
            .filter((entry): entry is LayerMeshData => entry !== null);
        const cameras = buildCameraMatrices(samples, origin, fov, near, far);

        const gridSize = Math.ceil(Math.sqrt(sampleCount));
        const texSize = gridSize * tileSize;
        const device = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;

        const tileTexture = this.createTileTexture(device, texSize);
        const depthTexture = this.createDepthTexture(device, texSize);
        const tileView = tileTexture.createView();
        const depthView = depthTexture.createView();
        const { cameraBuf, cameraStride } = this.buildCameraBuffer(device, cameras, sampleCount, alignment);
        const draws = layerMeshes.flatMap((entry) =>
            this.uploadLayerToGpu(device, entry, metadata.featureMetaByLayer[entry.layerIndex])
        );
        const countBuffers = this.buildCountBuffers(device, source.features.length, sampleCount, gridSize, tileSize, samples, metadata);
        const { renderPipeline, camBGL, idBGL } = this.buildRenderPipeline(device);
        const { countPipeline, countBG } = this.buildCountPipeline(device, tileView, countBuffers);
        const camBG = device.createBindGroup({
            layout: camBGL,
            entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }],
        });
        const idBGs = draws.map((draw) =>
            device.createBindGroup({
                layout: idBGL,
                entries: [{ binding: 0, resource: { buffer: draw.idBuf } }],
            })
        );

        const encoder = device.createCommandEncoder();
        this.encodeRenderPasses(
            encoder,
            sampleCount,
            gridSize,
            tileSize,
            tileView,
            depthView,
            renderPipeline,
            camBG,
            cameraStride,
            draws,
            idBGs,
        );
        this.encodeCountPass(encoder, countPipeline, countBG, tileSize, sampleCount);

        const coverageStage = this.createStagingBuffer(device, countBuffers.coverageSize);
        const classStage = this.createStagingBuffer(device, countBuffers.classSize);
        const objectStage = this.createStagingBuffer(device, countBuffers.objectSize);
        encoder.copyBufferToBuffer(countBuffers.coverageBuf, 0, coverageStage, 0, countBuffers.coverageSize);
        encoder.copyBufferToBuffer(countBuffers.classBuf, 0, classStage, 0, countBuffers.classSize);
        encoder.copyBufferToBuffer(countBuffers.objectBuf, 0, objectStage, 0, countBuffers.objectSize);
        device.queue.submit([encoder.finish()]);

        const rawCoverage = countBuffers.coverageSize > 0 ? await this.mapReadBuffer(coverageStage, Uint32Array) : new Uint32Array(0);
        const rawClasses = countBuffers.classSize > 0 ? await this.mapReadBuffer(classStage, Uint32Array) : new Uint32Array(0);
        const rawObjects = countBuffers.objectSize > 0 ? await this.mapReadBuffer(objectStage, Uint32Array) : new Uint32Array(0);

        tileTexture.destroy();
        depthTexture.destroy();
        cameraBuf.destroy();
        coverageStage.destroy();
        classStage.destroy();
        objectStage.destroy();
        countBuffers.coverageBuf.destroy();
        countBuffers.classBuf.destroy();
        countBuffers.objectBuf.destroy();
        countBuffers.sampleSourcesBuf.destroy();
        countBuffers.paramsBuf.destroy();
        for (const draw of draws) {
            draw.vBuf.destroy();
            draw.iBuf.destroy();
            draw.idBuf.destroy();
        }

        return this.applyAggregation(source, samples, metadata, rawCoverage, rawClasses, rawObjects, tileSize);
    }

    private buildRenderMetadata(layers: RenderLayer[], aggregation: RenderAggregation): RenderMetadata {
        const classIds: string[] = [];
        const classIndexById = new Map<string, number>();
        const objectKeys: string[] = [];
        const featureMetaByLayer: LayerFeatureMeta[][] = [];

        const includeCoverage = aggregation.type === 'coverage' || aggregation.type === 'combined';
        const includeClasses = aggregation.type === 'classes' || aggregation.type === 'combined';
        const includeObjects = aggregation.type === 'objects' || aggregation.type === 'combined';

        layers.forEach((layer) => {
            let classIndex = classIndexById.get(layer.classId);
            if (classIndex === undefined) {
                classIndex = classIds.length;
                classIds.push(layer.classId);
                classIndexById.set(layer.classId, classIndex);
            }

            const featureMeta = layer.geojson.features.map((feature, featureIndex) => {
                const rawId = layer.objectIdProperty
                    ? feature.properties?.[layer.objectIdProperty]
                    : undefined;
                const objectKey = rawId !== undefined && rawId !== null
                    ? `${layer.classId}:${String(rawId)}`
                    : `${layer.classId}:${featureIndex}`;
                const objectIndex = objectKeys.length;
                objectKeys.push(objectKey);
                return { classIndex, objectIndex, objectKey };
            });

            featureMetaByLayer.push(featureMeta);
        });

        let flags = 0;
        if (includeCoverage) flags |= 1;
        if (includeClasses) flags |= 2;
        if (includeObjects) flags |= 4;

        if (objectKeys.length > 65535) {
            throw new Error('RenderPipeline: object visibility currently supports at most 65535 objects.');
        }

        return {
            classIds,
            objectKeys,
            featureMetaByLayer,
            includeCoverage,
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
                console.warn(`RenderPipeline: unsupported layer type "${layer.type}", skipping.`);
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
                this.encodeIds(meta.classIndex, meta.objectIndex)
            );

            draws.push({
                vBuf,
                iBuf,
                indexCount: indices.length,
                idBuf,
                objectKey: meta.objectKey,
                classIndex: meta.classIndex,
                objectIndex: meta.objectIndex,
            });
        }

        return draws;
    }

    private encodeIds(classIndex: number, objectIndex: number): Float32Array {
        const encodedObject = objectIndex + 1;
        const low = encodedObject & 255;
        const high = (encodedObject >> 8) & 255;
        return new Float32Array([
            (classIndex + 1) / 255,
            low / 255,
            high / 255,
            1,
        ]);
    }

    private createTileTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    private createDepthTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
        const coverageSize = Math.max(4, sourceCount * 4);
        const classSize = Math.max(4, sourceCount * Math.max(1, metadata.classIds.length) * 4);
        const objectSize = Math.max(4, sampleCount * Math.max(1, metadata.objectKeys.length) * 4);
        const sampleSourcesSize = Math.max(4, sampleCount * 4);

        const coverageBuf = device.createBuffer({
            size: coverageSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const classBuf = device.createBuffer({
            size: classSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const objectBuf = device.createBuffer({
            size: objectSize,
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
        pv.setUint32(12, metadata.classIds.length, true);
        pv.setUint32(16, metadata.objectKeys.length, true);
        pv.setUint32(20, metadata.flags, true);
        const paramsBuf = this.createBuffer(
            device,
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(paramsData)
        );

        return {
            coverageBuf,
            classBuf,
            objectBuf,
            sampleSourcesBuf,
            paramsBuf,
            coverageSize,
            classSize,
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
            depthStencil: {
                format: 'depth32float',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
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
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 32 } },
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
                { binding: 1, resource: { buffer: countBuffers.coverageBuf } },
                { binding: 2, resource: { buffer: countBuffers.classBuf } },
                { binding: 3, resource: { buffer: countBuffers.objectBuf } },
                { binding: 4, resource: { buffer: countBuffers.sampleSourcesBuf } },
                { binding: 5, resource: { buffer: countBuffers.paramsBuf } },
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
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'discard',
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
        rawCoverage: Uint32Array,
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

                if (metadata.includeCoverage) {
                    const covered = rawCoverage[sourceIndex] ?? 0;
                    render.coverage = sampleCount > 0 ? covered / (totalPixels * sampleCount) : 0;
                }

                if (metadata.includeClasses) {
                    const classes: Record<string, number> = {};
                    for (let classIndex = 0; classIndex < metadata.classIds.length; classIndex++) {
                        const raw = rawClasses[sourceIndex * metadata.classIds.length + classIndex] ?? 0;
                        classes[metadata.classIds[classIndex]] = sampleCount > 0 ? raw / (totalPixels * sampleCount) : 0;
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
