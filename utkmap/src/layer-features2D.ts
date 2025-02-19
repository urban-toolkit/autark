import { ILayerComponent, ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from './interfaces';
import { ThematicAggregationLevel } from './constants';

import { Layer } from './layer';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { Pipeline } from './pipeline';
import { PipelineTriangleFlat } from './pipeline-triangle-flat';

export class Features2DLayer extends Layer {
    protected _position!: number[];
    protected _thematic!: number[];
    protected _indices!: number[];

    protected _components: ILayerComponent[] = [];

    protected _pipeline!: Pipeline;

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        super(layerInfo, layerRenderInfo);
        this.loadData(layerData);
    }

    get position(): number[] {
        return this._position;
    }

    get thematic(): number[] {
        return this._thematic;
    }

    get indices(): number[] {
        return this._indices;
    }

    createPipeline(renderer: Renderer): void {
        // TODO: USE OTHER PIPELINES
        this._pipeline = new PipelineTriangleFlat(renderer);
        this._pipeline.build(this);
    }

    loadData(layerData: ILayerData): void {
        this.loadGeometry(layerData.geometry);
        this.loadComponent(layerData.components);

        if (layerData.thematic && layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        }
    }

    loadGeometry(layerGeometry: ILayerGeometry[]): void {
        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            layerGeometry[id].indices?.forEach((a) => {
                const b = a + position.length / 3;
                indices.push(b);
            });

            // merges the position data
            layerGeometry[id].position.forEach((d, id) => {
                if (id % 3 === 2) {
                    d += this._layerInfo.zIndex;
                }
                position.push(d);
            });
        }

        this._position = position;
        this._indices = indices;
    }

    loadComponent(layerComponents: ILayerComponent[]): void {
        this._components = [];
        
        const accum = { nPoints: 0, nTriangles: 0 };
        for (let cId = 0; cId < layerComponents.length; cId++) {
            const comp = layerComponents[cId];
            
            accum.nPoints += comp.nPoints;
            accum.nTriangles += comp.nTriangles;

            this._components.push({
                nPoints: accum.nPoints,
                nTriangles: accum.nTriangles
            });
        }

        console.log(this._components);
    }

    loadThematic(layerThematic: ILayerThematic[]): void {
        const thematic: number[] = [];

        for (let compId = 0; compId < layerThematic.length; compId++) {
            let aggr:number[] = [];
            
            switch (layerThematic[compId].level) {
                case ThematicAggregationLevel.AGGREGATION_POINT:
                    aggr = this.aggregateThematicPoint(layerThematic[compId]);
                    break;
                case ThematicAggregationLevel.AGGREGATION_PRIMITIVE:
                    aggr = this.aggregateThematicPrimitive(compId, layerThematic[compId]);
                    break;
                case ThematicAggregationLevel.AGGREGATION_COMPONENT:
                    aggr = this.aggregateThematicComponenet(compId, layerThematic[compId]);
                    break;
                default:
                    console.error(`Unknown thematic layer aggregation type: ${layerThematic[compId].level}.`);
                    break;
            }

            for (let aId = 0; aId < aggr.length; aId++) {
                thematic.push(aggr[aId]);
            }
        }

        console.assert(thematic.length === this._position.length / 3);
        this._thematic = thematic;
    }

    renderPass(camera: Camera): void {
        if (this._renderInfoIsDirty) {
            this._pipeline.updateColorUniforms(this);
            this._renderInfoIsDirty = false;
        }

        this._pipeline.renderPass(camera);
    }

    private aggregateThematicPoint(layerThematic: ILayerThematic): number[] {
        return layerThematic.values;
    }

    private aggregateThematicPrimitive(component: number, layerThematic: ILayerThematic): number[] {
        // component points: start/end indices and number of points
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        // component triangles: start/end indices
        const sTriangle = component > 0 ? this._components[component - 1].nTriangles : 0;
        const eTriangle = this._components[component].nTriangles;

        const thematic = new Array(nPoint);

        for (let id = 3 * sTriangle; id < 3 * eTriangle; id++) {
            const vid = this._indices[id] - sPoint;
            const tid = Math.floor(id / 3) - sTriangle;

            thematic[vid] = layerThematic.values[tid];
        }

        return thematic;
    }

    private aggregateThematicComponenet(component: number, layerThematic: ILayerThematic): number[] {
        const sPoint = component > 0 ? this._components[component - 1].nPoints : 0;
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Array(nPoint);

        for (let vId = 0; vId < nPoint; vId++) {
            thematic[vId] = layerThematic.values[0];
        }

        return thematic;
    }
}