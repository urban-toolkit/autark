import { ILayerInfo, ILayerRenderInfo, ILayerData } from './interfaces';

import { Renderer } from './renderer';

import { Triangles2DLayer } from './layer-triangles2D';
import { PipelineBuildingSSAO } from './pipeline-triangle-ssao';
import { PipelineTrianglePicking } from './pipeline-triangle-picking';

export class Triangles3DLayer extends Triangles2DLayer {
    protected _normal!: number[];

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        super(layerInfo, layerRenderInfo, layerData, 3);
        this.computeNormals();
    }

    get normal(): number[] {
        return this._normal;
    }

    createPipeline(renderer: Renderer): void {
        // TODO: USE OTHER PIPELINES
        this._pipeline = new PipelineBuildingSSAO(renderer);
        this._pipeline.build(this);

        this._pipelinePicking = new PipelineTrianglePicking(renderer);
        this._pipelinePicking.build(this);
    }

    computeNormals(): void {
        // same size as the position array
        const len = this._position.length;

        // fills with invalid
        this._normal = new Array(len).fill(0);

        // iterate over the triangles
        for (let id = 0; id < this._indices.length; id += 3) {
            // vertices of the face
            const idVa = 3 * this._indices[id + 0];
            const idVb = 3 * this._indices[id + 1];
            const idVc = 3 * this._indices[id + 2];

            // coordinates of the vertices of the face
            const va: number[] = [];
            const vb: number[] = [];
            const vc: number[] = [];

            for (let i = 0; i < 3; i++) {
                va.push(this._position[idVa + i]);
                vb.push(this._position[idVb + i]);
                vc.push(this._position[idVc + i]);
            }

            // face vectors
            const ab = [va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]];
            const ac = [va[0] - vc[0], va[1] - vc[1], va[2] - vc[2]];

            // cross product
            const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];

            // accumulate
            for (let i = 0; i < 3; i++) {
                this._normal[idVa + i] += cross[i];
                this._normal[idVb + i] += cross[i];
                this._normal[idVc + i] += cross[i];
            }
        }

        // normalization
        for (let vid = 0; vid < this._normal.length; vid += 3) {
            const nrm: number[] = [];
            for (let i = 0; i < 3; i++) {
                nrm.push(this._normal[vid + i]);
            }
            const size = Math.sqrt(nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]);

            // divide each coordinate
            for (let i = 0; i < 3; i++) {
                this._normal[vid + i] = this._normal[vid + i] / size;
            }
        }
    }
}
