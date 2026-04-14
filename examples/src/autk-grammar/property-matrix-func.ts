import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

function generateImage(width: number, height: number, targetColor: number, colorPercentage: number): number[][] {
    const image: number[][] = [];
    const totalPixels = width * height;
    const targetPixelCount = Math.floor(totalPixels * colorPercentage);

    for (let row = 0; row < height; row++) {
        const rowData: number[] = [];
        for (let col = 0; col < width; col++) {
            rowData.push(Math.floor(Math.random() * 256));
        }
        image.push(rowData);
    }

    let pixelsSet = 0;
    for (let row = 0; row < height && pixelsSet < targetPixelCount; row++) {
        for (let col = 0; col < width && pixelsSet < targetPixelCount; col++) {
            image[row][col] = targetColor;
            pixelsSet++;
        }
    }

    return image;
}

export class PropertyMatrixFunc {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            compute: "output"
        });

        const imageWidth = 128;
        const imageHeight = 128;
        const targetColor = 128.0;

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
                                    name: 'Image A - 25% target color',
                                    image: generateImage(imageWidth, imageHeight, targetColor, 0.25),
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [-118.243683, 34.052235] },
                                properties: {
                                    name: 'Image B - 50% target color',
                                    image: generateImage(imageWidth, imageHeight, targetColor, 0.5),
                                },
                            },
                            {
                                type: 'Feature',
                                geometry: { type: 'Point', coordinates: [-87.629798, 41.878113] },
                                properties: {
                                    name: 'Image C - 75% target color',
                                    image: generateImage(imageWidth, imageHeight, targetColor, 0.75),
                                },
                            },
                        ],
                    },
                    outputTableName: 'images',
                }
            ],
            compute: [
                {
                    dataRef: 'images',
                    attributes: {
                        img: 'image',
                    },
                    attributeMatrices: {
                        img: { rows: imageHeight, cols: imageWidth },
                    },
                    outputColumnName: 'color_percentage',
                    wglsFunction: `
                        let targetColor = 128.0;
                        var matchCount = 0u;
                        var totalPixels = img_rows * img_cols;
                        for (var r = 0u; r < img_rows; r++) {
                            for (var c = 0u; c < img_cols; c++) {
                                let idx = r * img_cols + c;
                                if (img[idx] == targetColor) {
                                    matchCount++;
                                }
                            }
                        }
                        return (f32(matchCount) / f32(totalPixels)) * 100.0;
                    `,
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new PropertyMatrixFunc();

    await example.run();
}

main();
