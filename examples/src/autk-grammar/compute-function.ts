import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class ComputeFunction {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
                },
                {
                    type: 'csv',
                    outputTableName: 'noise',
                    csvFileUrl: 'http://localhost:5173/data/noise.csv',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:3395',
                    },
                }
            ],
            compute: [
                {
                    dataRef: 'neighborhoods',
                    variableMapping: {
                        x: 'shape_area',
                        y: 'shape_leng',
                    },
                    outputColumnName: 'result',
                    wglsFunction: 'return x / y;',
                }
            ],
            map: {
                style: 'light',
                layerRefs: [
                    {
                        dataRef: 'neighborhoods',
                        getFnv: 'result'
                    }
                ]
            },
        }

        await this.autkGrammar.run(spec);

        let p = document.getElementById('app')?.appendChild(document.createElement("p"));
        
        if(p){
            p.textContent = "Computation ready. Check result on the console.";
        }
    }
}

async function main() {
    const example = new ComputeFunction();

    await example.run();
}

main();
