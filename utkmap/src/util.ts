import { booleanOverlap } from "@turf/boolean-overlap";
import { Feature, LineString, FeatureCollection } from "geojson";


export class Box2D {
    public xmin: number = 0;
    public xmax: number = 0;
    public ymin: number = 0;
    public ymax: number = 0;

    public feats: Feature[] = [];

    constructor(feature: Feature) {
        const { coordinates } = <LineString>feature.geometry;

        this.xmin = coordinates[0][0];
        this.xmax = coordinates[0][0];
        this.ymin = coordinates[0][1];
        this.ymin = coordinates[0][1];

        this.add(feature);
    }

    add(feature: Feature) {
        const { coordinates } = <LineString>feature.geometry;

        for (let vId = 0; vId < coordinates.length; vId++) {
            const v = coordinates[vId];

            this.xmin = this.xmin > v[0] ? v[0] : this.xmin;
            this.xmax = this.xmax < v[0] ? v[0] : this.xmax;
            this.ymin = this.ymin > v[1] ? v[1] : this.ymin;
            this.ymax = this.ymax < v[1] ? v[1] : this.ymax;;
        }

        this.feats.push(feature);
    }

    overlaps(box: Box2D) {
        if (box.xmin > this.xmax ||
            box.xmax < this.xmin ||
            box.ymin > this.ymax ||
            box.ymax < this.ymin) {
            return false;
        }

        for (let nId = 0; nId < box.feats.length; nId++) {
            const pFeat = box.feats[nId];

            for (let fId = 0; fId < this.feats.length; fId++) {
                const tFeat = this.feats[fId];

                if (booleanOverlap(pFeat, tFeat)) {
                    return true;
                }
            }
        }

        return false;
    }

    expand(box: Box2D) {
        this.xmin = this.xmin > box.xmin ? box.xmin : this.xmin;
        this.xmax = this.xmax < box.xmax ? box.xmax : this.xmax;
        this.ymin = this.ymin > box.ymin ? box.ymin : this.ymin;
        this.ymax = this.ymax < box.ymax ? box.ymax : this.ymax;

        box.feats.forEach( (e: Feature) => this.feats.push(e) );
    }
}

export class AABB {
    protected _uniqueCount = 0;
    protected _boxes: Map<number, Box2D>;

    constructor() {
        this._boxes = new Map<number, Box2D>;
    }

    get uniqueCount(): number {
        return this._uniqueCount;
    }

    get boxes(): Map<number, Box2D> {
        return this._boxes;
    }

    build(geojson: FeatureCollection) {
        const collection: Feature[] = geojson['features'];

        for (const feature of collection) {
            const newBox = new Box2D(feature);
            const overlapId = this.overlaps(newBox);

            if (overlapId < 0) { 
                this._boxes.set(this._uniqueCount, newBox);
        
                // new building
                this._uniqueCount += 1;
            }
            else {
                const box = this._boxes.get(overlapId);

                if (!box) {
                    console.log('AABB: Invalid box.');
                    continue;
                }

                box.expand(newBox);
            }
        }

        console.log(this._boxes);
    }

    private overlaps(box: Box2D): number {
        for (const cBox of this._boxes) {
            if ( cBox[1].overlaps(box) ) {
                return cBox[0];
            }
        }

        return -1;
    }
}
