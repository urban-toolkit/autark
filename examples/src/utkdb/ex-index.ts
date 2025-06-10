import { OsmLoadPbf  } from "./osm-load-pbf";
import { LoadGeojson } from "./load-geojson";
import { LoadCsv } from "./load-csv";
import { SpatialJoin } from "./spatial-join";
import { SpatialJoinNear } from "./spatial-join-near";

export async function DbOsmLoadPbf() {
    const example = new OsmLoadPbf();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function DbLoadGeojson() {
    const example = new LoadGeojson();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function DbLoadCsv() {
    const example = new LoadCsv();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function DbSpatialJoin() {
    const example = new SpatialJoin();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}

export async function DbSpatialJoinNear() {
    const example = new SpatialJoinNear();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}
