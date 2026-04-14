import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class PropertyLinearRegression {
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
                                geometry: { type: 'Point', coordinates: [-73.935242, 40.73061] },
                                properties: {
                                    name: 'Dataset A - House Prices',
                                    x_train: [1000, 1500, 2000, 2500, 3000, 3500, 4000],
                                    y_train: [200, 250, 300, 350, 400, 450, 500],
                                    x_predict: 2750,
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [-118.243683, 34.052235] },
                                properties: {
                                    name: 'Dataset B - Temperature vs Ice Cream Sales',
                                    x_train: [20, 22, 25, 28, 30, 32, 35],
                                    y_train: [50, 60, 80, 100, 120, 140, 170],
                                    x_predict: 27,
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [-87.629798, 41.878113] },
                                properties: {
                                    name: 'Dataset C - Study Hours vs Test Score',
                                    x_train: [1, 2, 3, 4, 5, 6, 7],
                                    y_train: [55, 62, 68, 75, 81, 87, 93],
                                    x_predict: 4.5,
                                },
                            },
                        ],
                    },
                    outputTableName: 'datasets',
                }
            ],
            compute: [
                {
                    dataRef: 'datasets',
                    attributes: {
                        x_values: 'x_train',
                        y_values: 'y_train',
                        x_pred: 'x_predict',
                    },
                    attributeArrays: {
                        x_values: 7,
                        y_values: 7,
                    },
                    outputColumnName: 'predicted_value',
                    wglsFunction: `
                        let n = f32(x_values_length);
                        var sum_x = 0.0;
                        var sum_y = 0.0;
                        var sum_xy = 0.0;
                        var sum_x2 = 0.0;
                        for (var i = 0u; i < x_values_length; i++) {
                            let x = x_values[i];
                            let y = y_values[i];
                            sum_x += x;
                            sum_y += y;
                            sum_xy += x * y;
                            sum_x2 += x * x;
                        }
                        let slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
                        let intercept = (sum_y - slope * sum_x) / n;
                        return slope * x_pred + intercept;
                    `,
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new PropertyLinearRegression();

    await example.run();
}

main();
