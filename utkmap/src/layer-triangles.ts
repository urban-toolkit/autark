import { ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from "./interfaces";
import { ThematicAggregationLevel } from "./constants";

import { Layer } from "./layer";

import { Camera } from "./camera";
import { Renderer } from "./renderer";

import { Pipeline } from "./pipeline";
import { PipelineTriangleFlat } from "./pipeline-triangle-flat";

export class TrianglesLayer extends Layer {
    protected _position!: number[];
    protected _thematic!: number[];
    protected _indices!: number[];

    protected _components: { nPoints: number, nTriangles: number }[] = [];

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

    createPipeline(renderer: Renderer, camera: Camera): void {
        this._pipeline = new PipelineTriangleFlat(renderer);
        this._pipeline.build(this, camera);
    }

    loadData(layerData: ILayerData): void {
        this.loadGeometry(layerData.geometry);

        if (layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        }
    }

    loadGeometry(layerGeometry: ILayerGeometry[]): void {
        let position: number[] = [];
        let indices: number[] = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            // fix the index count
            if (layerGeometry[id].indices !== undefined) {
                const fix = layerGeometry[id].indices?.map(a => a + position.length / 3)
                indices = indices.concat(fix as number[]);
            }

            // merges the position data
            const pos_zfix = layerGeometry[id].position.map((d, id) => {
                if(id % 3 === 2) {
                    d += this._layerInfo.zIndex;
                }
                return d;
            });
            position = position.concat(pos_zfix);

            // stores the components
            const component = {
                nPoints: position.length / 3,
                nTriangles: indices.length / 3,
            }
            this._components.push(component);
        }

        this._position = position;
        this._indices = indices;
        this._thematic = [];
    }

    loadThematic(layerThematic: ILayerThematic[]): void {
        let thematic: number[] = [];
        for (let compId = 0; compId < layerThematic.length; compId++) {
            switch (layerThematic[compId].level) {
                case ThematicAggregationLevel.AGGREGATION_POINT:
                    thematic = thematic.concat(this.aggregateThematicPoint(layerThematic[compId]));
                    break;
                case ThematicAggregationLevel.AGGREGATION_PRIMITIVE:
                    thematic = thematic.concat(this.aggregateThematicPrimitive(compId, layerThematic[compId]));
                    break;
                case ThematicAggregationLevel.AGGREGATION_COMPONENT:
                    thematic = thematic.concat(this.aggregateThematicComponenet(compId, layerThematic[compId]));
                    break;
                default:
                    console.error(`Unknown thematic layer aggregation type: ${layerThematic[compId].level}.`);
                    break;
            }
        }
        this._thematic = thematic;
    }

    renderPass(camera: Camera): void {
        this._pipeline.renderPass(this, camera);
    }

    private aggregateThematicPoint(layerThematic: ILayerThematic): number[] {
        return layerThematic.values;
    }

    private aggregateThematicPrimitive(component: number, layerThematic: ILayerThematic): number[] {
        // component points: start/end indices and number of points 
        const sPoint = (component > 0 ? this._components[component - 1].nPoints : 0);
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        // component triangles: start/end indices 
        const sTriangle = (component > 0 ? this._components[component - 1].nTriangles : 0);
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
        const sPoint = (component > 0 ? this._components[component - 1].nPoints : 0);
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Array(nPoint);

        for (let vId = 0; vId < nPoint; vId++) {
            thematic[vId] = layerThematic.values[0];
        }

        return thematic;
    }
}