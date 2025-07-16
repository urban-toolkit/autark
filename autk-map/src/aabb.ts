import { Feature, FeatureCollection } from "geojson";
import { Box2D } from "./box2d";

/**
 * AABB (Axis-Aligned Bounding Box) class for managing bounding boxes of features.
 * It allows building bounding boxes from GeoJSON features and checking overlaps.
 */
export class AABB {
    /**
     * The count of bounding boxes.
     * @type {number}
     */
    protected _boxCount = 0;
    /**
     * A map to store bounding boxes with their IDs.
     * @type {Map<number, Box2D>}
     */
    protected _boxes: Map<number, Box2D>;

    /**
     * Initializes the AABB instance with an empty map of boxes.
     */
    constructor() {
        this._boxes = new Map<number, Box2D>;
    }

    /**
     * Gets the count of bounding boxes.
     * @returns {number} - The number of bounding boxes.
     */
    public get boxCount(): number {
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
