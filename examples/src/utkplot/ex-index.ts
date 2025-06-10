import { MapVega } from "./map-vega";

export async function PlotMapVega() {
    const example = new MapVega();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}