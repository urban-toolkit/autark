import { MapAdapter, MapSpec, Table } from 'urban-grammar';
import { Targets } from '../types';
import { AutkMap, MapStyle } from 'autk-map';

// export type MapSpec = {
//     style?: 'light' | 'dark',
//     layerRef: {
//         outputTableName: string,
//         opacity?: number,
//         isColorMap?: boolean,
//         colorMapInterpolator?: ColorMapInterpolator,
//         colorMapLabels?: string[],
//         pickedComps?: number[],
//         isSkip?: boolean,
//         isPick?: boolean,
//         getFnv?: string
//     }[]
// }

export function createMapAdapter(targets?: Targets): MapAdapter {

    // function print(db: SpatialDb, targets?: Targets): void {
    //     if(!targets || !targets.db)
    //         return

    //     const div = document.getElementById(targets.db);
    //     if (div) {
    //         const tables = db.tables;

    //         div.innerHTML += `<ul>`;
    //         for (const table of tables) {
    //             div.innerHTML += `<li>${table.name}: (${table.source}, ${table.type}) </li>`;
    //         }
    //         div.innerHTML += `</ul>`;

    //         div.innerHTML += `<p>Number of tables: ${tables.length}</p>`;
    //     }
    // }

    return {
        async resolveMap(tables: Table[], spec: MapSpec): Promise<void> {
            if(targets && targets.map){
                let canvas = document.getElementById("#"+targets.map);

                if(!canvas)
                    throw new Error("Could not find rendering target for map: "+targets.map);

                if(!(canvas instanceof HTMLCanvasElement))
                    throw new Error("Target for map is not a canvas: "+targets.map);

                const map = new AutkMap(canvas);
                
                if(spec.style)
                    MapStyle.setPredefinedStyle(spec.style)

                await map.init();
                
                
            }
        }
    }
}