import { booleanEqual, point, booleanIntersects, lineToPolygon } from "@turf/turf";
import { Feature, LineString } from "geojson";

/**
 * Constructs a Box2D instance from a GeoJSON feature.
 */
export class Box2D {
    /**
     * The minimum x-coordinate of the bounding box.
     * @type {number}
     */
    public xmin: number = 0;

    /**
     * The maximum x-coordinate of the bounding box.
     * @type {number}
     */
    public xmax: number = 0;

    /**
     * The minimum y-coordinate of the bounding box.
     * @type {number}
     */
    public ymin: number = 0;

    /**
     * The maximum y-coordinate of the bounding box.
     * @type {number}
     */
    public ymax: number = 0;

    /**
     * The features contained within the bounding box.
     * @type {Feature[]}
     */
    public feats: Feature[] = [];

    /**
     * Initializes the bounding box dimensions based on the feature's coordinates.
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