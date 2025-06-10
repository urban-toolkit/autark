import { OsmLayersApi } from "./osm-layers-api";
import { OsmLayersPbf } from "./osm-layers-pbf";
import { GeojsonVis } from "./geojson-vis";
import { SpatialJoinVis } from "./spatial-join-vis";
import { SpatialJoinNearVis } from "./spatial-join-near-vis";
import { LayerOpacity } from "./layer-opacity";

export async function MapOsmLayersPbf() {
    const example = new OsmLayersPbf();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function MapOsmLayersApi() {
    const example = new OsmLayersApi();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function MapGeojsonVis() {
    const example = new GeojsonVis();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function MapSpatialJoinVis() {
    const example = new SpatialJoinVis();
    example.buildHtmlNodes();

    await example.run();
    await example.print();
}

export async function MapSpatialJoinNearVis() {
    const example = new SpatialJoinNearVis();
    example.buildHtmlNodes();

    await example.run();
    await example.print();
}

export async function MapLayerOpacity() {
    const example = new LayerOpacity();
    example.buildHtmlNodes();

    await example.run();
    await example.print();
}

