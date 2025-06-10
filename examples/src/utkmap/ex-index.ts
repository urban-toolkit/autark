import { OsmLayersApi } from "./osm-layers-api";
import { OsmLayersPbf } from "./osm-layers-pbf";
import { GeojsonVis } from "./geojson-vis";
import { SpatialJoinVis } from "./spatial-join-vis";
import { SpatialJoinNearVis } from "./spatial-join-near-vis";
import { LayerOpacity } from "./layer-opacity";

export async function MapOsmLayersPbf() {
    const example = new OsmLayersPbf();
    example.buildHtml();
    await example.run();
}

export async function MapOsmLayersApi() {
    const example = new OsmLayersApi();
    example.buildHtml();
    await example.run();
}

export async function MapGeojsonVis() {
    const example = new GeojsonVis();
    example.buildHtml();
    await example.run();
}

export async function MapSpatialJoinVis() {
    const example = new SpatialJoinVis();
    example.buildHtml();
    await example.run();
}

export async function MapSpatialJoinNearVis() {
    const example = new SpatialJoinNearVis();
    example.buildHtml();
    await example.run();
}

export async function MapLayerOpacity() {
    const example = new LayerOpacity();
    example.buildHtml();
    await example.run();
}

