import { Camera, LayerComponent } from '@urban-toolkit/autk-core';
import { LayerData, LayerInfo, LayerRenderInfo, LayerThematic } from './types-layers';
import { Layer } from './layer';
import { Renderer } from './renderer';
import { PipelineSprite } from './pipeline-sprite';
import { PipelineSpritePicking } from './pipeline-sprite-picking';

export class SpriteLayer extends Layer {
    protected _pointInstances: Float32Array = new Float32Array(0);
    protected _components: LayerComponent[] = [];
    protected _thematic: Float32Array = new Float32Array(0);
    protected _thematicValidity: Float32Array = new Float32Array(0);
    protected _highlightedVertices: Float32Array = new Float32Array(0);
    protected _skippedVertices: Float32Array = new Float32Array(0);
    protected _pipeline!: PipelineSprite;
    protected _pipelinePicking!: PipelineSpritePicking;
    protected _highlightedIds: Set<number> = new Set();
    protected _skippedIds: Set<number> = new Set();
    protected _pointSize = 40;

    constructor(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        super(layerInfo, layerRenderInfo);
        this.loadLayerData(layerData);
    }

    override get supportsPicking(): boolean { return true; }
    override get supportsHighlight(): boolean { return true; }

    get components(): LayerComponent[] {
        return this._components;
    }

    get highlightedIds(): number[] {
        return Array.from(this._highlightedIds);
    }

    get pointInstances(): Float32Array {
        return this._pointInstances;
    }

    get pointSize(): number {
        return this._pointSize;
    }

    get thematic(): Float32Array {
        return this._thematic;
    }

    get thematicValidity(): Float32Array {
        return this._thematicValidity;
    }

    get highlightedVertices(): Float32Array {
        return this._highlightedVertices;
    }

    get skippedVertices(): Float32Array {
        return this._skippedVertices;
    }

    get instanceCount(): number {
        return this._pointInstances.length / 2;
    }

    loadLayerData(layerData: LayerData): void {
        this._pointInstances = layerData.pointInstances ?? new Float32Array(0);
        this._pointSize = layerData.pointSize ?? this._pointSize;
        this.loadComponent(layerData.components);
        this._resetInteractionState();

        if (layerData.thematic && layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        } else {
            this._thematic = new Float32Array(this.instanceCount);
            this._thematicValidity = new Float32Array(this.instanceCount);
            this._thematicValidity.fill(1);
        }
    }

    loadComponent(layerComponents: LayerComponent[]): void {
        const accum = { nPoints: 0, nTriangles: 0 };
        this._components = layerComponents.map((comp) => {
            accum.nPoints += comp.nPoints;
            accum.nTriangles += comp.nTriangles;
            return {
                ...comp,
                nPoints: accum.nPoints,
                nTriangles: accum.nTriangles,
            };
        });
    }

    loadThematic(layerThematic: LayerThematic[]): boolean {
        if (layerThematic.length !== this._components.length) {
            console.error(
                `SpriteLayer.loadThematic: expected ${this._components.length} thematic entries, got ${layerThematic.length}.`
            );
            return false;
        }

        const thematic = new Float32Array(this.instanceCount);
        const thematicValidity = new Float32Array(this.instanceCount);

        let offset = 0;
        for (let compId = 0; compId < layerThematic.length; compId++) {
            const start = compId > 0 ? this._components[compId - 1].nPoints : 0;
            const end = this._components[compId].nPoints;
            const count = end - start;
            thematic.fill(layerThematic[compId].value, offset, offset + count);
            thematicValidity.fill(layerThematic[compId].valid, offset, offset + count);
            offset += count;
        }

        if (offset !== this.instanceCount) {
            console.error(
                `SpriteLayer.loadThematic: filled ${offset} thematic values for ${this.instanceCount} instances.`
            );
            return false;
        }

        this._thematic = thematic;
        this._thematicValidity = thematicValidity;
        return true;
    }

    createPipeline(renderer: Renderer): void {
        this._pipeline = new PipelineSprite(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineSpritePicking(renderer);
        this._pipelinePicking.build(this);
    }

    renderPass(camera: Camera, passEncoder: GPURenderPassEncoder): void {
        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        if (this._dataIsDirty) {
            this._pipeline.updateVertexBuffers(this);
            this._pipelinePicking.updateVertexBuffers(this);
            this._dataIsDirty = false;
        }

        const scale = Math.min(Math.max(camera.getZoomScale(), 0.75), 6.0);
        this._pipeline.updateZIndex(this._layerInfo.zIndex);
        this._pipeline.updatePointSize(this._pointSize * scale);
        this._pipeline.renderPass(camera, passEncoder);
    }

    override renderPickingPass(camera: Camera): void {
        const scale = Math.min(Math.max(camera.getZoomScale(), 0.75), 6.0);
        this._pipelinePicking.updateZIndex(this._layerInfo.zIndex);
        this._pipelinePicking.updatePointSize(this._pointSize * scale);
        this._pipelinePicking.renderPass(camera);
    }

    toggleHighlightedIds(ids: number[]): void {
        for (const id of ids) {
            if (id < 0 || id >= this._components.length) { continue; }
            if (this._highlightedIds.has(id)) {
                this._highlightedIds.delete(id);
            } else {
                this._highlightedIds.add(id);
            }

            const start = id > 0 ? this._components[id - 1].nPoints : 0;
            const end = this._components[id].nPoints;
            for (let index = start; index < end; index++) {
                this._highlightedVertices[index] = 1 - this._highlightedVertices[index];
            }
        }
        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    override clearHighlightedIds(): void {
        this._highlightedIds.clear();
        this._highlightedVertices.fill(0);
        this.makeLayerRenderInfoDirty();
        this.makeLayerDataDirty();
    }

    override setHighlightedIds(ids: number[]): void {
        this.clearHighlightedIds();
        for (const id of ids) {
            if (id < 0 || id >= this._components.length) { continue; }
            this._highlightedIds.add(id);
            const start = id > 0 ? this._components[id - 1].nPoints : 0;
            const end = this._components[id].nPoints;
            this._highlightedVertices.fill(1, start, end);
        }
        this.makeLayerDataDirty();
    }

    override setSkippedIds(ids: number[]): void {
        this.clearSkippedIds();
        for (const id of ids) {
            if (id < 0 || id >= this._components.length) { continue; }
            this._skippedIds.add(id);
            const start = id > 0 ? this._components[id - 1].nPoints : 0;
            const end = this._components[id].nPoints;
            this._skippedVertices.fill(1, start, end);
        }
        this.makeLayerDataDirty();
    }

    override clearSkippedIds(): void {
        this._skippedIds.clear();
        this._skippedVertices.fill(0);
        this.makeLayerDataDirty();
    }

    override destroy(): void {
        this._pipeline?.destroy();
        this._pipelinePicking?.destroy();
    }

    private _resetInteractionState(): void {
        this._highlightedIds = new Set();
        this._skippedIds = new Set();
        this._highlightedVertices = new Float32Array(this.instanceCount);
        this._skippedVertices = new Float32Array(this.instanceCount);
    }
}
