import { Feature, Polygon } from "geojson";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorHeatmap extends Triangulator {

    static buildHeatmapGrid(nx: number, ny: number, bbox: Feature<Polygon>) : { flatCoords: number[], flatIds: number[] } {
        const flatCoords = [];
        const flatIds = [];

        const xStep = (+bbox.geometry.coordinates[0][0][0] - +bbox.geometry.coordinates[0][2][0]) / nx;
        const yStep = (+bbox.geometry.coordinates[0][0][1] - +bbox.geometry.coordinates[0][2][1]) / ny;

        for (let i = 0; i <= nx; i++) {
            for (let j = 0; j <= ny; j++) {
                flatCoords.push(+bbox.geometry.coordinates[0][0][0] + i * xStep, +bbox.geometry.coordinates[0][0][1] + j * yStep);
            }
        }

        for (let i = 0; i < nx; i++) {
            for (let j = 0; j < ny; j++) {
                const a = i * (ny + 1) + j;
                const b = a + 1;
                const c = a + ny + 1;
                const d = c + 1;

                flatIds.push(a, b, c, b, d, c);
            }
        }

        return { flatCoords, flatIds };
    }
}
