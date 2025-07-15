import { booleanEqual, booleanIntersects, lineToPolygon, point } from "@turf/turf";
import { Feature, LineString, FeatureCollection } from "geojson";

class Box2D {
    public xmin: number = 0;
    public xmax: number = 0;
    public ymin: number = 0;
    public ymax: number = 0;

    public feats: Feature[] = [];

    /**
     * Constructs a Box2D instance from a GeoJSON feature.
     * @param {Feature} feature - The GeoJSON feature to create the bounding box from.
     */
    constructor(feature: Feature) {

        const { coordinates } = <LineString>feature.geometry;

        this.xmin = coordinates[0][0];
        this.xmax = coordinates[0][0];
        this.ymin = coordinates[0][1];
        this.ymax = coordinates[0][1];

        this.add(feature);
    }

    /**
     * Adds a feature to the bounding box, updating its dimensions if necessary.
     * @param {Feature} feature - The GeoJSON feature to add.
     */
    private add(feature: Feature) {
        const { coordinates } = <LineString>feature.geometry;

        for (let vId = 0; vId < coordinates.length; vId++) {
            const v = coordinates[vId];

            this.xmin = this.xmin > v[0] ? v[0] : this.xmin;
            this.xmax = this.xmax < v[0] ? v[0] : this.xmax;
            this.ymin = this.ymin > v[1] ? v[1] : this.ymin;
            this.ymax = this.ymax < v[1] ? v[1] : this.ymax;
        }

        this.feats = Array.from(new Set([feature, ...this.feats]));
    }

    /**
     * Checks if this bounding box overlaps with another bounding box.
     * @param {Box2D} box - The other bounding box to check against.
     * @returns {boolean} - True if the boxes overlap, false otherwise.
     */
    public overlaps(box: Box2D) {
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
                    if (booleanEqual(point(tFirst), point(pFirst)) ||
                        booleanEqual(point(tFirst), point(pLast)) ||
                        booleanEqual(point(tLast), point(pFirst)) ||
                        booleanEqual(point(tLast), point(pLast))
                    ) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Expands the bounding box to include another bounding box.
     * @param {Box2D} box - The bounding box to expand to.
     */
    public expand(box: Box2D) {
        this.xmin = this.xmin > box.xmin ? box.xmin : this.xmin;
        this.xmax = this.xmax < box.xmax ? box.xmax : this.xmax;
        this.ymin = this.ymin > box.ymin ? box.ymin : this.ymin;
        this.ymax = this.ymax < box.ymax ? box.ymax : this.ymax;

        this.feats = Array.from(new Set([...box.feats, ...this.feats]))
    }
}

/**
 * AABB (Axis-Aligned Bounding Box) class for managing bounding boxes of features.
 * It allows building bounding boxes from GeoJSON features and checking overlaps.
 */
export class AABB {
    protected _boxCount = 0;
    protected _boxes: Map<number, Box2D>;

    /**
     * Constructs an AABB instance.
     * Initializes an empty map to hold bounding boxes.
     */
    constructor() {
        this._boxes = new Map<number, Box2D>;
    }

    /**
     * Gets the count of bounding boxes.
     * @returns {number} - The number of bounding boxes.
     */
    get boxCount(): number {
        return this._boxCount;
    }

    /**
     * Gets the map of bounding boxes.
     * @returns {Map<number, Box2D>} - The map containing bounding boxes.
     */
    get boxes(): Map<number, Box2D> {
        return this._boxes;
    }

    /**
     * Builds bounding boxes from a GeoJSON feature collection.
     * @param {FeatureCollection} geojson - The GeoJSON feature collection to build boxes from.
     */
    public buildGeoJsonBoxes(geojson: FeatureCollection) {
        const collection: Feature[] = geojson['features'];
        this.buildFeatureBoxes(collection);
    }

    /**
     * Builds bounding boxes from a collection of GeoJSON features.
     * @param {Feature[]} collection - The array of GeoJSON features to build boxes from.
     */
    public buildFeatureBoxes(collection: Feature[]) {
        for (const feature of collection) {

            if (!feature.geometry || feature.geometry.type !== 'LineString') {
                continue;
            }

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
                    if (!box) { continue; }

                    newBox.expand(box);

                    if (oId === 0) {
                        this._boxes.set(overId, newBox);
                    } else {
                        this._boxes.delete(overId);
                    }
                }
            }
        }
    }

    /**
     * Checks for overlaps with a given bounding box.
     * @param {Box2D} box - The bounding box to check for overlaps.
     * @returns {number[]} - An array of IDs of overlapping boxes.
     */
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
