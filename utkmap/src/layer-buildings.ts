import { ILayerInfo, ILayerRenderInfo, ILayerData } from "./interfaces";

import { Camera } from "./camera";
import { Renderer } from "./renderer";

import { TrianglesLayer } from "./layer-triangles";
import { PipelineBuildingFlat } from "./pipeline-building-flat";

export class BuildingsLayer extends TrianglesLayer {
    protected _normal!: number[];

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        super(layerInfo, layerRenderInfo, layerData);
        this.computeNormals();
    }

    get normal(): number[] {
        return this._normal;
    }

    createPipeline(renderer: Renderer, camera: Camera): void {
        this._pipeline = new PipelineBuildingFlat(renderer);
        this._pipeline.build(this, camera);
    }

    computeNormals(): void {
        // same size as the position array
        const len = this._position.length;

        // fills with invalid
        this._normal = new Array(len).fill(0);

        console.log(this._position);
        console.log(this._indices);

        // iterate over the triangles
        for (let id = 0; id < this._indices.length; id += 3) {
            // vertices of the face
            const idVa = 3 * this._indices[id+0];
            const idVb = 3 * this._indices[id+1];
            const idVc = 3 * this._indices[id+2];
            console.log(idVa, idVb, idVc);

            // coordinates of the vertices of the face
            const va = this._position.slice(idVa, 3);
            const vb = this._position.slice(idVb, 3);
            const vc = this._position.slice(idVc, 3);
            console.log(va);
            console.log(vb);
            console.log(vc);

            if(id > 9) {
                console.log(this._position);
                console.log(this._indices);
                return;
            }

            // face vectors
            const ab = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
            const ac = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];

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
            const nrm = this._normal.slice(vid, 3);
            const size = Math.sqrt(nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]);

            // divide each coordinate
            for (let i = 0; i < 3; i++) {
                this._normal[vid + i] /= size;
            }
        }

    }
}