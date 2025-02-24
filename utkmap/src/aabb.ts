import { booleanEqual, booleanIntersects, lineToPolygon, point } from "@turf/turf";
import { Feature, LineString, FeatureCollection } from "geojson";

class Box2D {
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
        this.ymax = coordinates[0][1];

        this.add(feature);
    }

    private add(feature: Feature) {
        const { coordinates } = <LineString>feature.geometry;

        for (let vId = 0; vId < coordinates.length; vId++) {
            const v = coordinates[vId];

            this.xmin = this.xmin > v[0] ? v[0] : this.xmin;
            this.xmax = this.xmax < v[0] ? v[0] : this.xmax;
            this.ymin = this.ymin > v[1] ? v[1] : this.ymin;
            this.ymax = this.ymax < v[1] ? v[1] : this.ymax;
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
            const pLine = <LineString>box.feats[nId].geometry;

            const pLast = pLine.coordinates[pLine.coordinates.length - 1];
            const pFirst = pLine.coordinates[0];

            for (let fId = 0; fId < this.feats.length; fId++) {
                const tLine = <LineString>this.feats[fId].geometry;

                const tLast = tLine.coordinates[tLine.coordinates.length - 1];
                const tFirst = tLine.coordinates[0];

                if (booleanEqual(point(pFirst), point(pLast)) &&
                    booleanEqual(point(tFirst), point(tLast))) {
                    if (booleanIntersects(lineToPolygon(pLine), lineToPolygon(tLine))) {
                        return true;
                    }
                }
                else {
                    if (booleanEqual(point(tFirst), point(pFirst))  ||
                        booleanEqual(point(tFirst), point(pLast ))  ||
                        booleanEqual(point(tLast ), point(pFirst))  ||
                        booleanEqual(point(tLast ), point(pLast )) 
                    ) {
                        return true;
                    }
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

        this.feats.push(...box.feats);
    }
}

export class AABB {
    protected _boxCount = 0;
    protected _boxes: Map<number, Box2D>;

    constructor() {
        this._boxes = new Map<number, Box2D>;
    }

    get boxCount(): number {
        return this._boxCount;
    }

    get boxes(): Map<number, Box2D> {
        return this._boxes;
    }

    buildGeoJsonBoxes(geojson: FeatureCollection) {
        const collection: Feature[] = geojson['features'];
        this.buildFeatureBoxes(collection);
    }

    buildFeatureBoxes(collection: Feature[]) {
        for (const feature of collection) {
            const newBox = new Box2D(feature);

            const overlapIds = this.overlaps(newBox);

            if (overlapIds.length === 0) {
                this._boxes.set(this._boxCount, newBox);
                // new building
                this._boxCount += 1;
            }
            else {
                for (let oId = 0; oId < overlapIds.length; oId++) {
                    const overId = overlapIds[oId];
                    const box = this._boxes.get(overId);

                    if (box) {
                        box.expand(newBox);
                    }
                }
            }
        }
    }

    private overlaps(box: Box2D): number[] {
        const overIds = [];

        for (const cBox of this._boxes) {
            if (cBox[1].overlaps(box)) {
                overIds.push(cBox[0]);
            }
        }

        return overIds;
    }
}
