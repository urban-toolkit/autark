import { MapVega } from "./map-vega";

export async function PlotMapVega() {
    const example = new MapVega();

    example.buildHtml();
    await example.run();
}