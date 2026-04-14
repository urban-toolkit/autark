import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class PropertyArrayFunc {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            compute: "output"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonObject: {
                        type: 'FeatureCollection',
                        features: [
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [0, 0] },
                                properties: {
                                    name: 'Location A',
                                    temperature: 20.0,
                                    measurements: [1.0, 2.0, 3.0, 4.0, 5.0],
                                    weights: [0.5, 1.5, 2.0],
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [1, 1] },
                                properties: {
                                    name: 'Location B',
                                    temperature: 25.0,
                                    measurements: [2.0, 4.0, 6.0, 8.0, 10.0],
                                    weights: [1.0, 2.0, 3.0],
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [2, 2] },
                                properties: {
                                    name: 'Location C',
                                    temperature: 30.0,
                                    measurements: [1.5, 2.5, 3.5, 4.5, 5.5],
                                    weights: [0.8, 1.2],
                                },
                            },
                        ],
                    },
                    outputTableName: 'locations',
                }
            ],
            compute: [
                {
                    dataRef: 'locations',
                    attributes: {
                        values: 'measurements',
                    },
                    attributeArrays: {
                        values: 5,
                    },
                    outputColumnName: 'avg_measurement',
                    wglsFunction: `
                        var sum = 0.0;
                        for (var i = 0u; i < values_length; i++) {
                            sum += values[i];
                        }
                        return sum / f32(values_length);
                    `,
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new PropertyArrayFunc();

    await example.run();
}

main();
