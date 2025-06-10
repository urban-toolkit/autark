import {
    DbOsmLoadPbf,
    DbLoadGeojson,
    DbLoadCsv,
    DbSpatialJoin,
    DbSpatialJoinNear
} from "./utkdb/ex-index";

import { 
    MapOsmLayersPbf,
    MapOsmLayersApi,
    MapGeojsonVis,
    MapSpatialJoinVis,
    MapSpatialJoinNearVis,
    MapLayerOpacity
} from "./utkmap/ex-index";

import { 
    PlotMapVega 
} from "./utkplot/ex-index";

const examples: string[] = [
    'DbOsmLoadPbf',
    'DbLoadGeojson',
    'DbLoadCsv',
    'DbSpatialJoin',
    'DbSpatialJoinNear',
    'MapOsmLayersPbf',
    'MapOsmLayersApi',
    'MapGeojsonVis',
    'MapSpatialJoinVis',
    'MapSpatialJoinNearVis',
    'MapLayerOpacity',
    'PlotMapVega'
];

async function main() {
    const currentExample: string = examples[11];

    switch (currentExample) {
        //UtkDb
        case 'DbOsmLoadPbf': DbOsmLoadPbf(); break;
        case 'DbLoadGeojson': DbLoadGeojson(); break;
        case 'DbLoadCsv': DbLoadCsv(); break;
        case 'DbSpatialJoin': DbSpatialJoin(); break;
        case 'DbSpatialJoinNear': DbSpatialJoinNear(); break;
        // UtkMap
        case 'MapOsmLayersPbf': MapOsmLayersPbf(); break;
        case 'MapOsmLayersApi': MapOsmLayersApi(); break;
        case 'MapGeojsonVis': MapGeojsonVis(); break;
        case 'MapSpatialJoinVis': MapSpatialJoinVis(); break;
        case 'MapSpatialJoinNearVis': MapSpatialJoinNearVis(); break;
        case 'MapLayerOpacity': MapLayerOpacity(); break;
        // UTKPlot
        case 'PlotMapVega': PlotMapVega(); break;

        default:
            console.error(`Unknown example: ${currentExample}`);
        return;
    }
}

await main();